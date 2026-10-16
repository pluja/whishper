from __future__ import annotations

import logging
import re
from decimal import Decimal
from pathlib import Path

from ..models import MediaProbeStream
from .errors import MediaPreparationError
from .process import (
    FRAME_RATE_DETECTION_FLOOR_SECONDS,
    FRAME_RATE_DETECTION_SECONDS_PER_MEDIA_SECOND,
    run_media_tool,
    scaled_timeout_seconds,
)

LOGGER = logging.getLogger(__name__)


async def detect_frame_rate_mode(
    source_path: Path, video: MediaProbeStream, duration_us: int
) -> str:
    try:
        result = await run_media_tool(
            [
                "-hide_banner",
                "-nostdin",
                "-i",
                str(source_path),
                "-map",
                "0:V:0",
                "-vf",
                "vfrdet",
                "-an",
                "-f",
                "null",
                "-",
            ],
            scaled_timeout_seconds(
                duration_us,
                FRAME_RATE_DETECTION_SECONDS_PER_MEDIA_SECOND,
                FRAME_RATE_DETECTION_FLOOR_SECONDS,
            ),
        )
    except MediaPreparationError as error:
        LOGGER.warning("frame rate detection failed: %s", error)
        return "unknown"
    match = re.search(
        r"VFR:([0-9.]+)(?: \(\d+/\d+\) min: (\d+) max: (\d+) avg: \d+)?",
        result.stderr,
    )
    if not match:
        return "unknown"
    ratio = Decimal(match.group(1))
    if ratio <= Decimal("0.0001"):
        return "constant"

    details = video.video
    if (
        details is not None
        and details.frame_rate is not None
        and details.frame_rate == details.average_frame_rate
        and match.group(2) is not None
        and match.group(3) is not None
        and int(match.group(3)) - int(match.group(2)) <= 1
    ):
        return "constant"
    return "variable"
