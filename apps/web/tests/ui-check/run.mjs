import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const baseUrl = process.env.UI_CHECK_BASE_URL;
const email = process.env.UI_CHECK_EMAIL;
const password = process.env.UI_CHECK_PASSWORD;
const outputDir = "/workspace/ui-check-output";
const widths = [390, 1024, 1440];
const themes = ["light", "dark"];
const blockingImpacts = new Set(["serious", "critical"]);

// Baseline violations on screens that are not migrated yet, as "screen:rule".
// Each screen task removes its entries. Nothing new may be added.
const KNOWN_LEGACY = new Set([
  "login:color-contrast",
  "studio:color-contrast",
  "studio:label-content-name-mismatch",
  "studio:target-size",
]);

const screens = [
  { name: "login", path: "/login", signedIn: false },
  { name: "library", path: "/", signedIn: true },
  {
    name: "studio",
    path: firstProjectPath,
    signedIn: true,
    minWidth: 1024,
  },
];

const usedLegacy = new Set();
const ranScreens = new Set();

async function open(page, path) {
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

async function firstProjectPath(page) {
  await open(page, "/");
  await page.locator("#project-list-title").waitFor();
  const link = page.locator('a[href^="/projects/"]').first();
  return (await link.count()) ? await link.getAttribute("href") : null;
}

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /open workspace/i }).click();
  await page.waitForURL(`${baseUrl}/`);
  await page.close();
}

async function checkScreen(context, screen, theme, width) {
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width, height: 900 });
    const path = await (typeof screen.path === "function"
      ? screen.path(page)
      : screen.path);
    if (!path) {
      console.log(`skip ${screen.name}: nothing to open`);
      return 0;
    }
    await open(page, path);
    ranScreens.add(screen.name);
    const appliedTheme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    if (appliedTheme !== theme) {
      throw new Error(`data-theme is ${appliedTheme}, expected ${theme}`);
    }
    await page.screenshot({
      path: `${outputDir}/${screen.name}-${theme}-${width}.png`,
      fullPage: true,
    });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    return reportViolations(results.violations, screen, theme, width);
  } catch (error) {
    console.error(`${screen.name} ${theme} ${width}: ${error.message}`);
    return 1;
  } finally {
    await page.close();
  }
}

function reportViolations(violations, screen, theme, width) {
  let failures = 0;
  for (const violation of violations) {
    if (!blockingImpacts.has(violation.impact)) continue;
    const key = `${screen.name}:${violation.id}`;
    const label = `${screen.name} ${theme} ${width}: ${violation.id} (${violation.nodes.length} nodes) ${violation.help}`;
    if (KNOWN_LEGACY.has(key)) {
      usedLegacy.add(key);
      console.log(`known legacy ${label}`);
    } else {
      failures += 1;
      console.error(label);
    }
  }
  return failures;
}

function reportStaleLegacy() {
  let failures = 0;
  for (const key of KNOWN_LEGACY) {
    const screenName = key.split(":")[0];
    if (ranScreens.has(screenName) && !usedLegacy.has(key)) {
      failures += 1;
      console.error(`stale KNOWN_LEGACY entry: ${key}, remove it`);
    }
  }
  return failures;
}

const browser = await chromium.launch();
let failures = 0;

for (const theme of themes) {
  for (const signedIn of [false, true]) {
    const context = await browser.newContext({ colorScheme: theme });
    if (signedIn) {
      try {
        await signIn(context);
      } catch (error) {
        console.error(`sign-in ${theme}: ${error.message}`);
        failures += 1;
        await context.close();
        continue;
      }
    }
    for (const screen of screens.filter((s) => s.signedIn === signedIn)) {
      const screenWidths = widths.filter(
        (width) => width >= (screen.minWidth ?? 0) || width === widths[0],
      );
      for (const width of screenWidths) {
        failures += await checkScreen(context, screen, theme, width);
      }
    }
    await context.close();
  }
}

await browser.close();
failures += reportStaleLegacy();
console.log(failures ? `${failures} ui-check failures` : "ui-check passed");
process.exit(failures ? 1 : 0);
