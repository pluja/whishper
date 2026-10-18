import { normalizeSearchText } from "$lib/shared/search";
import { nextMenuIndex } from "./menu-keyboard";

const PAGE_SIZE = 10;

export type PickerSection<T> = {
  label: string;
  entries: { option: T; index: number }[];
};

export function nextPickerIndex(
  current: number,
  key: string,
  count: number,
): number | null {
  if (count === 0) return null;
  const from = Math.max(current, 0);
  if (key === "PageDown") return Math.min(from + PAGE_SIZE, count - 1);
  if (key === "PageUp") return Math.max(from - PAGE_SIZE, 0);
  return nextMenuIndex(
    current,
    key,
    Array<boolean>(count).fill(true),
  );
}

// Typing one letter again cycles through the options sharing it, as native selects do.
export function typeaheadIndex(
  labels: string[],
  current: number,
  typed: string,
): number | null {
  const query = normalizeSearchText(typed);
  if (!query || labels.length === 0) return null;
  const repeated = [...query].every((character) => character === query[0]);
  const prefix = repeated ? query[0] : query;
  const start = repeated || current < 0 ? current + 1 : current;
  for (let offset = 0; offset < labels.length; offset += 1) {
    const index = (start + offset) % labels.length;
    if (normalizeSearchText(labels[index]).startsWith(prefix)) return index;
  }
  return null;
}

export function groupIntoSections<T>(
  options: T[],
  group: (option: T) => string = () => "",
): PickerSection<T>[] {
  const sections: PickerSection<T>[] = [];
  options.forEach((option, index) => {
    const label = group(option);
    const last = sections.at(-1);
    if (last?.label === label) last.entries.push({ option, index });
    else sections.push({ label, entries: [{ option, index }] });
  });
  return sections;
}
