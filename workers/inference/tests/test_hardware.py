import os
from pathlib import Path
from types import SimpleNamespace

import pytest

from anysub_worker.config import AdapterRuntimeSettings
from anysub_worker.hardware import (
    cuda_problem,
    describe_hardware,
    detect_hardware,
    usable_cpu_count,
)
from anysub_worker.models import WorkerDevice

GIB = 1024**3


def write_host_files(root: Path, *, total_gib: int = 32, available_gib: int = 20) -> None:
    proc = root / "proc"
    proc.mkdir()
    (proc / "meminfo").write_text(
        f"MemTotal:       {total_gib * 1024**2} kB\nMemAvailable:   {available_gib * 1024**2} kB\n",
        encoding="utf-8",
    )
    (proc / "cpuinfo").write_text(
        "processor: 0\nmodel name: Test Ryzen CPU\n",
        encoding="utf-8",
    )


def runtime_settings(*, device: WorkerDevice = "cpu") -> AdapterRuntimeSettings:
    return AdapterRuntimeSettings(device=device)


def test_detect_hardware_respects_container_memory_limit(tmp_path: Path) -> None:
    write_host_files(tmp_path)
    cgroup = tmp_path / "cgroup"
    cgroup.mkdir()
    (cgroup / "memory.max").write_text(str(8 * GIB), encoding="utf-8")
    (cgroup / "memory.current").write_text(str(2 * GIB), encoding="utf-8")

    torch = SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: False),
        version=SimpleNamespace(cuda=None, hip=None),
    )
    hardware = detect_hardware(
        runtime_settings(),
        proc_root=tmp_path / "proc",
        cgroup_root=cgroup,
        torch_module=torch,
    )

    assert hardware.device == "cpu"
    assert hardware.cpu.model == "Test Ryzen CPU"
    assert hardware.memory.total_bytes == 8 * GIB
    assert hardware.memory.available_bytes == 6 * GIB
    assert hardware.gpus == ()


def test_detect_hardware_reports_usable_cuda_memory(tmp_path: Path) -> None:
    write_host_files(tmp_path)
    cgroup = tmp_path / "cgroup"
    cgroup.mkdir()
    (cgroup / "memory.max").write_text("max", encoding="utf-8")

    properties = SimpleNamespace(name="Test GPU", total_memory=12 * GIB)
    torch = SimpleNamespace(
        cuda=SimpleNamespace(
            is_available=lambda: True,
            device_count=lambda: 1,
            get_device_properties=lambda _index: properties,
        ),
        version=SimpleNamespace(cuda="12.8", hip=None),
    )
    hardware = detect_hardware(
        runtime_settings(device="cuda"),
        proc_root=tmp_path / "proc",
        cgroup_root=cgroup,
        torch_module=torch,
    )

    assert hardware.gpus[0].name == "Test GPU"
    assert hardware.gpus[0].backend == "cuda"
    assert hardware.gpus[0].total_memory_bytes == 12 * GIB


def fake_cuda_torch(
    *,
    cuda_version: str | None = "12.8",
    capabilities: tuple[tuple[int, int], ...] = ((8, 6),),
    architectures: tuple[str, ...] = ("sm_70", "sm_75", "sm_80", "sm_86", "sm_90", "sm_120"),
) -> SimpleNamespace:
    return SimpleNamespace(
        version=SimpleNamespace(cuda=cuda_version, hip=None),
        cuda=SimpleNamespace(
            is_available=lambda: bool(capabilities),
            device_count=lambda: len(capabilities),
            get_arch_list=lambda: list(architectures),
            get_device_capability=lambda index: capabilities[index],
            get_device_name=lambda index: f"Test GPU {index}",
        ),
    )


def test_cuda_check_ignores_cpu_workers() -> None:
    assert cuda_problem(runtime_settings(), torch_module=fake_cuda_torch(capabilities=())) is None


def test_cuda_check_accepts_a_supported_gpu() -> None:
    torch = fake_cuda_torch(capabilities=((8, 6), (12, 0)))
    assert cuda_problem(runtime_settings(device="cuda"), torch_module=torch) is None


def test_cuda_check_rejects_a_cpu_image() -> None:
    problem = cuda_problem(
        runtime_settings(device="cuda"), torch_module=fake_cuda_torch(cuda_version=None)
    )
    assert problem is not None
    assert "built for CPU" in problem


def test_cuda_check_rejects_a_container_without_a_gpu() -> None:
    problem = cuda_problem(
        runtime_settings(device="cuda"), torch_module=fake_cuda_torch(capabilities=())
    )
    assert problem is not None
    assert "NVIDIA Container Toolkit" in problem


def test_cuda_check_rejects_a_gpu_older_than_the_compiled_kernels() -> None:
    problem = cuda_problem(
        runtime_settings(device="cuda"), torch_module=fake_cuda_torch(capabilities=((6, 1),))
    )
    assert problem is not None
    assert "Test GPU 0 has compute capability 6.1" in problem


def test_cuda_check_accepts_a_newer_gpu_through_ptx() -> None:
    torch = fake_cuda_torch(capabilities=((13, 0),), architectures=("sm_90", "compute_90"))
    assert cuda_problem(runtime_settings(device="cuda"), torch_module=torch) is None


def test_describe_hardware_names_the_device_and_gpus(tmp_path: Path) -> None:
    write_host_files(tmp_path)
    torch = SimpleNamespace(
        version=SimpleNamespace(cuda="12.8", hip=None),
        cuda=SimpleNamespace(
            is_available=lambda: True,
            device_count=lambda: 1,
            get_device_properties=lambda index: SimpleNamespace(
                name="Test RTX", total_memory=12 * GIB
            ),
        ),
    )
    hardware = detect_hardware(
        runtime_settings(device="cuda"),
        proc_root=tmp_path / "proc",
        cgroup_root=tmp_path / "missing",
        torch_module=torch,
    )

    summary = describe_hardware(hardware)

    assert "device=cuda gpus=" in summary
    assert "gpus=Test RTX (12.0 GiB)" in summary


def test_usable_cpu_count_honours_a_container_cpu_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(os, "sched_getaffinity", lambda _pid: set(range(16)))
    (tmp_path / "cpu.max").write_text("250000 100000\n", encoding="utf-8")

    assert usable_cpu_count(cgroup_root=tmp_path) == 3


def test_usable_cpu_count_uses_the_affinity_without_a_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(os, "sched_getaffinity", lambda _pid: set(range(6)))
    (tmp_path / "cpu.max").write_text("max 100000\n", encoding="utf-8")

    assert usable_cpu_count(cgroup_root=tmp_path) == 6
    assert usable_cpu_count(cgroup_root=tmp_path / "missing") == 6
