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

export async function animationsFinished(locator) {
  await locator.evaluate((node) =>
    Promise.all(node.getAnimations().map((animation) => animation.finished)),
  );
}

export async function focusedText(page) {
  return page.evaluate(() => document.activeElement?.textContent?.trim());
}

async function describeFocus(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return "the page body";
    const name = element.getAttribute("aria-label") ?? element.textContent;
    return `<${element.tagName.toLowerCase()}> "${name?.trim().slice(0, 40)}"`;
  });
}

async function waitForStep(page, step, condition, argument) {
  try {
    await page.waitForFunction(condition, argument);
  } catch (error) {
    throw new Error(
      `${step}; focus was on ${await describeFocus(page).catch(() => "an unknown element (page context lost)")} (${error.message.split("\n")[0]})`,
    );
  }
}

// Opening is two observable steps: the trigger reports its popup open, then
// the popup's async toggle handler moves focus inside. A failure names the
// step that never happened instead of a bare timeout.
export async function openPopupWithKey(page, trigger, key, focusedRole) {
  await trigger.focus();
  await page.keyboard.press(key);
  await waitForStep(
    page,
    `${key} did not open the popup`,
    (node) => node.getAttribute("aria-expanded") === "true",
    await trigger.elementHandle(),
  );
  await waitForStep(
    page,
    `the open popup did not take focus (${focusedRole})`,
    (role) => document.activeElement?.getAttribute("role")?.startsWith(role),
    focusedRole,
  );
}

export async function openMenuWithKeyboard(page, trigger) {
  await openPopupWithKey(page, trigger, "Enter", "menuitem");
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
