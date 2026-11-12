# API

Anysub has a REST API for scripts and other apps: upload media, transcribe it, and download the subtitles. Every endpoint and field is listed on the **API reference** page in Anysub itself, under the account menu, for the version you run. Tools that read OpenAPI can use `/api/v1/openapi.json`.

## Tokens

Create a token under **Account and API tokens** in the account menu. Give it a name, choose what it can do and when it expires, confirm with your password, and copy it right away: Anysub shows it only once and keeps only a hash. Each account can have up to 50 tokens.

- **Read only** tokens can list and download.
- **Read and write** tokens can also upload, start and cancel transcriptions, and delete projects.

Send the token with every request:

```sh
curl -H "Authorization: Bearer $ANYSUB_TOKEN" https://anysub.example/api/v1/me
```

A token acts as you, with your rights in each workspace you belong to. Revoke it on the same page when you no longer need it. The page also shows when each token was last used. Changing or resetting your password revokes all your tokens, so whoever knew the old password loses access through them too.

## From a file to subtitles

```sh
API=https://anysub.example/api/v1
AUTH="Authorization: Bearer $ANYSUB_TOKEN"

# 1. Upload. The answer is the new project.
project=$(curl -s -H "$AUTH" -H "Content-Type: video/mp4" \
  --data-binary @talk.mp4 "$API/projects?filename=talk.mp4" | jq -r .id)

# 2. Pick a model from GET /models and start a transcription.
run=$(curl -s -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"model": "whisperx:large-v3-turbo"}' \
  "$API/projects/$project/transcriptions" | jq -r .id)

# 3. Poll until the status is completed, failed or cancelled.
curl -s -H "$AUTH" "$API/projects/$project/transcriptions/$run" | jq .status

# 4. Download the subtitles of the track the run made.
track=$(curl -s -H "$AUTH" "$API/projects/$project/transcriptions/$run" | jq -r .trackId)
curl -s -H "$AUTH" -o talk.srt "$API/projects/$project/tracks/$track/export/srt"
```

Options you leave out, such as the language or line length, take the defaults set under **Administration > Transcription**. A model refuses options it doesn't take: external models, for example, have no word alignment.

## Large files

`POST /api/v1/projects` takes the file as the request body, up to the server's request limit: 64 MB by default, set by `ANYSUB_BODY_SIZE_LIMIT`. For larger files, or connections that drop, use the resumable [tus](https://tus.io) upload at `/api/uploads` with a read and write token. Tus clients exist for most languages, such as `tuspy` for Python and `tus-js-client` for JavaScript. Set these metadata fields:

- `filename`: the file's name.
- `workspaceId`: from `GET /api/v1/me`.
- `projectName` (optional).

When the upload finishes, the `Upload-Project` response header holds the new project's ID.

## Errors

Every error answers with the same shape and a fitting HTTP status:

```json
{
  "error": {
    "code": "conflict",
    "message": "This project is already being transcribed."
  }
}
```

The `message` is plain English and safe to show. A `401` means the token is missing, unknown or expired, and a `403` that it may not do this, such as a read-only token trying to upload.

## Times

Cue and word times are integer microseconds from the start of the media: `startUs: 1500000` is 1.5 seconds.
