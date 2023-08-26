# Golang API for Whishper

This is the Golang API for Whishper. It allows to have an interface between the Faster-Whisper-ASR service, the database and the web interface.

## Usage

### Websocket

It exposes a `/ws/transcriptions` websocket endpoint where JSON events will be received. This endpoint only receives updates, it will not send all the transcriptions in the database to the client when it connects. The websocket will also ignore all the events from the clients.

### REST API

#### GET: `/api/transcriptions`

This endpoint will return all the transcriptions in the database.

#### POST: `/api/transcriptions`

This endpoint expects a form with the following fields:

- `file` (form file): The file to transcribe (must be present, if `sourceURL` is not present)
- `sourceURL` (string): The URL of the file to transcribe (optional, if present, `file` will be ignored)
- `modelSize` (string): The model size to use (optional, if not present, the default model size will be used). The available model sizes are: `tiny`, `base`, `small`, `medium`, `large`. All variants of the model size are also available with enlgish-only models (e.g. `tiny.en`, `base.en`, etc.)
- `language` (string): The source language for the transcription. By default it uses `auto` which will detect the language automatically. Otherwise, use a two-letter language code (e.g. `en`, `fr`, `es`, etc.)

### Flags

- `-addr`: The address to listen to (default: `:8080`). Must specify the `:` before the port number.
- `-updir`: The path to the uploads directory (default: `/app/uploads`). Must exist and be writable.
- `-asr`: The address of the ASR service (default: `whisper-api:8000`).
- `-translation`: The address of the translation service (default: `translate:5000`).
- `-dev`: Turns development mode on. This will show debug logs.

## Project structure

# `main.go`

This is the main file of the project. It contains the main function calls.

# `api/`

This folder contains all the server logic. It is split into three files:

- `server.go`: This file contains the main server logic. It creates a server struct that contains all the necessary logic to run the server.
- `handlers.go`: This file contains all the handlers for the server. It also contains the logic.
- `websocket.go`: This file contains the logic for the websocket.

# `models/`

This folder contains all the models used by the server. Each model has its own file.

# `utils/`

This folder contains all the utility functions used by the server.

# `database/`

This folder contains all the database logic. It is split into two files:

- `database.go`: This file contains the main database logic. It creates a database interface that contains all the necessary logic to interact with the database.
- `mongo.go`: This implements the database interface for MongoDB.

# `monitor/`

This folder contains the logic for the background monitor that checks the pending transcriptions, transcribes them and updates the database.

