export function nextMenuIndex(
  current: number,
  key: string,
  enabled: boolean[],
): number | null {
  const count = enabled.length;
  if (!enabled.some(Boolean)) return null;
  const firstFrom = (start: number, step: number) => {
    for (let offset = 0; offset < count; offset += 1) {
      const index = (((start + step * offset) % count) + count) % count;
      if (enabled[index]) return index;
    }
    return null;
  };
  switch (key) {
    case "ArrowDown":
      return firstFrom(current + 1, 1);
    case "ArrowUp":
      return firstFrom(current < 0 ? count - 1 : current - 1, -1);
    case "Home":
      return firstFrom(0, 1);
    case "End":
      return firstFrom(count - 1, -1);
    default:
      return null;
  }
}
