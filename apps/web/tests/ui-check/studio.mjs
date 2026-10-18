import { checkPickers } from "./pickers.mjs";
import { checkTimecodeField } from "./timecode.mjs";
import {
  axeViolations,
  focusedText,
  isFocused,
  openMenuWithKeyboard,
  outputDir,
  reportViolations,
  scrollsHorizontally,
  studioPath,
  widths,
} from "./shared.mjs";

const LONG_CUE_TEXT =
  "A very long cue line that keeps going without a break so the row has to wrap ".repeat(
    6,
  );

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
  let failures = reportViolations(
    await axeViolations(page, "dialog[open]"),
    { name: "studio-retranscribe" },
    theme,
    1440,
  );
  failures += await checkPickers(page, dialog, theme);
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

export async function checkStudioKeyboard(context, theme) {
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
    console.log(
      `${label}: separator, re-transcribe dialog, pickers and export menu ok`,
    );
    return failures;
  } catch (error) {
    console.error(`${label}: ${error.message}`);
    return 1;
  } finally {
    await page.close();
  }
}

// Sets the value in the DOM only. No input event fires, so nothing is saved.
async function showLongCueText(page) {
  await page
    .getByRole("textbox", { name: "Cue 1 text" })
    .evaluate((textarea, text) => {
      textarea.value = text;
    }, LONG_CUE_TEXT);
}

async function checkToolbarArrows(page) {
  const toolbar = page.getByRole("toolbar", { name: "Cue editing" });
  const tabStops = toolbar.locator('button[tabindex="0"]');
  if ((await tabStops.count()) !== 1) {
    throw new Error(
      "the cue editing toolbar does not have exactly one tab stop",
    );
  }
  await tabStops.focus();
  const before = await focusedLabel(page);
  await page.keyboard.press("End");
  const after = await focusedLabel(page);
  await page.keyboard.press("Home");
  if (before === after || (await focusedLabel(page)) !== before) {
    throw new Error("Home and End do not move focus inside the toolbar");
  }
}

// Moves the selection only, which is never saved.
async function checkTimelineKeys(page) {
  const cues = page.locator('[data-cue-part="whole"]');
  const count = await cues.count();
  const tabStops = page.locator('[data-cue-id] button[tabindex="0"]');
  if ((await tabStops.count()) !== Math.min(count, 1)) {
    throw new Error("the timeline cues do not have exactly one tab stop");
  }
  if (count < 2) return;
  const isRovingStop = (node) =>
    node === document.activeElement && node.tabIndex === 0;
  await tabStops.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  const second = await cues.nth(1).evaluate(isRovingStop);
  await page.keyboard.press("End");
  const last = await cues.nth(count - 1).evaluate(isRovingStop);
  if (!second || !last) {
    throw new Error("arrows, Home and End do not move the timeline tab stop");
  }
}

async function focusedLabel(page) {
  return page.evaluate(
    () =>
      document.activeElement?.getAttribute("aria-label") ??
      document.activeElement?.textContent?.trim(),
  );
}

async function checkShortcutGuide(page, theme) {
  const trigger = page.getByRole("button", { name: "Keyboard shortcuts" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await dialog.waitFor();
  await dialog.evaluate((node) =>
    Promise.all(node.getAnimations().map((animation) => animation.finished)),
  );
  await page.screenshot({
    path: `${outputDir}/studio-shortcuts-${theme}-${page.viewportSize().width}.png`,
  });
  const failures = reportViolations(
    await axeViolations(page, "dialog[open]"),
    { name: "studio-shortcuts" },
    theme,
    page.viewportSize().width,
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  if (!(await isFocused(trigger))) {
    throw new Error("closing the shortcut guide did not refocus its trigger");
  }
  return failures;
}

export async function checkStudioCues(context, theme) {
  const page = await context.newPage();
  const label = `studio cues ${theme}`;
  let failures = 0;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const path = await studioPath(page, true);
    if (!path) {
      console.log(`SKIP ${label}: no project has a transcript`);
      return 0;
    }
    await checkToolbarArrows(page);
    await checkTimelineKeys(page);
    failures += await checkTimecodeField(page, theme);
    await showLongCueText(page);
    for (const width of [widths[0], widths.at(-1)]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: `${outputDir}/studio-long-cue-${theme}-${width}.png`,
        fullPage: true,
      });
      if (await scrollsHorizontally(page)) {
        failures += 1;
        console.error(`${label} ${width}: the page scrolls horizontally`);
      }
      failures += reportViolations(
        await axeViolations(page),
        { name: "studio" },
        theme,
        width,
      );
      failures += await checkShortcutGuide(page, theme);
    }
    console.log(
      `${label}: toolbar and timeline keys, timecode field, long cue text and shortcut guide ok`,
    );
  } catch (error) {
    console.error(`${label}: ${error.message}`);
    failures += 1;
  } finally {
    await page.close();
  }
  return failures;
}
