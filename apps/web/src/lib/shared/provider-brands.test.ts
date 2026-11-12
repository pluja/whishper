import { describe, expect, it } from "vitest";

import { detectProviderBrand } from "#lib/shared/provider-brands.ts";

describe("detectProviderBrand", () => {
  it.each([
    ["Groq", "https://api.groq.com/openai/v1", "groq"],
    ["My speech API", "https://api.openai.com/v1", "openai"],
    ["Tinfoil", "https://tinfoil.example.net/v1", "tinfoil"],
    ["Cheap", "https://nano-gpt.com/api/v1", "nanogpt"],
    ["PayPerQ", "https://api.ppq.ai/v1", "ppq"],
    ["La Plateforme", "https://api.mistral.ai/v1", "mistral"],
    ["llama-server", "http://speech:8080/v1", "llamacpp"],
    ["Ollama", "http://host.docker.internal:11434/v1", "ollama"],
    ["Home server", "http://192.168.1.20:8000/v1", null],
  ])("recognizes %s at %s", (name, baseUrl, brand) => {
    expect(detectProviderBrand(name, baseUrl)).toBe(brand);
  });
});
