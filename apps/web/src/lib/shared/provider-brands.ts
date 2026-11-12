// Services Anysub recognizes from a provider's name or host, to show their
// icon. Only some have an icon with a license that allows it; the others get
// a monogram of the provider's name.
const ICONED_BRANDS = [
  "openai",
  "mistral",
  "groq",
  "ollama",
  "lmstudio",
  "nanogpt",
  "tinfoil",
] as const;
const MONOGRAM_BRANDS = ["ppq", "llamacpp"] as const;

export type IconedProviderBrand = (typeof ICONED_BRANDS)[number];
export type ProviderBrand =
  IconedProviderBrand | (typeof MONOGRAM_BRANDS)[number];

// Matched against the host, not the path: Groq's API lives under /openai/v1.
const KEYWORDS: Record<ProviderBrand, string[]> = {
  openai: ["openai"],
  mistral: ["mistral"],
  groq: ["groq"],
  ollama: ["ollama"],
  lmstudio: ["lmstudio", "lm studio", "lm-studio"],
  nanogpt: ["nano-gpt", "nanogpt"],
  ppq: ["ppq"],
  tinfoil: ["tinfoil"],
  llamacpp: ["llama.cpp", "llamacpp", "llama-cpp", "llama-server"],
};

export function detectProviderBrand(
  name: string,
  baseUrl: string,
): ProviderBrand | null {
  let host = "";
  try {
    host = new URL(baseUrl).host;
  } catch {
    // An unreadable URL still lets the name decide.
  }
  const haystack = `${name} ${host}`.toLowerCase();
  const brands = Object.keys(KEYWORDS) as ProviderBrand[];
  return (
    brands.find((brand) =>
      KEYWORDS[brand].some((keyword) => haystack.includes(keyword)),
    ) ?? null
  );
}

export function hasProviderIcon(
  brand: ProviderBrand | null,
): brand is IconedProviderBrand {
  return (ICONED_BRANDS as readonly (ProviderBrand | null)[]).includes(brand);
}
