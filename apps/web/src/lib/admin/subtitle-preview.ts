// Mirrors the worker's split closely enough to preview a line length: whole
// words, each subtitle as long as the limit allows.
export function splitIntoSubtitles(text: string, maxLength: number): string[] {
  const subtitles: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength && current) {
      subtitles.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) subtitles.push(current);
  return subtitles;
}
