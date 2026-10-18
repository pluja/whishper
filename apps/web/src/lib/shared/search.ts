export function normalizeSearchText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function matchesSearch(query: string, fields: string[]): boolean {
  const needle = normalizeSearchText(query);
  return fields.some((field) => normalizeSearchText(field).includes(needle));
}
