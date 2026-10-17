import { mkdir } from "node:fs/promises";
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

async function firstProjectPath(page) {
  await page.goto(`${baseUrl}/`);
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
  await page.setViewportSize({ width, height: 900 });
  const path = await (typeof screen.path === "function"
    ? screen.path(page)
    : screen.path);
  if (!path) {
    console.log(`skip ${screen.name}: nothing to open`);
    await page.close();
    return 0;
  }
  await page.goto(`${baseUrl}${path}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: `${outputDir}/${screen.name}-${theme}-${width}.png`,
    fullPage: true,
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  let failures = 0;
  for (const violation of results.violations) {
    if (!blockingImpacts.has(violation.impact)) continue;
    const label = `${screen.name} ${theme} ${width}: ${violation.id} (${violation.nodes.length} nodes) ${violation.help}`;
    if (KNOWN_LEGACY.has(`${screen.name}:${violation.id}`)) {
      console.log(`known legacy ${label}`);
    } else {
      failures += 1;
      console.error(label);
    }
  }
  await page.close();
  return failures;
}

const browser = await chromium.launch();
await mkdir(outputDir, { recursive: true });
let failures = 0;

for (const theme of themes) {
  for (const signedIn of [false, true]) {
    const context = await browser.newContext({ colorScheme: theme });
    if (signedIn) await signIn(context);
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
console.log(
  failures ? `${failures} serious accessibility violations` : "ui-check passed",
);
process.exit(failures ? 1 : 0);
