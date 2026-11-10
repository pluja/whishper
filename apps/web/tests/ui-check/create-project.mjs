import {
  animationsFinished,
  axeViolations,
  open,
  outputDir,
  reportViolations,
  widths,
} from "./shared.mjs";

const LONG_FILE_NAME = `${"A recording with an unusually long file name ".repeat(4).trim()} [f2pYYgxOhvQ].mp4`;

async function dialogScrollsHorizontally(dialog) {
  return dialog.evaluate((node) => node.scrollWidth > node.clientWidth);
}

export async function checkCreateProjectDialog(context, theme) {
  const page = await context.newPage();
  const label = `new project dialog ${theme}`;
  let failures = 0;
  try {
    await open(page, "/");
    await page.getByRole("button", { name: "New project" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await dialog.waitFor();
    await animationsFinished(dialog);
    await dialog.locator('input[type="file"]').setInputFiles({
      name: LONG_FILE_NAME,
      mimeType: "video/mp4",
      buffer: Buffer.alloc(1024),
    });
    await dialog.getByText(LONG_FILE_NAME).waitFor();
    for (const width of [widths[0], widths.at(-1)]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: `${outputDir}/new-project-long-file-${theme}-${width}.png`,
      });
      if (await dialogScrollsHorizontally(dialog)) {
        failures += 1;
        console.error(`${label} ${width}: the dialog scrolls horizontally`);
      }
      failures += reportViolations(
        await axeViolations(page, "dialog[open]"),
        { name: "new project dialog" },
        theme,
        width,
      );
    }
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "hidden" });
    if (!failures) console.log(`${label}: long file name layout ok`);
  } catch (error) {
    console.error(`${label}: ${error.message}`);
    failures += 1;
  } finally {
    await page.close();
  }
  return failures;
}
