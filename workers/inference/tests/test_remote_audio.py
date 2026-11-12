from itertools import pairwise

from anysub_worker.remote.audio import parse_silences, plan_cuts

MINUTE_US = 60_000_000


def test_short_media_is_one_part() -> None:
    assert plan_cuts(9 * MINUTE_US, [], chunk_us=10 * MINUTE_US) == [0, 9 * MINUTE_US]


def test_cuts_move_back_to_the_latest_pause_before_the_limit() -> None:
    pause = (9 * MINUTE_US + 20_000_000, 9 * MINUTE_US + 22_000_000)
    earlier_pause = (8 * MINUTE_US + 40_000_000, 8 * MINUTE_US + 41_000_000)

    cuts = plan_cuts(
        25 * MINUTE_US,
        [earlier_pause, pause],
        chunk_us=10 * MINUTE_US,
        search_us=90_000_000,
    )

    assert cuts[1] == 9 * MINUTE_US + 21_000_000
    assert cuts[0] == 0
    assert cuts[-1] == 25 * MINUTE_US
    assert all(end - start <= 10 * MINUTE_US for start, end in pairwise(cuts))


def test_without_a_pause_nearby_the_cut_falls_on_the_limit() -> None:
    distant_pause = (2 * MINUTE_US, 2 * MINUTE_US + 1_000_000)

    cuts = plan_cuts(21 * MINUTE_US, [distant_pause], chunk_us=10 * MINUTE_US, search_us=90_000_000)

    assert cuts == [0, 10 * MINUTE_US, 20 * MINUTE_US, 21 * MINUTE_US]


def test_parses_ffmpeg_silence_metadata() -> None:
    log = (
        "frame:12 pts:1000 pts_time:1.5\n"
        "lavfi.silence_start=1.5\n"
        "frame:20 pts:2000 pts_time:2.25\n"
        "lavfi.silence_end=2.25\n"
        "lavfi.silence_duration=0.75\n"
        "lavfi.silence_start=-0.01\n"
    )

    assert parse_silences(log) == [(1_500_000, 2_250_000)]


def test_silences_count_from_the_start_of_the_file() -> None:
    log = "lavfi.silence_start=11.4\nlavfi.silence_end=12.4\n"

    assert parse_silences(log, start_us=1_400_000) == [(10_000_000, 11_000_000)]
