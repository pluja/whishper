from __future__ import annotations

import os
from importlib import import_module
from pathlib import Path
from typing import Any

from .config import WorkerSettings
from .models import WorkerCpu, WorkerGpu, WorkerHardware, WorkerMemory

KIB = 1024


def detect_hardware(
    settings: WorkerSettings,
    *,
    proc_root: Path = Path("/proc"),
    cgroup_root: Path = Path("/sys/fs/cgroup"),
    torch_module: Any | None = None,
) -> WorkerHardware:
    torch = torch_module if torch_module is not None else _optional_torch()
    return WorkerHardware(
        device=settings.device,
        computeType=settings.compute_type,
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
    total_bytes, available_bytes = _detect_memory(proc_root, cgroup_root)
    return WorkerMemory(totalBytes=total_bytes, availableBytes=available_bytes)


def _detect_memory(proc_root: Path, cgroup_root: Path) -> tuple[int, int]:
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

    limit = _positive_int_file(cgroup_root / "memory.max")
    if limit is None:
        return host_total, host_available

    current = _positive_int_file(cgroup_root / "memory.current", allow_zero=True) or 0
    effective_total = min(host_total, limit)
    cgroup_available = max(0, limit - current)
    return effective_total, min(host_available, effective_total, cgroup_available)


def _positive_int_file(path: Path, *, allow_zero: bool = False) -> int | None:
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not value.isdigit():
        return None
    parsed = int(value)
    if parsed > 0 or (allow_zero and parsed == 0):
        return parsed
    return None


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
