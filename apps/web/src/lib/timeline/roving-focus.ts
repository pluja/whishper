export function nextRovingIndex(
  current: number,
  key: string,
  count: number,
): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowRight":
      return Math.min(current + 1, count - 1);
    case "ArrowLeft":
      return Math.max(current - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function focusableCueIndex(
  selectedIndex: number,
  count: number,
): number {
  if (count === 0) return -1;
  return selectedIndex >= 0 && selectedIndex < count ? selectedIndex : 0;
}
