import {
  axeViolations,
  isFocused,
  outputDir,
  reportViolations,
} from "./shared.mjs";

async function openWithArrowDown(page, trigger, focusedRole) {
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  // The picker moves focus from its async toggle event, once it is visible.
  await page.waitForFunction(
    (role) => document.activeElement?.getAttribute("role") === role,
    focusedRole,
  );
}

async function captureOpenPicker(page, popover, name, theme) {
  await popover.evaluate((node) =>
    Promise.all(node.getAnimations().map((animation) => animation.finished)),
  );
  await page.screenshot({ path: `${outputDir}/${name}-${theme}-1440.png` });
  return reportViolations(
    await axeViolations(page, "dialog[open]"),
    { name },
    theme,
    1440,
  );
}

async function closeWithEscape(page, scope, trigger, popover, name) {
  await page.keyboard.press("Escape");
  await popover.waitFor({ state: "hidden" });
  if (!(await isFocused(trigger))) {
    throw new Error(`Escape did not return focus to the ${name} trigger`);
  }
  if (!(await scope.isVisible())) {
    throw new Error(`Escape in the ${name} closed the surrounding dialog too`);
  }
}

// Searches and browses only; Escape closes each picker without choosing.
export async function checkPickers(page, scope, theme) {
  const languageTrigger = scope.getByRole("button", {
    name: /^Spoken language/,
  });
  const languageInput = scope.locator('input[name="language"]');
  const languageBefore = await languageInput.inputValue();
  const languagePopover = scope.getByRole("dialog", {
    name: "Choose the spoken language",
  });
  await openWithArrowDown(page, languageTrigger, "combobox");
  await page.keyboard.type("espa");
  const matches = await languagePopover.getByRole("option").allTextContents();
  if (matches.length !== 1 || !matches[0].includes("Spanish")) {
    throw new Error(`searching "espa" listed ${matches.join(", ")}`);
  }
  let failures = await captureOpenPicker(
    page,
    languagePopover,
    "picker-language",
    theme,
  );
  await closeWithEscape(
    page,
    scope,
    languageTrigger,
    languagePopover,
    "language picker",
  );
  if ((await languageInput.inputValue()) !== languageBefore) {
    throw new Error("Escape changed the chosen language");
  }

  const modelTrigger = scope.getByRole("button", { name: /^Model/ });
  const modelPopover = scope.getByRole("dialog", { name: "Choose a model" });
  await openWithArrowDown(page, modelTrigger, "listbox");
  failures += await captureOpenPicker(
    page,
    modelPopover,
    "picker-model",
    theme,
  );
  await closeWithEscape(
    page,
    scope,
    modelTrigger,
    modelPopover,
    "model picker",
  );
  return failures;
}
