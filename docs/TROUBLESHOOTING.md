# Troubleshooting

Start with the state of the two services and their logs, from the directory that holds `compose.yaml`:

```sh
docker compose ps
docker compose logs --tail 100 web worker
```

Both services should be `running`, and the web service `healthy`. The worker waits for the web service to become healthy before it starts.

## Installing and starting

**`port is already allocated` or `bind: address already in use`.** Another program uses port 5173. Pick a free port with `ANYSUB_PORT=8080` in `.env`, then run `docker compose up -d` again.

**`denied` or `unauthorized` when pulling from `ghcr.io`.** The images are public, so this comes from an expired login stored on your machine. Run `docker logout ghcr.io` and pull again.

**`exec format error`.** The host is not x86-64. Anysub has no ARM images yet.

**`podman compose` misbehaves.** Anysub is tested with Docker Compose as Podman's provider, not with `podman-compose`. Set `PODMAN_COMPOSE_PROVIDER` as shown in [Install](INSTALL.md#podman).

**The setup code is gone from the log.** Restart the web service to print a new one, then read the log again:

```sh
docker compose restart web
docker compose logs web
```

## Signing in

**Sign-in returns to the sign-in page without an error.** `BETTER_AUTH_URL` is an HTTPS address and you opened Anysub over plain HTTP, so the browser refused the Secure session cookie. Use the HTTPS address, or remove `BETTER_AUTH_URL` from `.env`. See [Reverse proxy](INSTALL.md#reverse-proxy).

**You forgot your password.** Choose **Forgot your password?** on the sign-in page. Anysub prints a recovery code in the web service's log. See [Your account](USER-GUIDE.md#your-account).

**Sign-in is slow after a few wrong passwords.** Anysub waits longer after each failed attempt, up to a minute. Behind a reverse proxy, set `ANYSUB_ADDRESS_HEADER` so one person's mistakes do not slow down everyone. See [Network](CONFIGURATION.md#network).

## Uploading

**Every upload fails.** A reverse proxy limits the request body, or `ANYSUB_BODY_SIZE_LIMIT` is below 32 MiB. Uploads arrive in 32 MiB chunks, and nginx accepts only 1 MiB by default. See [Reverse proxy](INSTALL.md#reverse-proxy).

**A file is refused.** Anysub accepts audio and video. If the browser labels the file as something else, convert it, for example with `ffmpeg -i input.ext output.mp4`.

**A file is too large.** The owner sets the limit under **Administration > Storage**.

**The upload stopped.** Choose the same file again in the same browser, and it resumes where it stopped.

## Transcribing

**The project says it is waiting for a speech worker.** The worker is not connected. Check that it runs and that its log has a `worker started` line listing the `whisperx` adapter. **Administration > Workers** shows whether the application sees it.

**A model download fails.** The error shows under the model in **Administration > Models**. The worker needs outbound access to Hugging Face. Fix the connection and choose **Try again**.

**Transcription is slow.** On a CPU it is, especially with the larger models. Choose a smaller model, or use an [NVIDIA GPU](GPU.md).

**The worker runs out of memory, or the run fails after the worker restarts every attempt.** Lower the batch size under **Advanced options**, choose a smaller model, or choose **Lower memory** under **Administration > Transcription > Precision**. The model picker's memory estimates show what fits.

**Word timings are missing for a language.** Forced alignment has no model for every language. Anysub keeps the cues without word timings and records the reason with the run.

## Editing

**A video does not play in the studio.** Anysub prepares an editing copy when the browser cannot play the original. Wait for preparation to finish on the project page, or retry it there if it failed.

**Anysub says another session saved first.** The same track is open in another tab or on another device. Reload to load the version that was saved. Changes this tab had not saved are discarded, so copy any text you want to keep first.

## Disk space

**Administration > Storage** shows what uses the data disk. Deleting a project frees its media and everything made from it. **Administration > Models** removes models you no longer use. Old images from earlier versions stay until you run `docker image prune`.

## GPU

See [When the GPU path fails](GPU.md#when-the-gpu-path-fails).

## Reporting a bug

If none of this helps, [open an issue](https://github.com/pluja/anysub/issues/new/choose). Include the Anysub version from the top right of **Administration**, whether you run the CPU or NVIDIA worker, and the output of:

```sh
docker compose logs --tail 200 web worker
```

Remove transcript text and anything private from the logs first.
