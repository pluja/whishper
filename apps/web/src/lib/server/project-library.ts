export const PROJECT_TITLE_MAX_LENGTH = 160;
export const PROJECT_SEARCH_MAX_LENGTH = 200;

export type ProjectLibrarySearch = {
  query: string;
  includeSubtitles: boolean;
};

export function parseProjectLibrarySearch(
  searchParams: URLSearchParams,
): ProjectLibrarySearch {
  return {
    query: (searchParams.get("q") ?? "")
      .trim()
      .slice(0, PROJECT_SEARCH_MAX_LENGTH),
    includeSubtitles: searchParams.get("scope") === "subtitles",
  };
}

export function normalizeProjectTitle(
  value: FormDataEntryValue | null,
): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PROJECT_TITLE_MAX_LENGTH);
}
