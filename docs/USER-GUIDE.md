# User guide

This guide follows a file from upload to export. For setup, see [Install](INSTALL.md). For the owner's settings, see [Administration](ADMINISTRATION.md).

## Uploading media

In the library, create a project by choosing a file, or drop one anywhere on the page. The project takes its name from the file.

- Audio and video only. The browser checks the file type before anything is sent.
- If the connection drops or you reload the page, choose the same file in the same browser and the upload picks up where it stopped.
- The default limit is 500 GiB per file. The owner can change it under [Administration > Storage](ADMINISTRATION.md#storage).
- An upload with no progress for ten minutes shows as **Upload paused**. Unfinished uploads are deleted after seven days.
- Uploading the same file twice makes two projects.

After the upload, Anysub prepares the media: it draws a waveform, makes a thumbnail for video, and converts the file only if your browser can't play it. The project page shows progress.

To delete a project, use the menu in the studio's title bar. This removes its media too.

## Finding projects

The library search matches project names. Tick **Subtitle text** to search the subtitles as well.

## Transcribing

1. Open the project and choose a model. `Small` is a good start on a CPU.
2. Leave **Accurate word alignment** on if you want word-level timings.
3. Choose the spoken language, or leave it on **Detect automatically**. You can search the list without accents: `espanol` finds Spanish.
4. Start the transcription.

**Advanced options** has the maximum line length (42 characters by default) and the batch size. Lower the batch size if the worker runs out of memory.

The form starts from the owner's [transcription defaults](ADMINISTRATION.md#transcription-defaults).

A model downloads the first time you use it, unless the owner downloaded it already. After that, transcription works offline. Anysub doesn't send telemetry, and transcript text never goes into the logs.

### Choosing a model

| Model          | Good for                   | Notes                         |
| -------------- | -------------------------- | ----------------------------- |
| Tiny           | Quick drafts               | Fastest, least accurate       |
| Base           | Short, clear recordings    | Light                         |
| Small          | Most things                | Best default on a CPU         |
| Medium         | Hard audio                 | Slow, needs more memory       |
| Large v3 Turbo | Near-Large quality, faster | Default on a GPU that fits it |
| Large v3       | Best accuracy              | Best with a GPU               |

The picker marks each model as **Recommended**, **Runs well**, **May be slow**, **Not recommended** or **Not checked**, based on your worker's hardware. A green download icon means the model is already downloaded.

Speed depends on the model, your hardware and the length of the file. A two-hour film on a CPU takes a while.

### Line length

After transcription, long lines are split at natural breaks. The limit is 42 characters by default and can be 20 to 120. Words are never cut, so a single very long word can go over. Scripts such as Chinese, Japanese and Korean get shorter limits automatically.

### Runs and failures

If a run fails, the project page shows the error and lets you try again. The worker retries temporary errors up to three times. When a run keeps failing because the worker restarts, it's usually out of memory, and the error says so.

To transcribe again, choose **Re-transcribe** in the studio title bar. Anysub saves your edits first. While it runs, the editor is read-only. If the run fails or you cancel it, you go back to the transcript you had.

Deleting a transcript keeps the media.

## The studio

Opening a project opens the studio. On desktop, the video sits next to the subtitle list, and you can drag the divider between them. On small screens they stack.

Each subtitle shows its timing, text, duration and any warnings. The line under the toolbar shows the selected subtitle's character count and characters per second.

Pick **Light**, **Dark** or **System** from the theme menu in the top bar.

### Waveform timeline

The timeline at the bottom shows the waveform and stays in sync with the player and the list. Click to seek, drag to pan, and zoom in or out.

Drag a subtitle to move it, or drag an edge to trim it. It stops at its neighbours unless you hold `Alt`. Overlaps get a warning but are allowed.

With a subtitle focused on the timeline:

- Left and right arrows select the previous or next one. `Home` and `End` jump to the first or last.
- `Alt` + arrow moves it by 1 ms, `Alt` + `Shift` + arrow by 100 ms.
- `[` and `]` focus its start and end edges, so the same keys trim them. `Escape` goes back.

### Editing subtitles

Click a subtitle's text or timing to select it. Click its number to jump to its start. During playback, the current subtitle is selected and scrolled into view.

You can:

- Edit the text, over several lines.
- Type the start and end times.
- Set the start or end to the playhead with the buttons next to the times, or with `I` and `O`.
- Split at the playhead, or at the text cursor.
- Merge with the next subtitle.
- Insert or delete a subtitle.
- Undo and redo, until you close the page.

Changing a subtitle's text, or only its start or end, removes its word timings. Moving the whole subtitle keeps them.

### Timing fields

Times are always `HH:MM:SS.mmm`, and typing overwrites digits in place:

- Digits replace the one under the cursor. Other characters are ignored.
- `Backspace` and `Delete` set digits to zero.
- Up and down arrows change the part under the cursor by one. Hold `Shift` for ten.
- You can paste looser forms, such as `62.5`, `1:02:03` or `00:01:02,500`.
- `Enter` applies the time. `Escape` cancels.

A start after the end, or an end past the media, is refused, and the reason shows under the toolbar.

### Keyboard shortcuts

Press `?`, or use the **Shortcuts** button, to see them all.

| Key                                      | Action                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| `Space`                                  | Play or pause                                            |
| `J`, `K`, `L`                            | Rewind, play at 1x, fast forward                         |
| Repeated `J` or `L`                      | Cycle through 1x, 2x and 4x                              |
| Left, right arrow                        | Step one frame, or five with `Shift`                     |
| Up, down arrow                           | Jump between subtitles                                   |
| `Home`, `End`                            | Jump to the start or end                                 |
| `I`, `O`                                 | Set the selected subtitle's start or end to the playhead |
| `Ctrl/Command+K`                         | Split the selected subtitle                              |
| `Shift+Delete`, `Shift+Backspace`        | Delete the selected subtitle                             |
| `Ctrl/Command+Z`                         | Undo                                                     |
| `Ctrl/Command+Shift+Z`, `Ctrl/Command+Y` | Redo                                                     |
| `Ctrl/Command+S`                         | Save now                                                 |

Single-key shortcuts don't fire while you type in a text field.

## Saving

Changes save on their own after a short pause. If the same transcript was saved from another tab or device, Anysub won't overwrite it and asks you to reload.

If the browser crashes or you reload before a save, Anysub offers to restore your unsaved changes.

## Warnings

The list flags these, but never changes your text:

- Empty, or zero length.
- Shorter than 0.5 seconds or longer than 7 seconds.
- Overlaps the previous subtitle.
- Ends after the media. You can't save until you fix it.
- More than 20 characters per second.
- Longer than the maximum line length.

These are general guidelines, not a broadcast or accessibility standard.

## Exporting

Download the transcript as:

- SRT
- WebVTT
- Plain text, one subtitle per line
- Anysub JSON, with word timings

Exports use the last saved version, so wait for **Saved** if you just made changes.

## Your account

To change your password, choose **Change password** in the account menu. This signs out your other devices.

If you forget it, choose **Forgot your password?** on the sign-in page, then **Print a recovery code**. Anysub doesn't send email, so the code goes to the log:

```sh
docker compose logs web
```

Enter the code, your email and a new password within 15 minutes.
