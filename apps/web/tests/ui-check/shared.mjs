import { AxeBuilder } from "@axe-core/playwright";

export const baseUrl = process.env.UI_CHECK_BASE_URL;
export const outputDir = "/workspace/ui-check-output";
export const widths = [390, 1024, 1440];
const blockingImpacts = new Set(["serious", "critical"]);

export async function open(page, path) {
  const response = await page.goto(`${baseUrl}${path}`);
  if (!response?.ok()) {
    throw new Error(`${path} responded ${response?.status()}`);
  }
  const finalPath = new URL(page.url()).pathname;
  if (finalPath !== path) {
    throw new Error(`${path} ended up on ${finalPath}`);
  }
  await page.waitForLoadState("networkidle");
}

// A studio has a transcript when it offers the export menu.
export async function studioPath(page, withTranscript) {
  await open(page, "/");
  await page.locator("#project-list-title").waitFor();
  const paths = await projectLinks(page).evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  for (const path of new Set(paths)) {
    await open(page, path);
    const exportCount = await page
      .getByRole("button", { name: "Export" })
      .count();
    if (exportCount > 0 === withTranscript) return path;
  }
  return null;
}

export function projectLinks(page) {
  return page.locator('li a[href^="/projects/"]');
}

export async function scrollsHorizontally(page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

export async function axeViolations(page, selector) {
  const builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
  ]);
  const results = await (
    selector ? builder.include(selector) : builder
  ).analyze();
  return results.violations;
}

export async function focusedText(page) {
  return page.evaluate(() => document.activeElement?.textContent?.trim());
}

export async function openMenuWithKeyboard(page, trigger) {
  await trigger.focus();
  await page.keyboard.press("Enter");
  // The menu focuses its first item from the async toggle event, after it becomes visible.
  await page.waitForFunction(() =>
    document.activeElement?.getAttribute("role")?.startsWith("menuitem"),
  );
}

export async function isFocused(locator) {
  return locator.evaluate((node) => node === document.activeElement);
}

export function reportViolations(violations, screen, theme, width) {
  let failures = 0;
  for (const violation of violations) {
    if (!blockingImpacts.has(violation.impact)) continue;
    failures += 1;
    console.error(
      `${screen.name} ${theme} ${width}: ${violation.id} (${violation.nodes.length} nodes) ${violation.help}`,
    );
  }
  return failures;
}
