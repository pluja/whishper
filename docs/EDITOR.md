# Subtitle editor

Status: first durable editing and export slice implemented.

The project workspace keeps the media preview and subtitle track within the browser viewport on desktop. Long tracks scroll inside the cue pane, so playback controls and editing tools remain visible while moving through a film or lecture.

## Editing cues

Select a cue by focusing its text or timing fields. Clicking its numbered badge seeks playback to the cue start. During playback, the active cue is selected and scrolled into view unless a text field is being edited.

The editor currently supports:

- Multiline cue text and `HH:MM:SS.mmm` timing entry.
- 100 ms whole-cue timing nudges.
- Split at the playhead, or at the cue midpoint when the playhead is outside the cue. The text cursor chooses the nearest word boundary.
- Merge with the following cue.
- Insert after and delete.
- Session undo and redo, including `Ctrl/Command+Z`, `Ctrl/Command+Shift+Z`, and `Ctrl/Command+Y`.
- `Ctrl/Command+S` to save immediately.

Structural edits are reversible through undo until the page is closed. Later editor slices add named server checkpoints, frame-aware boundary nudges, waveform manipulation, bulk operations, and an active editor lease.

## Saving and recovery

Changes autosave after a short pause. Every track carries a monotonically increasing revision. The server locks the track, compares the expected revision, validates the complete cue snapshot, and commits it in one PostgreSQL transaction. If another editor saved first, Anysub refuses to overwrite that work and asks the user to reload.

While changes are unsaved, the browser keeps a local journal keyed by project and track. A reload or crash can recover that journal when its base revision still matches PostgreSQL. Browser recovery is an additional safety net; PostgreSQL remains canonical.

Changing cue text clears that cue's word alignment because old word tokens no longer reliably describe the edited text. Unchanged cues retain their original word timestamps. A later forced re-alignment workflow will rebuild tokens after substantial corrections.

## Quality feedback

The cue list reports warnings without modifying content automatically:

- Empty cue or zero duration.
- Duration below 0.5 seconds or above 7 seconds.
- Overlap with the preceding cue.
- More than 20 characters per second.
- Text longer than the transcription run's configured maximum, or 42 characters when no limit was recorded.

These are useful general signals, not yet a complete accessibility or broadcaster profile. Versioned quality profiles remain on the roadmap.

## Export

The active track can be downloaded as:

- SRT with millisecond timecodes.
- WebVTT.
- Anysub JSON containing project and track metadata, stable cue IDs, integer-microsecond timing, and retained word tokens.

Exports are generated from the latest committed PostgreSQL revision. Wait for the **Saved** indicator before downloading when an edit is still in progress.

