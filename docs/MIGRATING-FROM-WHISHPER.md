# Coming from Whishper 3

Anysub is the next version of Whishper, rewritten from scratch and renamed. It does the same job, transcribing your media on your own machine, and adds a proper subtitle editor. It shares no code or data format with Whishper 3, so moving over means installing Anysub next to Whishper and bringing your media across.

## What happens to Whishper 3

- Your installation keeps running. It pulls `pluja/whishper` from Docker Hub, and those images stay where they are.
- Whishper 3 gets no more updates or fixes. Its code lives on in the [`v3-legacy` branch](https://github.com/pluja/anysub/tree/v3-legacy).
- The Whishper 3 install script, `get-whishper.sh`, no longer works, because the files it downloads are gone from the main branch. The [Whishper 3 documentation](https://whishper-docs.pages.dev) still describes the old version.

## What carries over

Nothing moves automatically. Anysub cannot read Whishper's MongoDB database, and it cannot import subtitle files yet. Plan to transcribe again the recordings you still work with.

## What changes

| Whishper 3                                          | Anysub                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Three containers: Whishper, MongoDB, LibreTranslate | Two containers: web and worker, with an SQLite database                                     |
| Images on Docker Hub, `pluja/whishper`              | Images on the GitHub Container Registry, `ghcr.io/pluja/anysub`                             |
| Port 8082                                           | Port 5173, set with `ANYSUB_PORT`                                                           |
| Data in `./whishper_data`                           | Data in Docker volumes, see [Backup and restore](BACKUP.md)                                 |
| Open to anyone who can reach it                     | An owner account with a password                                                            |
| faster-whisper                                      | WhisperX: faster-whisper plus word alignment                                                |
| Models chosen with `WHISPER_MODELS`                 | Models downloaded under **Administration > Models**                                         |
| Subtitle editor with CPS warnings                   | Studio with a waveform timeline, undo, autosave, and warnings for speed, length and overlap |
| Download as TXT, JSON, VTT or SRT                   | Export as TXT, SRT, WebVTT, or Anysub JSON with word timings                                |
| Translation with LibreTranslate                     | Not available yet                                                                           |
| Transcribe from a URL with yt-dlp                   | Not available yet: download the file with `yt-dlp "<url>"`, then upload it                  |

Anysub JSON is a new format, not the one Whishper exported.

## Move over

1. **Keep Whishper running for now.** Its port, 8082, does not clash with Anysub's, so both can run at once. They compete for memory while both transcribe, so avoid running jobs in both.
2. **Install Anysub** in a new directory, following [Install](INSTALL.md).
3. **Save what you need from Whishper.** For each transcription you edited and want to keep, open it in Whishper and download its subtitles. Keep the files next to the media: Anysub cannot import them yet, but you will not lose the work.
4. **Bring the media.** Whishper kept every uploaded file in `whishper_data/uploads` inside its directory. Upload the recordings you still need to Anysub and transcribe them there.
5. **Remove Whishper** once you have everything. In Whishper's directory:
   ```sh
   docker compose down
   docker image rm pluja/whishper mongo libretranslate/libretranslate
   ```
   Then delete `whishper_data` when you are sure nothing in it is still needed. It holds the uploads, the database and LibreTranslate's language models.

## Settings

| Whishper 3 setting                               | In Anysub                                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `WHISPER_MODELS`                                 | **Administration > Models**. Any model downloads on its first use too.                                                      |
| `WHISHPER_HOST`, `PUBLIC_API_HOST`               | Not needed. Behind an HTTPS reverse proxy, set `BETTER_AUTH_URL`, see [Reverse proxy](INSTALL.md#reverse-proxy).            |
| `DB_USER`, `DB_PASS`                             | Not needed. The database is a file in a volume.                                                                             |
| `LT_LOAD_ONLY` and other LibreTranslate settings | Not needed. There is no translation yet.                                                                                    |
| `CPU_THREADS`                                    | Not needed: the worker uses every core it may. To leave some free, see [Worker defaults](CONFIGURATION.md#worker-defaults). |
| `docker-compose.gpu.yml`                         | `compose.cuda.yaml`, see [NVIDIA GPUs](GPU.md).                                                                             |
| `WHISHPER_VERSION`                               | The image tags in `compose.yaml`, see [Upgrading](UPGRADING.md).                                                            |

## Questions

Ask in the [issue tracker](https://github.com/pluja/anysub/issues). Issues about Whishper 3 itself will be closed, because that version is no longer maintained.
