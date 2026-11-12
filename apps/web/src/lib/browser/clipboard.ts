// The Clipboard API exists only in secure contexts, so an instance served over
// plain HTTP on a LAN has none.
export async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
