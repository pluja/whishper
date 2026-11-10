from __future__ import annotations

import math
import os
import shutil
from importlib import import_module
from pathlib import Path
from typing import Any

from .config import AdapterRuntimeSettings
from .models import WorkerCpu, WorkerGpu, WorkerHardware, WorkerMemory, WorkerStorage

KIB = 1024


def detect_hardware(
    runtime: AdapterRuntimeSettings,
    *,
    proc_root: Path = Path("/proc"),
    cgroup_root: Path = Path("/sys/fs/cgroup"),
    torch_module: Any | None = None,
) -> WorkerHardware:
    torch = torch_module if torch_module is not None else _optional_torch()
    return WorkerHardware(
        device=runtime.device,
        cpu=WorkerCpu(
            model=_cpu_model(proc_root),
            logicalCores=_logical_cores(),
        ),
        memory=detect_memory(proc_root=proc_root, cgroup_root=cgroup_root),
        gpus=_detect_gpus(torch),
    )


def detect_memory(
    *,
    proc_root: Path = Path("/proc"),
    cgroup_root: Path = Path("/sys/fs/cgroup"),
) -> WorkerMemory:
    values: dict[str, int] = {}
    try:
        for line in (proc_root / "meminfo").read_text(encoding="utf-8").splitlines():
            key, separator, remainder = line.partition(":")
            if not separator:
                continue
            raw_value = remainder.strip().split(maxsplit=1)[0]
            if raw_value.isdigit():
                values[key] = int(raw_value) * KIB
    except OSError:
        pass

    host_total = max(1, values.get("MemTotal", 1))
    host_available = values.get(
        "MemAvailable",
        values.get("MemFree", 0) + values.get("Buffers", 0) + values.get("Cached", 0),
    )
    host_available = min(host_total, max(0, host_available))

    # cgroup v2 writes "max" when the container has no memory limit.
    limit = _read_int_file(cgroup_root / "memory.max")
    if not limit:
        return WorkerMemory(totalBytes=host_total, availableBytes=host_available)

    current = _read_int_file(cgroup_root / "memory.current") or 0
    total = min(host_total, limit)
    cgroup_available = max(0, limit - current)
    return WorkerMemory(
        totalBytes=total, availableBytes=min(host_available, total, cgroup_available)
    )


def detect_storage(path: Path) -> WorkerStorage | None:
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        return None
    if usage.total <= 0:
        return None
    return WorkerStorage(totalBytes=usage.total, availableBytes=min(usage.free, usage.total))


def _read_int_file(path: Path) -> int | None:
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return int(value) if value.isdigit() else None


def _cpu_model(proc_root: Path) -> str | None:
    try:
        for line in (proc_root / "cpuinfo").read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition(":")
            if separator and key.strip() in {"model name", "Hardware", "Processor"}:
                model = value.strip()
                if model:
                    return model
    except OSError:
        pass
    return None


def _logical_cores() -> int:
    try:
        affinity = os.sched_getaffinity(0)
        if affinity:
            return len(affinity)
    except (AttributeError, OSError):
        pass
    return max(1, os.cpu_count() or 1)


def usable_cpu_count(*, cgroup_root: Path = Path("/sys/fs/cgroup")) -> int:
    cores = _logical_cores()
    quota = _cpu_quota(cgroup_root)
    return min(cores, quota) if quota else cores


# A docker --cpus limit shows up only as a cgroup quota, not in the CPU affinity.
def _cpu_quota(cgroup_root: Path) -> int | None:
    try:
        fields = (cgroup_root / "cpu.max").read_text(encoding="utf-8").split()
    except OSError:
        return None
    if len(fields) != 2 or not fields[0].isdigit() or not fields[1].isdigit():
        return None
    quota, period = int(fields[0]), int(fields[1])
    if period == 0:
        return None
    return max(1, math.ceil(quota / period))


def _optional_torch() -> Any | None:
    try:
        return import_module("torch")
    except (ImportError, OSError):
        return None


def _detect_gpus(torch: Any | None) -> tuple[WorkerGpu, ...]:
    if torch is None:
        return ()
    try:
        if not torch.cuda.is_available():
            return ()
        backend = "rocm" if getattr(torch.version, "hip", None) else "cuda"
        return tuple(
            WorkerGpu(
                name=str(properties.name),
                backend=backend,
                totalMemoryBytes=int(properties.total_memory),
            )
            for index in range(int(torch.cuda.device_count()))
            if (properties := torch.cuda.get_device_properties(index)).total_memory > 0
        )
    except (AttributeError, RuntimeError, TypeError, ValueError):
        return ()


def cuda_problem(runtime: AdapterRuntimeSettings, *, torch_module: Any | None = None) -> str | None:
    if runtime.device != "cuda":
        return None
    torch = torch_module if torch_module is not None else _optional_torch()
    if torch is None or getattr(torch.version, "cuda", None) is None:
        return (
            "ANYSUB_DEVICE=cuda, but this worker image was built for CPU. Start Anysub with "
            "compose.cuda.yaml, which runs the CUDA worker image."
        )
    try:
        device_count = int(torch.cuda.device_count()) if torch.cuda.is_available() else 0
    except RuntimeError as error:
        return f"ANYSUB_DEVICE=cuda, but CUDA failed to start: {error}"
    if device_count == 0:
        return (
            "ANYSUB_DEVICE=cuda, but no NVIDIA GPU is visible in the worker container. "
            "Install the NVIDIA Container Toolkit on the host and start Anysub with "
            "compose.cuda.yaml, which gives the worker the GPU."
        )
    compiled = list(torch.cuda.get_arch_list())
    for index in range(device_count):
        capability = tuple(torch.cuda.get_device_capability(index))
        if not _runs_on(capability, compiled):
            name = torch.cuda.get_device_name(index)
            return (
                f"{name} has compute capability {capability[0]}.{capability[1]}, which this "
                f"worker image does not support (built for {', '.join(compiled)}). The CUDA "
                "image needs a Volta or newer GPU. Run Anysub without compose.cuda.yaml to use "
                "the CPU."
            )
    return None


def _runs_on(capability: tuple[int, ...], compiled_architectures: list[str]) -> bool:
    major, minor = capability[0], capability[1]
    device = major * 10 + minor
    for architecture in compiled_architectures:
        kind, _, number = architecture.partition("_")
        if not number.isdigit():
            continue
        version = int(number)
        # Kernels run on later minor versions of their major version, and PTX
        # is compiled just in time for any newer GPU.
        if kind == "sm" and version // 10 == major and version <= device:
            return True
        if kind == "compute" and version <= device:
            return True
    return False


def describe_hardware(hardware: WorkerHardware) -> str:
    gpus = ", ".join(
        f"{gpu.name} ({gpu.total_memory_bytes / 1024**3:.1f} GiB)" for gpu in hardware.gpus
    )
    return f"device={hardware.device} gpus={gpus or 'none'} cores={hardware.cpu.logical_cores}"
