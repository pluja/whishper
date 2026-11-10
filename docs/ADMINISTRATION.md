# Administration

The owner, the account created on the setup page, runs the server. Its account menu has an **Administration** entry with four pages: **Models**, **Transcription**, **Storage** and **Workers**. The settings there apply to everyone who uses Anysub. The Anysub version shows at the top right of every page. Bug reports need it.

Settings about how the containers run, such as the port, live in `.env` instead. See [Configuration](CONFIGURATION.md).

## Models

Every model a connected worker offers is listed with its download size, memory needs and how well it fits that worker's hardware. **Download** fetches it from Hugging Face with a progress bar, and **Cancel** stops a download and frees the space it used. A download that fails, for example when the connection drops, keeps what it fetched so its retry resumes from there. The trash button removes a downloaded model. A transcription that needs a removed model downloads it again.

Downloading ahead of time means the first transcription with a model starts at once and a worker can transcribe without an internet connection. The model marked **Recommended** is the one Automatic picks for that worker. The panel above the list shows the worker's hardware and the free space on its model disk; a model larger than the free space cannot be downloaded. With several workers, choose one at the top: each keeps its own models.

A download waits while its worker finishes the job it is running, then goes ahead of queued transcriptions.

## Transcription defaults

These are the starting values of the transcribe form. People can still change the model, language, alignment and line length for each run.

- **Default model**: Automatic picks the best fit for the connected hardware, Large v3 Turbo on a graphics card that fits it and Small otherwise. A model chosen here that is not downloaded yet waits for its download on the first run.
- **Spoken language**: a fixed language suits a library in one language. Detection listens to the first 30 seconds.
- **Word timing**: whether accurate word alignment starts on.
- **Subtitle length**: the longest subtitle in characters, with a live preview of how a sentence splits.
- **Precision**: applies to every run and is not offered per run. **Automatic** runs `int8` weights on a processor and `float16` on a graphics card. **Lower memory** uses `int8_float16` on a graphics card, which helps a larger model fit; on a processor it is the same as Automatic. **Full precision** runs `float32` everywhere, about twice the memory and slower, for accuracy that is rarely better. The models list judges fit at the precision chosen here.

Saved settings apply to transcriptions that start afterwards.

## Storage

**Upload limit** sets the largest file anyone can upload, from 5 GiB to 2 TiB or a custom size between 1 GiB and 10 TiB. A warning appears when the limit is larger than the free space on the data disk.

**Data disk** shows how the disk that holds uploads is used: original media, previews and waveforms, the database with unfinished uploads, other files on the same disk, and free space.

## Workers

Each worker that has connected is listed with its state (**Working**, **Ready** or **Offline**), its processor, graphics card, memory, and how many models it has downloaded. A working worker shows its current job with progress and links to the project. A worker that stopped for good can be removed from the list; it reappears if it connects again.
