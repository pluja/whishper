from __future__ import annotations

# Media work directories share this prefix, so a restarted worker can remove
# the ones a crash left behind.
WORK_DIRECTORY_PREFIX = "anysub-media-"
