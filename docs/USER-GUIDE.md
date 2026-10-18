# User guide

This guide follows a file from upload to export. For installation see [INSTALL.md](INSTALL.md). For every setting see [CONFIGURATION.md](CONFIGURATION.md).

## Uploading media

Create a project from the library by choosing a file, or drop an audio or video file anywhere on the library page. A drop opens the same dialog with the file already chosen, and the upload starts when you confirm. A file that is not audio or video is flagged while you drag it and refused on drop. The project takes its name from the filename, and names do not need to be unique.

- Audio and video files are accepted. If the browser reports a media type other than `audio/*`, `video/*`, `application/ogg`, or `application/mp4`, the upload is rejected. A file that reports no type at all is accepted.
- Uploads go in 32 MiB chunks. If the connection drops or you reload the page, choosing the same file in the same browser resumes where it stopped.
- The default size limit is 500 GiB per file. See [Uploads](CONFIGURATION.md#uploads) to change it.
- Cancelling an upload from the browser that started it removes the draft project at once. Uploads that never finish are deleted after seven days.

Uploading a finished file a second time creates a second project with its own copy of the media. Anysub does not deduplicate.

When an upload completes, the worker prepares the media. It probes the streams, draws a waveform, makes a thumbnail for video, and builds an H.264/AAC editing proxy only when the browser cannot play the original or the frame timing is variable. The project page shows progress, and you can cancel or retry preparation there.

Deleting a project removes its media and everything derived from it. Owners and administrators can delete any project. A member can delete projects they created.

## Finding projects

The library search box matches project names. Tick **Subtitle text** to match cue text as well. Matching is a case-insensitive substring match.

## Transcribing

1. Open the project and choose a model. The picker compares model size, memory estimates, and fit against your connected workers. `Small` is a good CPU starting point.
2. Leave **Accurate word alignment** on for editing and word-level timings.
3. Under **Advanced options**, change the maximum line length if 42 characters does not suit your platform, or the batch size if the worker runs out of memory. The batch size defaults to 4 on CPU and 16 on CUDA. A higher value can raise throughput and also raises peak memory.
4. Choose the spoken language, or leave it on **Detect automatically**. The list offers every language Whisper knows, with the most used ones first. Type in its search field to filter by English name, native name or code; accents are optional, so `espanol` finds Spanish.
5. Start the transcription and leave the worker running.

The first run with a model downloads its weights. Accurate alignment then downloads a smaller model for the language. Both land in the `model-cache` volume and survive rebuilds. A network connection is needed only for files that are not cached yet. Telemetry from Hugging Face and Pyannote is disabled, and transcript text is never written to worker logs.

### Choosing a model

| Model          | Use it for                                | Hardware guidance                   |
| -------------- | ----------------------------------------- | ----------------------------------- |
| Tiny           | Quick drafts and pipeline checks          | Fastest, least accurate             |
| Base           | Short, clear recordings                   | Light                               |
| Small          | General creator and archive work          | Recommended CPU default             |
| Medium         | Harder audio where accuracy matters       | Slow and memory-heavy               |
| Large v3 Turbo | Large-model quality with faster inference | Default when it fits the usable GPU |
| Large v3       | Maximum Whisper accuracy                  | GPU strongly recommended            |

The picker labels each model **Recommended**, **Runs well**, **May be slow**, **Not recommended**, or **Not checked**. Each row shows the model's purpose and approximate memory need, and a download icon: green when the files are cached, gray when they still need downloading. The estimate is system RAM in CPU mode and graphics memory in CUDA mode. Large v3 Turbo shows about 12 GB of RAM on CPU or 3 GB of VRAM with FP16 on CUDA. When it fits a connected CUDA worker, Anysub selects it by default. Otherwise `Small` is the suggestion.

Below the picker, the form shows the worker's detected CPU or usable GPU, logical core count, and available memory. A worker configured for CPU counts as a CPU worker even when its host has a GPU.

Speed and quality vary with language, recording quality, core count, memory, and duration. A two-hour film can take a long time on CPU. The worker keeps renewing its lease during loading and inference, so a slow run is not treated as abandoned.

### Subtitle segmentation

After transcription and alignment, WhisperX splits long segments at nearby natural boundaries. The maximum line length defaults to 42 characters and accepts 20 to 120 per run. Whole words stay intact, so only a single word longer than the limit can exceed it. WhisperX applies shorter limits to denser scripts such as Chinese, Japanese, Korean, Arabic, and several South Asian scripts. The setting shapes new cues only and does not touch the media.

### Runs and failures

The project page shows the current stage and progress. On failure it shows the adapter error and lets you start another run. Retranscribing creates a new run and keeps the earlier output until you delete it.

To transcribe a project again, choose **Re-transcribe** in the studio title bar. Anysub saves your pending edits first, and if they cannot be saved the run does not start. While the run works, the cue sheet and timeline are read-only and a notice says why. When the run finishes, the new transcript loads on its own. If the run fails, editing resumes on the current transcript, and edits that were waiting are saved.

Edits that never reached the server, such as typing in a second tab after the run started, cannot move to the new transcript. Anysub discards them when the new transcript loads and shows a notice.

The worker retries transient errors up to three attempts. Errors a retry cannot fix fail at once: FFmpeg timeouts, CUDA out-of-memory, and rejected requests. A worker that is stopped mid-job reports it as a retryable failure before exiting, so the job returns to the queue while attempts remain and fails once they run out.

Deleting a transcript removes its cues and its run, including the job result and retry history, but keeps the project media.

## The studio

Opening a project switches to the studio workspace, in the same light or dark theme as the rest of the app. Pick **Light**, **Dark**, or **System** from the theme menu in the library's top bar. **System** follows your operating system, and the choice is remembered in that browser. A compact title bar replaces the project navigation, and it keeps export and save state in view. Destructive actions live in the overflow menu.

On desktop the media monitor sits beside the cue sheet, and you can drag the divider between them or move it with the left and right arrow keys. Your position is remembered in that browser. On narrow screens the panels stack and the cue sheet scrolls on its own.

Each cue row shows timing, text, duration, playback state, and quality warnings. The status line under the cue toolbar shows the selected cue's character count and characters per second.

### Waveform timeline

Across the bottom of the studio, the timeline draws a time ruler and the visible part of the waveform. Fit, zoom, scroll, drag to pan, click to seek, and playhead following all stay in sync with the player and the cue sheet. When zoomed in, the mouse wheel pans horizontally. At the edge of the range, or when fitted, the wheel scrolls the page.

Drag a cue to move it, or drag either edge to trim it. One drag makes one undo step and one autosave. Hold `Alt` to move a cue or edge past its neighbours. Without it, the drag stops at the adjacent cues. Overlaps are reported but never blocked.

The cues take a single `Tab` stop, on the selected cue. From a focused cue:

- The left and right arrow keys select the previous or next cue, and `Home` and `End` select the first or last. `Enter` or `Space` selects the focused cue.
- `Alt` with the left or right arrow key nudges the cue by 1 ms, and `Alt` + `Shift` by 100 ms.
- `[` and `]` focus the start and end handles, where the same `Alt` keys trim that edge. `Escape` returns to the cue.

### Editing cues

Select a cue by focusing its text or timing fields. Clicking the numbered badge seeks to the cue start. During playback the active cue is selected and scrolled into view, unless you are typing in a text field.

You can:

- Edit multiline text and type timings into fixed `HH:MM:SS.mmm` fields.
- Set the selected cue's start or end to the playhead with the buttons beside its timing fields, or with `I` and `O`.
- Nudge a whole cue by 100 ms from the cue sheet.
- Split at the playhead, or at the cue midpoint when the playhead is outside the cue. With a text cursor, the split snaps to the nearest word boundary.
- Merge with the following cue.
- Insert a cue after the selected one, or delete it.
- Undo and redo until you close the page.

Editing a cue's text clears that cue's word timings, because the old timings no longer describe the new words. Unchanged cues keep theirs.

### Timing fields

Each start and end field always shows `HH:MM:SS.mmm`. Typing works like overtype mode:

- A digit replaces the digit under the caret and the caret moves on, skipping `:` and `.`. With a selection, typing starts at its first digit. Letters and other characters are ignored. Minutes and seconds refuse a first digit above 5.
- `Backspace` sets the digit before the caret to zero and moves onto it. `Delete` sets the digit after the caret to zero and moves past it. With a selection, both set every selected digit to zero.
- Up and down arrows add or remove one unit of the part under the caret: an hour, a minute, a second, or a millisecond. Hold `Shift` to step by ten. Steps carry into the next part, stop at zero and at the end of the media, and apply at once, so the player and timeline follow.
- Paste accepts looser forms such as `27`, `62.5`, `1:02.5`, `1:02:03`, or `00:01:02,500`.
- `Enter` or leaving the field applies the typed time. `Escape` returns to the last applied time.

A start later than the end, or an end earlier than the start, is refused. The field gets a red border and the status line under the cue toolbar shows the reason. The message goes away once the value is valid again, or when you press `Escape` or leave the field, which restores the last valid time. `I`, `O`, and the playhead buttons refuse the same cases with the same message, and never set a time past the end of the media.

Everything you change in one timing field, from focusing it until you leave it, is one undo step. `Ctrl/Command+Z` inside the field first drops digits you have not applied, then undoes the changes made since you focused it. Earlier edits stay until you undo outside the field.

### Keyboard shortcuts

Press `?` outside a text field, or use the **Shortcuts** button, for the full key map.

| Key                                      | Action                                                  |
| ---------------------------------------- | ------------------------------------------------------- |
| `Space`                                  | Play or pause                                           |
| `J`, `K`, `L`                            | Shuttle backward, resume forward at 1x, shuttle forward |
| Repeated `J` or `L`                      | Cycle through 1x, 2x, and 4x                            |
| Left, right arrow                        | Step one frame, or five with `Shift`                    |
| Up, down arrow                           | Jump between cue starts                                 |
| `Home`, `End`                            | Jump to the start or end of the media                   |
| `I`, `O`                                 | Set the selected cue's start or end to the playhead     |
| `Ctrl/Command+K`                         | Split the selected cue, at the cursor when typing       |
| `Shift+Delete`, `Shift+Backspace`        | Delete the selected cue                                 |
| `Ctrl/Command+Z`                         | Undo                                                    |
| `Ctrl/Command+Shift+Z`, `Ctrl/Command+Y` | Redo                                                    |
| `Ctrl/Command+S`                         | Save now                                                |

Opening the shortcut guide suspends the studio shortcuts. Unmodified shortcuts never capture keystrokes inside text fields. Save and split keep their `Ctrl` or `Command` forms while you type. Undo and redo stay native in text fields, which keep their own history. Timing fields have no history of their own, so there they undo and redo cue edits. `Space` keeps its normal behaviour on a focused button, link, or disclosure.

## Saving and recovery

Changes autosave after a short pause. Each track has a revision number. The server compares your expected revision, validates the whole cue snapshot, and commits it in one database transaction. If another session saved first, Anysub refuses to overwrite that work and asks you to reload.

While changes are unsaved, the browser keeps a local journal for the project and track. After a reload or crash, Anysub offers the journal back if it still matches the saved revision. A journal older than the saved track is discarded with a notice. Only the latest transcript of a project can be edited, so once a newer one replaces it, unsaved edits to the old one are discarded with a notice too. PostgreSQL stays the source of truth.

## Quality warnings

The cue list flags problems and never changes your text on its own:

- Empty cue or zero duration.
- Duration under 0.5 seconds or over 7 seconds.
- Overlap with the previous cue.
- More than 20 characters per second.
- Text longer than the run's maximum line length, or 42 characters when none was recorded.

These are general signals and not a broadcaster or accessibility profile.

## Exporting

Download the active track as:

- SRT with millisecond timecodes.
- WebVTT.
- Anysub JSON with project and track metadata, stable cue IDs, integer-microsecond timing, and word tokens.

Exports use the latest saved revision. Wait for the **Saved** indicator before downloading if you just edited.

## Troubleshooting

Check the services first:

```sh
docker compose ps
docker compose logs -f worker
```

- **The project says it is waiting for a speech worker.** Confirm the worker is running and its log lists the `whisperx` adapter.
- **A model download fails.** Check outbound access to Hugging Face and run the transcription again.
- **The worker is killed or reports out-of-memory.** Lower the batch size under **Advanced options**, or pick a smaller model. See [Choosing a precision](CONFIGURATION.md#choosing-a-precision).
- **Forced alignment is unavailable for a language.** Anysub keeps the unaligned cues and records the reason in the run metadata.
- **Sign-in or upload is rejected behind a proxy.** `BETTER_AUTH_URL` does not match the address in your browser. See [Reverse proxy](INSTALL.md#reverse-proxy).
- **Every upload fails.** `ANYSUB_BODY_SIZE_LIMIT` is below 32 MiB, or your proxy limits the request body.
- **GPU problems.** See [When the GPU path fails](CONFIGURATION.md#when-the-gpu-path-fails).
