[![anysub banner](misc/banner2.png)](https://anysub.org)

# 🚧 WORK IN PROGRESS...

This is the branch where I'm working on a complete rewrite of the project.

This rewrite is under development. The initial stages of development are focused on enhancing the quality and reliability of the APIs. The goal is to ensure easier scalability, broader compatibility, and overall improved performance. After the APIs are reliable and ready, the focus will move on the implementation of a better web UI.

**AnySub** is an open-source, 100% local audio transcription and subtitling suite with a full-featured web UI.

## ✅ Currently working

- [x] 🗣️ **Transcribe any media** to text: audio, video, etc.
  - [x] Upload a file to transcribe.
  - [x] Speaker detection and diarization.
  - [x] WhisperX alignment.
  - [x] Better segment splitting.
- [x] 🌐 **Translate transcriptions** to any language supported by [Libretranslate](https://libretranslate.com)
- [x] 🏠 **100% Local**: transcription, translation and subtitle edition happen 100% on your machine (can even work offline!).
- [x] 🚀 **Fast**: uses WhisperX as the Whisper backend: get much faster transcription times on CPU!
- [x] 📥 **Download transcriptions in**:
  - [x] VTT - Speakers colorized
  - [x] ASS - Speakers colorized
  - [x] JSON
  - [ ] TXT
- [x] 🐎 **CPU**: Anysub is fully optimized to run efficiently on CPU-only systems
- [x] 🔥 **GPU Acceleration**: Leverage NVIDIA GPUs to achieve significantly faster transcription times
- [x] 🦾 Backend workers
  - Anysub can seamlessly orchestrate multiple whisperx-api workers, balancing the job queue across all available resources. Uses [asynq](https://github.com/hibiken/asynq).

## 🏁 Todos before release
- [ ] Web UI
  - [ ] Create
  - [ ] Translate
  - [ ] Summarize
  - [ ] Download
  - [ ] Subtitle editor
  - [ ] Download subtitles
- [ ] Transcribe from URLs (any source supported by yt-dlp)
- [ ] **Powerful subtitle editor**
  - Transcription highlighting based on media position
  - CPS (Characters per second) warnings
  - Segment splitting
  - Segment insertion
  - Subtitle language selection
- [ ] **Quick and easy setup**: use the quick start script, or run through a few steps
- [ ] **AI summarization of transcriptions**: either using OpenAI or Ollama

### ✨ What's New

- No longer using MongoDB. Uses an MariaDB backend.
- Uses [WhisperX](https://github.com/m-bain/whisperX) backend: better accuracy, speaker diarization, alignment...
- Anysub isn't limited to a single machine! With the worker system, you can set up multiple whisperx-api workers on different servers (or on the same one). Anysub will then handle the tasks, making the best use of all available resources.

### 🧪 Testing

At present, there is no testing documentation. Comprehensive testing guidelines will be provided once the [To-Dos Before Release](#-todos-before-release) are completed.

### 🗺️ Post-release Roadmap

- [ ] Local folder as media input.
- [ ] Full-text search all transcriptions.
- [ ] User authentication.
- [ ] Audio recording from the browser.

### 🧱 Tech Stack

- Backend:
  - Golang
    - Iris
    - Ent
    - Asynq
  - Python3
    - FastAPI
    - WhisperX
  - Libretranslate
  - MariaDB
- Frontend:
  - (To be done)
