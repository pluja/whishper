import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const baseUrl = process.env.UI_CHECK_BASE_URL;
const email = process.env.UI_CHECK_EMAIL;
const password = process.env.UI_CHECK_PASSWORD;
const outputDir = "/workspace/ui-check-output";
const widths = [390, 1024, 1440];
const themes = ["light", "dark"];
const blockingImpacts = new Set(["serious", "critical"]);
const LONG_PROJECT_NAME = "An unusually long project name that keeps going "
  .repeat(3)
  .trim();

// Baseline violations on screens that are not migrated yet, as "screen:rule".
// Each screen task removes its entries. Nothing new may be added.
const KNOWN_LEGACY = new Set([
  "studio:color-contrast",
  "studio:label-content-name-mismatch",
  "studio:target-size",
]);

const screens = [
  { name: "login", path: "/login", signedIn: false },
  {
    name: "setup",
    path: setupPath,
    signedIn: false,
    skipReason: "an owner already exists",
  },
  { name: "library", path: "/", signedIn: true },
  {
    name: "library-empty",
    path: emptyLibraryPath,
    signedIn: true,
    skipReason: "projects exist, so the empty state is not reachable",
  },
  {
    name: "studio",
    path: (page) => studioPath(page, true),
    signedIn: true,
    minWidth: 1024,
    skipReason: "no project has a transcript",
  },
  {
    name: "studio-no-cues",
    legacyScreen: "studio",
    path: (page) => studioPath(page, false),
    signedIn: true,
    minWidth: 1024,
    skipReason: "every project has a transcript",
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

// A studio has a transcript when it offers the export menu.
async function studioPath(page, withTranscript) {
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

async function emptyLibraryPath(page) {
  await open(page, "/");
  await page.locator("#project-list-title").waitFor();
  return (await projectLinks(page).count()) ? null : "/";
}

function projectLinks(page) {
  return page.locator('li a[href^="/projects/"]');
}

async function setupPath(page) {
  const response = await page.request.get(`${baseUrl}/setup`, {
    maxRedirects: 0,
  });
  return response.status() === 200 ? "/setup" : null;
}

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
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
      console.log(
        `SKIP ${screen.name}: ${screen.skipReason ?? "nothing to open"}`,
      );
      return 0;
    }
    await open(page, path);
    ranScreens.add(legacyScreen(screen));
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
    if (await scrollsHorizontally(page)) {
      throw new Error("the page scrolls horizontally");
    }
    return reportViolations(await axeViolations(page), screen, theme, width);
  } catch (error) {
    console.error(`${screen.name} ${theme} ${width}: ${error.message}`);
    return 1;
  } finally {
    await page.close();
  }
}

function legacyScreen(screen) {
  return screen.legacyScreen ?? screen.name;
}

async function scrollsHorizontally(page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

async function axeViolations(page, selector) {
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

async function focusedText(page) {
  return page.evaluate(() => document.activeElement?.textContent?.trim());
}

async function appliedTheme(page) {
  return page.evaluate(() => document.documentElement.dataset.theme);
}

async function openMenuWithKeyboard(page, trigger) {
  await trigger.focus();
  await page.keyboard.press("Enter");
  // The menu focuses its first item from the async toggle event, after it becomes visible.
  await page.waitForFunction(() =>
    document.activeElement?.getAttribute("role")?.startsWith("menuitem"),
  );
}

async function chooseTheme(page, trigger, key) {
  await openMenuWithKeyboard(page, trigger);
  await page.keyboard.press(key);
  await page.keyboard.press("Enter");
}

async function checkThemeMenuKeyboard(context, theme) {
  const page = await context.newPage();
  const label = `theme menu ${theme}`;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/");
    const trigger = page.getByRole("button", { name: "Theme" });
    const menu = page.getByRole("menu", { name: "Theme" });

    await openMenuWithKeyboard(page, trigger);
    if ((await focusedText(page)) !== "Light") {
      throw new Error("opening did not focus the first item");
    }
    await page.keyboard.press("ArrowDown");
    if ((await focusedText(page)) !== "Dark") {
      throw new Error("ArrowDown did not move focus to the next item");
    }
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    if (!(await trigger.evaluate((node) => node === document.activeElement))) {
      throw new Error("Escape did not return focus to the trigger");
    }

    await chooseTheme(page, trigger, "ArrowDown");
    if ((await appliedTheme(page)) !== "dark") {
      throw new Error("choosing Dark did not apply the dark theme");
    }
    await page.reload();
    await page.waitForLoadState("networkidle");
    if ((await appliedTheme(page)) !== "dark") {
      throw new Error("the Dark preference did not persist across reload");
    }

    await chooseTheme(page, trigger, "End");
    if ((await appliedTheme(page)) !== theme) {
      throw new Error(
        `choosing System did not follow the ${theme} system theme`,
      );
    }
    console.log(`${label}: keyboard, persistence and System ok`);
    return 0;
  } catch (error) {
    console.error(`${label}: ${error.message}`);
    return 1;
  } finally {
    await page.close();
  }
}

async function checkRowMenuRename(page) {
  const row = page.locator("main ul > li").first();
  const trigger = row.getByRole("button", { name: /^Actions for / });
  await openMenuWithKeyboard(page, trigger);
  await page.keyboard.press("ArrowDown");
  if ((await focusedText(page)) !== "Rename") {
    throw new Error("ArrowDown in the row menu did not reach Rename");
  }
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "Title" });
  await input.waitFor();
  await page.keyboard.press("Escape");
  await input.waitFor({ state: "detached" });
}

