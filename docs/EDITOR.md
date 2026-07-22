# Subtitle editor

Status: durable cue editing, synchronized waveform timing, and export implemented.

The project workspace keeps the media preview and subtitle track within the browser viewport on desktop. Long tracks scroll inside the cue pane, so playback controls and editing tools remain visible while moving through a film or lecture.

## Studio workspace

Opening a project switches the web application into a focused, dark studio workspace. The global project navigation is replaced by a compact title bar so the program monitor and cue sheet can use the full browser window. Export and save state remain visible, while destructive project and transcript actions live in the overflow menu.

On desktop, drag the divider between the program monitor and cue sheet to change their relative width. The divider also accepts the left and right arrow keys, and its last position is remembered in that browser. On narrower screens the panels stack, the divider disappears, and the cue sheet remains independently scrollable.

The cue sheet is intentionally dense: timing, text, duration, selection, playback state, and quality warnings share one scan line. Detailed cue metrics remain visible for the selected cue and for cues with warnings.

## Waveform timeline

Prepared media adds a bounded timeline below the program monitor. It draws the time ruler and only the visible waveform window on a device-pixel-ratio-aware canvas. The browser chooses the waveform resolution nearest one peak per rendered pixel. Fit, zoom, scrolling, pointer panning, click-to-seek, playhead following, and cue selection stay synchronized with the media element and cue sheet. When zoomed, a mouse wheel or trackpad gesture over the timeline pans horizontally. At a horizontal boundary, or while fitted, vertical scrolling returns to the page.

Drag a cue body to move the cue or drag either boundary to trim it. The editor previews pointer movement locally, then commits one integer-microsecond timing change on pointer release. One drag creates one undo entry and one autosave change. Pointer cancellation and unchanged drags commit nothing.

Focus a cue body or boundary and press the left or right arrow key for a 1 ms adjustment. Timeline edits keep the existing overlap policy: the editor reports overlaps but does not block them.

## Editing cues

Select a cue by focusing its text or timing fields. Clicking its numbered badge seeks playback to the cue start. During playback, the active cue is selected and scrolled into view unless a text field is being edited.

The editor currently supports:

- Multiline cue text and `HH:MM:SS.mmm` timing entry.
- 100 ms whole-cue timing nudges in the cue sheet and 1 ms focused nudges in the timeline.
- Split at the playhead, or at the cue midpoint when the playhead is outside the cue. The text cursor chooses the nearest word boundary.
- Merge with the following cue.
- Insert after and delete.
- Session undo and redo, including `Ctrl/Command+Z`, `Ctrl/Command+Shift+Z`, and `Ctrl/Command+Y`.
- `Ctrl/Command+S` to save immediately.

Structural edits are reversible through undo until the page is closed. Later editor slices add named server checkpoints, frame-aware boundary nudges, bulk operations, and an active editor lease.

## Keyboard workflow

The **Shortcuts** button, or `?` when focus is outside a text-entry field, opens the studio key map. `Space` toggles playback. `J` shuttles backward, `K` resumes forward playback at 1×, and `L` shuttles forward; repeated `J` or `L` presses cycle through 1×, 2×, and 4× speed.

The left and right arrow keys step one frame, or five frames with `Shift`. The up and down arrow keys jump between cue starts, while `Home` and `End` jump to the source boundaries. `Ctrl/Command+K` splits the selected cue, including at the cursor when its text field has focus. `Shift+Delete` or `Shift+Backspace` deliberately removes the selected cue.

Unmodified studio shortcuts do not capture keystrokes from text-entry controls. `Space` preserves native activation when a button, link, or disclosure control has focus; focused media instead uses the studio transport controls. Save, undo, redo, and split remain available with their `Ctrl` or `Command` modifiers while editing text. Opening the shortcut guide suspends studio shortcuts and leaves native `Escape` handling intact.

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
