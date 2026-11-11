# Troubleshooting

Start with the status and logs, next to `compose.yaml`:

```sh
docker compose ps
docker compose logs --tail 100 web worker
```

Both services should be `running`, and `web` should be `healthy`.

## Installing and starting

**`port is already allocated` or `bind: address already in use`.** Something else uses port 5173. Set `ANYSUB_PORT=8080` in `.env` and run `docker compose up -d` again.

**`denied` or `unauthorized` when pulling from `ghcr.io`.** You have an old login saved. Run `docker logout ghcr.io` and try again.

**`exec format error`.** The host is not x86-64. Anysub has no ARM images yet.

**`podman compose` misbehaves.** Use Docker Compose with Podman, not `podman-compose`. See [Install](INSTALL.md#podman).

**The setup code is gone from the log.** Restart to print a new one:

```sh
docker compose restart web
docker compose logs web
```

## Signing in

**Sign-in goes back to the sign-in page with no error.** `BETTER_AUTH_URL` is set to an HTTPS address, but you opened Anysub over plain HTTP. Use the HTTPS address, or remove `BETTER_AUTH_URL`. See [Reverse proxy](INSTALL.md#reverse-proxy).

**You forgot your password.** See [Your account](USER-GUIDE.md#your-account).

**Sign-in is slow after a few wrong passwords.** That's on purpose, up to a minute. Behind a reverse proxy, set `ANYSUB_ADDRESS_HEADER` so it doesn't slow down everyone. See [Network](CONFIGURATION.md#network).

## Uploading

**Every upload fails.** Your reverse proxy probably limits the request size. Uploads come in 32 MiB chunks, and nginx allows only 1 MiB by default. See [Reverse proxy](INSTALL.md#reverse-proxy).

**A file is refused.** Only audio and video are accepted. If your browser sees the file as something else, convert it, for example with `ffmpeg -i input.ext output.mp4`.

**A file is too large.** The owner sets the limit under **Administration > Storage**.

**The upload stopped.** Choose the same file again in the same browser to resume.

## Transcribing

**The project is waiting for a speech worker.** The worker isn't connected. Check that it's running and that its log has a `worker started` line. **Administration > Workers** shows whether Anysub sees it.

**A model download fails.** The error shows in **Administration > Models**. The worker needs internet access to Hugging Face. Fix that and choose **Try again**.

**Transcription is slow.** It is on a CPU, especially with larger models. Use a smaller model or an [NVIDIA GPU](GPU.md).

**The worker runs out of memory, or keeps restarting.** Lower the batch size under **Advanced options**, use a smaller model, or set **Administration > Transcription > Precision** to **Lower memory**.

**Word timings are missing for a language.** Not every language has an alignment model. The subtitles are kept, just without word timings.

## Editing

**A video doesn't play in the studio.** Anysub converts files your browser can't play. Wait for that to finish on the project page, or retry it there if it failed.

**Anysub says another session saved first.** The project is open in another tab or device. Reload to get the saved version. Unsaved changes in this tab are lost, so copy any text you want first.

## Disk space

**Administration > Storage** shows what uses the disk. Delete projects or models you don't need, and run `docker image prune` to remove old images.

## GPU

See [When the GPU path fails](GPU.md#when-the-gpu-path-fails).

## Reporting a bug

[Open an issue](https://github.com/pluja/anysub/issues/new/choose) with the Anysub version (top right of **Administration**), whether you use the CPU or GPU worker, and the output of:

```sh
docker compose logs --tail 200 web worker
```

Remove anything private from the logs first.
