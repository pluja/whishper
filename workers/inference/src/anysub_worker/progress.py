from __future__ import annotations

from .adapter import ProgressReporter


def progress_span(report: ProgressReporter, start: float, end: float) -> ProgressReporter:
    """Maps a stage's own 0 to 1 progress onto its share of the job's progress."""

    async def report_within_span(fraction: float, message: str) -> None:
        await report(start + (end - start) * fraction, message)

    return report_within_span
