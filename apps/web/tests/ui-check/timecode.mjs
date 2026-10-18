import { axeViolations, outputDir, reportViolations } from "./shared.mjs";

async function focusedLabel(page) {
  return page.evaluate(() =>
    document.activeElement?.getAttribute("aria-label"),
  );
}

// A refused paste never reaches the cues, so nothing is saved.
async function pasteText(field, text) {
  await field.evaluate((input, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

async function describedTexts(field) {
  return field.evaluate((input) =>
    (input.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? null),
  );
}

async function checkRowTabOrder(page, field) {
  await field.focus();
  await page.keyboard.press("Tab");
  const button = await focusedLabel(page);
  await page.keyboard.press("Tab");
  const endField = await focusedLabel(page);
  if (button !== "Set start to playhead" || endField !== "Cue 1 end time") {
    throw new Error(
      `Tab from the start time reached ${button}, then ${endField}`,
    );
  }
}

export async function checkTimecodeField(page, theme) {
  const field = page.getByRole("textbox", { name: "Cue 1 start time" });
  const original = await field.inputValue();
  if ((await field.getAttribute("inputmode")) !== "numeric") {
    throw new Error("the cue start time does not ask for a numeric keyboard");
  }
  const [hint] = await describedTexts(field);
  if (!hint?.startsWith("Type digits")) {
    throw new Error("the cue start time is not described by the key hint");
  }
  await checkRowTabOrder(page, field);
  await field.focus();
  await pasteText(field, "not a time");
  const descriptions = await describedTexts(field);
  if (
    (await field.getAttribute("aria-invalid")) !== "true" ||
    !descriptions.at(-1)?.startsWith("Paste a time")
  ) {
    throw new Error("an unparsable paste did not show the inline error");
  }
  await page.screenshot({
    path: `${outputDir}/studio-timecode-error-${theme}-1440.png`,
  });
  const failures = reportViolations(
    await axeViolations(page),
    { name: "studio-timecode-error" },
    theme,
    1440,
  );
  await page.keyboard.press("Escape");
  if (
    (await field.getAttribute("aria-invalid")) !== null ||
    (await field.inputValue()) !== original
  ) {
    throw new Error("Escape did not clear the inline error");
  }
  await page.keyboard.press("Tab");
  return failures;
}
