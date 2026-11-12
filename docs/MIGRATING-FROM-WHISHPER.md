# Coming from Whishper 3

Anysub is Whishper rewritten from scratch and renamed. It does the same job, with a much better subtitle editor. It can't read Whishper 3 data, so you install it alongside and bring your media over.

## What happens to Whishper 3

- Your install keeps working. The `pluja/whishper` images stay on Docker Hub.
- It gets no more updates. The code is in the [`v3-legacy` branch](https://github.com/pluja/anysub/tree/v3-legacy).
- The `get-whishper.sh` install script no longer works. The [old docs](https://whishper-docs.pages.dev) are still online.

## What carries over

Nothing. Anysub can't read Whishper's database or import subtitle files yet, so you'll need to transcribe again.

## What changes

| Whishper 3                                          | Anysub                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Three containers: Whishper, MongoDB, LibreTranslate | Two containers: web and worker, with an SQLite database                                     |
| Images on Docker Hub, `pluja/whishper`              | Images on the GitHub Container Registry, `ghcr.io/pluja/anysub`                             |
| Port 8082                                           | Port 5173, set with `ANYSUB_PORT`                                                           |
| Data in `./whishper_data`                           | Data in Docker volumes, see [Backup and restore](BACKUP.md)                                 |
| Open to anyone who can reach it                     | An owner account with a password                                                            |
| faster-whisper                                      | WhisperX: faster-whisper plus word alignment                                                |
| Models chosen with `WHISPER_MODELS`                 | Models downloaded under **Administration > Local models**                                   |
| Subtitle editor with CPS warnings                   | Studio with a waveform timeline, undo, autosave, and warnings for speed, length and overlap |
| Download as TXT, JSON, VTT or SRT                   | Export as TXT, SRT, WebVTT, or Anysub JSON with word timings                                |
| Translation with LibreTranslate                     | Not available yet                                                                           |
| Transcribe from a URL with yt-dlp                   | Not available yet: download the file with `yt-dlp "<url>"`, then upload it                  |

Anysub JSON is a new format, not the one Whishper exported.

## Move over

1. **Keep Whishper running for now.** The ports don't clash, so both can run. Avoid transcribing in both at once, as they share memory.
2. **Install Anysub** in a new directory. See [Install](INSTALL.md).
3. **Save your edited subtitles** from Whishper. Anysub can't import them yet, but you keep the work.
4. **Upload your media** to Anysub. Whishper kept it in `whishper_data/uploads`.
5. **Remove Whishper** when you're done. In its directory:
   ```sh
   docker compose down
   docker image rm pluja/whishper mongo libretranslate/libretranslate
   ```
   Then delete `whishper_data` once you're sure you don't need it.

## Settings

| Whishper 3 setting                               | In Anysub                                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `WHISPER_MODELS`                                 | **Administration > Local models**. Any model downloads on its first use too.                                                |
| `WHISHPER_HOST`, `PUBLIC_API_HOST`               | Not needed. Behind an HTTPS reverse proxy, set `BETTER_AUTH_URL`, see [Reverse proxy](INSTALL.md#reverse-proxy).            |
| `DB_USER`, `DB_PASS`                             | Not needed. The database is a file in a volume.                                                                             |
| `LT_LOAD_ONLY` and other LibreTranslate settings | Not needed. There is no translation yet.                                                                                    |
| `CPU_THREADS`                                    | Not needed: the worker uses every core it may. To leave some free, see [Worker defaults](CONFIGURATION.md#worker-defaults). |
| `docker-compose.gpu.yml`                         | `compose.cuda.yaml`, see [NVIDIA GPUs](GPU.md).                                                                             |
| `WHISHPER_VERSION`                               | The image tags in `compose.yaml`, see [Upgrading](UPGRADING.md).                                                            |

## Questions

Ask in the [issue tracker](https://github.com/pluja/anysub/issues). Issues about Whishper 3 itself will be closed.
