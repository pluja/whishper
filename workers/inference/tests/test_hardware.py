from pathlib import Path
from types import SimpleNamespace

from anysub_worker.config import WorkerSettings
from anysub_worker.hardware import detect_hardware

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


def worker_settings(*, device: str = "cpu") -> WorkerSettings:
    return WorkerSettings(
        worker_token="test-worker-token-0123456789",
        device=device,
        compute_type="int8" if device == "cpu" else "float16",
    )


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
        worker_settings(),
        proc_root=tmp_path / "proc",
        cgroup_root=cgroup,
        torch_module=torch,
    )

    assert hardware.device == "cpu"
    assert hardware.compute_type == "int8"
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
        worker_settings(device="cuda"),
        proc_root=tmp_path / "proc",
        cgroup_root=cgroup,
        torch_module=torch,
    )

    assert hardware.gpus[0].name == "Test GPU"
    assert hardware.gpus[0].backend == "cuda"
    assert hardware.gpus[0].total_memory_bytes == 12 * GIB
