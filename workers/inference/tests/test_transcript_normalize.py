from anysub_worker.transcripts.normalize import normalize_segments


def test_normalizes_aligned_segments_to_contract_microseconds() -> None:
    artifact = normalize_segments(
        [
            {
                "start": 0.25,
                "end": 1.5,
                "text": " Hello world. ",
                "words": [
                    {"word": " Hello", "start": 0.25, "end": 0.7, "score": 1.2},
                    {"word": "world.", "start": 0.8, "end": 1.5, "score": 0.91},
                    {"word": "untimed"},
                ],
            }
        ],
        language="en",
        duration_us=1_000_000,
        metadata={"alignment": True},
    )

    assert artifact.duration_us == 1_500_000
    assert artifact.cues[0].text == "Hello world."
    assert artifact.cues[0].start_us == 250_000
    assert artifact.cues[0].words[0].text == "Hello"
    assert artifact.cues[0].words[0].confidence == 1
    assert len(artifact.cues[0].words) == 2


def test_normalization_orders_cues_by_start_and_numbers_ids_after_sorting() -> None:
    artifact = normalize_segments(
        [
            {"start": 5.0, "end": 6.0, "text": "late"},
            {"start": 1.0, "end": 2.0, "text": "early"},
            {
                "start": 3.0,
                "end": 4.0,
                "text": "middle",
                "words": [{"word": "middle", "start": 3.0, "end": 4.0}],
            },
        ],
        language="en",
        duration_us=0,
        metadata={},
    )

    assert [cue.text for cue in artifact.cues] == ["early", "middle", "late"]
    assert [cue.id for cue in artifact.cues] == ["cue-000001", "cue-000002", "cue-000003"]
    assert artifact.cues[1].words[0].id == "word-000002-001"
    starts = [cue.start_us for cue in artifact.cues]
    assert starts == sorted(starts)
