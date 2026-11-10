"""Downloads one Whisper model into the cache. Runs as a child process so that a
cancelled download stops at once instead of finishing in an abandoned thread."""

from __future__ import annotations

import sys


def main() -> int:
    model_id, cache_directory = sys.argv[1], sys.argv[2]
    try:
        from faster_whisper.utils import download_model

        download_model(model_id, cache_dir=cache_directory)
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