// Overrides the rendered name only, so the check never writes user data.
async function showLongProjectName(page) {
  await page.evaluate((name) => {
    const link = document.querySelector(
      'main ul > li h3 a[href^="/projects/"]',
    );
    link.textContent = name;
    link.title = name;
  }, LONG_PROJECT_NAME);
}

async function checkLongProjectName(context, theme) {
  const page = await context.newPage();
  const label = `library long name ${theme}`;
  let failures = 0;
  try {
    await open(page, "/");
    if (!(await projectLinks(page).count())) {
      console.log(`SKIP ${label}: no project row to check`);
      return 0;
    }
    await checkRowMenuRename(page);
    await showLongProjectName(page);
    for (const width of [widths[0], widths.at(-1)]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: `${outputDir}/library-long-name-${theme}-${width}.png`,
        fullPage: true,
      });
      if (await scrollsHorizontally(page)) {
        failures += 1;
        console.error(`${label} ${width}: the page scrolls horizontally`);
      }
      failures += reportViolations(
        await axeViolations(page),
        { name: "library" },
        theme,
        width,
      );
    }
    console.log(`${label}: row menu keyboard and long name layout ok`);
  } catch (error) {
    console.error(`${label}: ${error.message}`);
    failures += 1;
  } finally {
    await page.close();
  }
  return failures;
}

async function isFocused(locator) {
  return locator.evaluate((node) => node === document.activeElement);
}

async function separatorValue(separator) {
  return Number(await separator.getAttribute("aria-valuenow"));
}

async function checkPaneSeparator(page) {
  const separator = page.getByRole("separator", {
    name: "Resize transcript pane",
  });
  await separator.focus();
  const before = await separatorValue(separator);
  await page.keyboard.press("ArrowLeft");
  const widened = await separatorValue(separator);
  await page.keyboard.press("ArrowRight");
  const max = Number(await separator.getAttribute("aria-valuemax"));
  if (widened <= before && before < max) {
    throw new Error("ArrowLeft on the pane separator did not widen the pane");
  }
}

async function retranscribeUnavailableReason(page) {
  if (await page.getByText("No source media is attached").count()) {
    return "the project has no source media";
  }
  const running = page.getByRole("progressbar", {
    name: "Transcription progress",
  });
  return (await running.count()) ? "a transcription is running" : null;
}

async function checkRetranscribeDialog(page, theme) {
  const trigger = page.getByRole("button", { name: "Re-transcribe" });
  if (!(await trigger.count())) {
    const reason = await retranscribeUnavailableReason(page);
    if (!reason) {
      throw new Error(
        "Re-transcribe is missing on a studio with a transcript, source media and no active run",
      );
    }
    console.log(`SKIP re-transcribe dialog ${theme}: ${reason}`);
    return 0;
  }
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Re-transcribe" });
  await dialog.waitFor();
  await dialog.evaluate((node) =>
    Promise.all(node.getAnimations().map((animation) => animation.finished)),
  );
  await page.screenshot({
    path: `${outputDir}/studio-retranscribe-${theme}-1440.png`,
  });
  const failures = reportViolations(
    await axeViolations(page, "dialog[open]"),
    { name: "studio-retranscribe" },
    theme,
    1440,
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  if (!(await isFocused(trigger))) {
    throw new Error(
      "closing the re-transcribe dialog did not refocus its trigger",
    );
  }
  return failures;
}

async function checkExportMenu(page) {
  const trigger = page.getByRole("button", { name: "Export" });
  await openMenuWithKeyboard(page, trigger);
  if (!(await focusedText(page))?.startsWith("SRT")) {
    throw new Error("opening the export menu did not focus SRT");
  }
  await page.keyboard.press("Escape");
  await page.getByRole("menu", { name: "Export" }).waitFor({ state: "hidden" });
  if (!(await isFocused(trigger))) {
    throw new Error("Escape did not return focus to the export trigger");
  }
}

async function checkStudioKeyboard(context, theme) {
  const page = await context.newPage();
  const label = `studio keyboard ${theme}`;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const path = await studioPath(page, true);
    if (!path) {
      console.log(`SKIP ${label}: no project has a transcript`);
      return 0;
    }
    await checkPaneSeparator(page);
    const failures = await checkRetranscribeDialog(page, theme);
    await checkExportMenu(page);
    console.log(`${label}: separator, re-transcribe dialog and export menu ok`);
    return failures;
  } catch (error) {
    console.error(`${label}: ${error.message}`);
    return 1;
  } finally {
    await page.close();
  }
}

function reportViolations(violations, screen, theme, width) {
  let failures = 0;
  for (const violation of violations) {
    if (!blockingImpacts.has(violation.impact)) continue;
    const key = `${legacyScreen(screen)}:${violation.id}`;
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
    if (signedIn) {
      failures += await checkThemeMenuKeyboard(context, theme);
      failures += await checkLongProjectName(context, theme);
      failures += await checkStudioKeyboard(context, theme);
    }
    await context.close();
  }
}

await browser.close();
failures += reportStaleLegacy();
console.log(failures ? `${failures} ui-check failures` : "ui-check passed");
process.exit(failures ? 1 : 0);
