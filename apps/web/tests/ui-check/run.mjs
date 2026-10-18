import { chromium } from "playwright";
import {
  axeViolations,
  baseUrl,
  focusedText,
  open,
  openMenuWithKeyboard,
  outputDir,
  projectLinks,
  reportViolations,
  scrollsHorizontally,
  studioPath,
  widths,
} from "./shared.mjs";
import { checkStudioCues, checkStudioKeyboard } from "./studio.mjs";

const email = process.env.UI_CHECK_EMAIL;
const password = process.env.UI_CHECK_PASSWORD;
const themes = ["light", "dark"];
const LONG_PROJECT_NAME = "An unusually long project name that keeps going "
  .repeat(3)
  .trim();

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
    path: (page) => studioPath(page, false),
    signedIn: true,
    minWidth: 1024,
    skipReason: "every project has a transcript",
  },
];

async function emptyLibraryPath(page) {
  await open(page, "/");
  await page.locator("#project-list-title").waitFor();
  return (await projectLinks(page).count()) ? null : "/";
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

async function appliedTheme(page) {
  return page.evaluate(() => document.documentElement.dataset.theme);
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
      failures += await checkStudioCues(context, theme);
    }
    await context.close();
  }
}

await browser.close();
console.log(failures ? `${failures} ui-check failures` : "ui-check passed");
process.exit(failures ? 1 : 0);
