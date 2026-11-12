export const PROVIDER_NAME_MAX_LENGTH = 60;

export type NewProviderModel = { remoteId: string; displayName: string };

export type AdminProviderModel = {
  id: string;
  remoteId: string;
  displayName: string;
  priceMicrosPerMinute: number | null;
  completedRuns: number;
  estimatedSpendMicros: number;
};

export type AdminProvider = {
  id: string;
  name: string;
  baseUrl: string;
  host: string;
  hasApiKey: boolean;
  // The last characters of the key, so an administrator can tell keys apart.
  apiKeyHint: string | null;
  models: AdminProviderModel[];
};

// "speech" models return timestamps, "text-only" ones return plain text that
// cannot be timed into subtitles, and "other" covers everything else a
// provider lists, such as chat models.
export type CatalogModelKind = "speech" | "text-only" | "other";

export type CatalogModel = {
  remoteId: string;
  kind: CatalogModelKind;
  added: boolean;
};

export type ProviderSetup = {
  name: string;
  addedModels: number;
  hasModelList: boolean;
};

export type ProviderPreset = {
  name: string;
  baseUrl: string;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
];

// These answer with text only, without the timestamps subtitles need:
// OpenAI's GPT-4o transcription models, and Mistral's Voxtral, which
// providers such as Tinfoil serve without timestamps.
const TEXT_ONLY_MODEL = /^gpt-4o(-mini)?-transcribe|voxtral/i;
const SPEECH_MODEL = /whisper|transcri|speech|\bstt\b|\basr\b/i;
// Speech synthesis and live streaming models share names with transcription
// ones but cannot take an uploaded file.
const NOT_TRANSCRIPTION = /tts|text-to-speech|realtime/i;

// Some providers label each listed model with a type, such as "audio" or
// "chat". When they do, the type decides; the name is a guess otherwise.
// Either way it is only a hint: the worker reports a model that turns out to
// return no timestamps when someone transcribes with it.
export function classifyRemoteModel(
  remoteId: string,
  type: string | null = null,
): CatalogModelKind {
  if (TEXT_ONLY_MODEL.test(remoteId)) return "text-only";
  if (NOT_TRANSCRIPTION.test(remoteId)) return "other";
  if (type !== null) {
    return /^(audio|stt|speech-to-text|transcription)$/i.test(type)
      ? "speech"
      : "other";
  }
  return SPEECH_MODEL.test(remoteId) ? "speech" : "other";
}
