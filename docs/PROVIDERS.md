# External providers

Anysub can transcribe with a speech service instead of a model on your own hardware. Any service that offers OpenAI's `/audio/transcriptions` API works: OpenAI, Groq, or a server you run yourself. A provider's models appear in the model picker next to the local ones, and people choose one each time they transcribe.

Choosing a provider's model sends that project's audio to the provider. It may keep the audio and charge for it under its own terms. Local models never send media anywhere.

## Add a provider

1. Open **Administration > External providers**.
2. Pick **OpenAI** or **Groq** to fill in the address, or **Other** for any other service. The base URL is the address its API paths start from, such as `https://api.openai.com/v1`.
3. Paste the API key. Self-hosted servers often need none.
4. Select **Add provider**.

Anysub checks the connection before it saves the provider, by asking for its model list at the base URL followed by `/models`. A wrong address, a missing `/v1` or a rejected key shows an error instead. It then adds the provider's transcription models from that list. Remove the ones you don't want, and use **Find models** later to add others.

Some self-hosted servers have no model list. For those, tick **The server has no model list**: Anysub saves the provider without the check, and you add its models with **Add by ID**, using the model ID from its documentation.

Edit a model to rename it or set its price in US dollars per minute of audio. With a price, the transcribe form shows what a run should cost, and the provider's page counts the transcriptions and their estimated cost. The provider's own bill is what counts.

The API key is stored in Anysub's database and never sent to a browser. The page shows only its last four characters, or nothing for a key shorter than 16 characters. Workers receive it with each transcription, so anyone with the worker token can read it. When you change the base URL to another server, Anysub asks for the key again, so the old key never goes to the new server.

Both Anysub's web server and its worker connect to the base URL, so use an address they can reach. Use `https://` for hosted services. Plain `http://` sends the key and the audio unencrypted, which suits only a server on your own network.

## Which models work

Subtitles need to know when each line is spoken, so a model must return timestamps. Whisper models do: OpenAI's `whisper-1` and Groq's `whisper-large-v3` and `whisper-large-v3-turbo`, for example. OpenAI's `gpt-4o-transcribe` and `gpt-4o-mini-transcribe`, and Mistral's Voxtral models, which providers such as Tinfoil serve without timestamps, return text only, so Anysub doesn't offer them.

Word alignment and batch size don't apply to provider models: the provider times the words itself.

## Long recordings

Anysub converts the audio to small MP3 files before sending it, and splits recordings longer than 10 minutes at pauses, so no word is cut in half. It sends up to three parts at once and joins the results on one timeline. When a provider limits requests or has a brief outage, Anysub waits as long as the provider asks, up to a minute, and tries each part up to five times. If a part still fails, the transcription stops with the provider's error. Anysub doesn't start it again by itself, because that would send, and could bill, every part again.

## When a transcription fails

The error names the problem. The most common ones:

- **Rejected the API key**: edit the provider and paste the key again.
- **No model named ...**: the model ID is wrong, or the base URL points to the wrong API version.
- **Does not return timestamps**: choose a Whisper model.
- **Removed this remote model**: an administrator removed the model after the transcription was queued. Choose another model.
