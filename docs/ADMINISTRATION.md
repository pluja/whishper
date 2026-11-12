# Administration

Open **Administration** from the account menu. It has five pages: **Local models**, **External providers**, **Transcription**, **Storage** and **Workers**. The Anysub version is at the top right; include it in bug reports.

Container settings, such as the port, go in `.env` instead. See [Configuration](CONFIGURATION.md).

## Local models

Lists each model with its size, memory needs and how well it fits your hardware. The one marked **Recommended** is what Automatic picks.

**Download** fetches a model from Hugging Face. A failed download resumes when you try again. **Cancel** stops it and frees the space. The trash button deletes a model.

Downloading ahead isn't required, since models download on first use. It just means transcription starts right away and works offline.

The panel above the list shows the worker's hardware and free disk space. With several workers, pick one at the top: each has its own models.

## External providers

Adds speech services, such as OpenAI or Groq, whose models people can choose instead of the local ones. Each provider has a base URL and an optional API key. Adding one checks the connection and adds its transcription models. You can set a price per minute for each model, and the page counts its transcriptions and their estimated cost. See [External providers](PROVIDERS.md).

## Transcription defaults

The starting values of the transcribe form. They can still be changed for each run, except precision.

- **Default model**: Automatic picks Large v3 Turbo on a GPU that fits it, and Small otherwise.
- **Spoken language**: set one if all your media is in the same language. Detection listens to the first 30 seconds.
- **Word timing**: whether word alignment is on by default.
- **Subtitle length**: the longest line in characters, with a preview.
- **Precision**: **Automatic** suits almost everyone. **Lower memory** helps a larger model fit on a GPU, and does nothing on a CPU. **Full precision** uses about twice the memory, is slower, and is rarely more accurate.

## Storage

**Upload limit** sets the largest file allowed, from 1 GiB to 10 TiB.

**Data disk** shows what uses the disk: media, previews, the database and free space.

## Workers

Lists each worker with its state (**Working**, **Ready** or **Offline**), hardware and downloaded models. A busy worker shows its current job. You can remove a worker you no longer use; it comes back if it connects again.
