# User guide

This guide follows a file from upload to export. For installation see [INSTALL.md](INSTALL.md). For every setting see [CONFIGURATION.md](CONFIGURATION.md).

## Uploading media

Create a project from the library by choosing a file. The project takes its name from the filename, and names do not need to be unique.

- Audio and video files are accepted (`audio/*`, `video/*`, `application/ogg`, `application/mp4`). Anything else is rejected.
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
3. Under **Advanced options**, change the maximum line length if 42 characters does not suit your platform, or the batch size if the worker runs out of memory.
4. Choose the spoken language, or leave it to Whisper to detect.
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

The worker retries transient errors up to three attempts. Errors a retry cannot fix fail at once: FFmpeg timeouts, CUDA out-of-memory, and rejected requests. If the worker stops mid-job, the job goes back to the queue while attempts remain.

Deleting a transcript removes its cues and its run, including the job result and retry history, but keeps the project media.

## The studio

Opening a project switches to a dark studio workspace. A compact title bar replaces the project navigation, and it keeps export and save state in view. Destructive actions live in the overflow menu.

On desktop the media monitor sits beside the cue sheet, and you can drag the divider between them or move it with the left and right arrow keys. Your position is remembered in that browser. On narrow screens the panels stack and the cue sheet scrolls on its own.

Each cue row shows timing, text, duration, playback state, and quality warnings on one line.

### Waveform timeline

Below the monitor, the timeline draws a time ruler and the visible part of the waveform. Fit, zoom, scroll, drag to pan, click to seek, and playhead following all stay in sync with the player and the cue sheet. When zoomed in, the mouse wheel pans horizontally. At the edge of the range, or when fitted, the wheel scrolls the page.

Drag a cue to move it, or drag either edge to trim it. One drag makes one undo step and one autosave. Hold `Alt` to move a cue or edge past its neighbours. Without it, the drag stops at the adjacent cues. Focus a cue or edge and press the left or right arrow key to nudge it by 1 ms, or `Shift` with the arrow key for 100 ms. Overlaps are reported but never blocked.

### Editing cues

Select a cue by focusing its text or timing fields. Clicking the numbered badge seeks to the cue start. During playback the active cue is selected and scrolled into view, unless you are typing in a text field.

You can:

- Edit multiline text and enter timings as `HH:MM:SS.mmm`.
- Nudge a whole cue by 100 ms from the cue sheet.
- Split at the playhead, or at the cue midpoint when the playhead is outside the cue. With a text cursor, the split snaps to the nearest word boundary.
- Merge with the following cue.
- Insert a cue after the selected one, or delete it.
- Undo and redo until you close the page.

Editing a cue's text clears that cue's word timings, because the old timings no longer describe the new words. Unchanged cues keep theirs.

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
| `Ctrl/Command+K`                         | Split the selected cue, at the cursor when typing       |
| `Shift+Delete`, `Shift+Backspace`        | Delete the selected cue                                 |
| `Ctrl/Command+Z`                         | Undo                                                    |
| `Ctrl/Command+Shift+Z`, `Ctrl/Command+Y` | Redo                                                    |
| `Ctrl/Command+S`                         | Save now                                                |

Unmodified shortcuts never capture keystrokes inside text fields. Save and split keep their `Ctrl` or `Command` forms while you type. Undo and redo stay native in text fields, which keep their own history. `Space` keeps its normal behaviour on a focused button, link, or disclosure.

## Saving and recovery

Changes autosave after a short pause. Each track has a revision number. The server compares your expected revision, validates the whole cue snapshot, and commits it in one database transaction. If another session saved first, Anysub refuses to overwrite that work and asks you to reload.

While changes are unsaved, the browser keeps a local journal for the project and track. After a reload or crash, Anysub offers the journal back if it still matches the saved revision. A journal older than the saved track is discarded with a notice. PostgreSQL stays the source of truth.

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
