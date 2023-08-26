![whishper banner](misc/banner.png)

# [Whishper](https://whishper.net)

Whishper (formerly known as Web Whisper Plus) is a complete transcription suite. In simple words, it is a frontend for OpenAI's Whisper, but with batteries included!

> [Checkout the website for more information](https://whishper.net)

> [Demo videos available here](https://whishper.net/usage/transcriptions/)

## Features

- Transcribe any media to text: audio, video, etc.
    - Transcribe from URLs (any source supported by yt-dlp).
    - Upload a file to transcribe.
- Download result in many formats: TXT, JSON, VTT, SRT or copy the raw text to your clipboard.
- Translate your transcriptions to any language supported by [Libretranslate](https://libretranslate.com).
- Edit your subtitles in a comfy and complete web UI!
    - Subtitle language selection.
    - Sentence splitting.
    - Large CPS (Characters per second) warnings.
    - See current transcription based on media position.
    - Insert new segments to the subtitles.
- Private: transcription, translation and subtitle edition happen 100% locally (can work offline!).
- Fast: uses FasterWhisper as the Whisper backend: get much faster transcription times on CPU!
- Local: transcripted files are stored locally, and you can download them!

### Coming soon

- [ ] Support for GPU acceleration.
- [ ] Audio recording from the browser.

## Self hosting

Check out the self-hosting documentation [here](https://whishper.net/guides/install/).

## Project structure

Whishper is a collection of pieces that work together. The three main pieces are:

- Transcription-API: This is the API that enables running Faster-Whisper. You can find it in the `transcription-api` folder.
- Whishper-Backend: This is the backend that coordinates frontend calls, database, and tasks. You can find it in `backend` folder.
- Whishper-Frontend: This is the frontend (web UI) of the application. You can find it in `frontend` folder.
- Translation (3rd party): This is the libretranslate container that is used for translating subtitles.
- MongoDB (3rd party): This is the database that stores all the information about your transcriptions.
- Nginx (3rd party): This is the proxy that allows running everything from a single domain.

## Development

Check out the development documentation [here](https://whishper.net/guides/development/).