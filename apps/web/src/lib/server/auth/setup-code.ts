import { isInstanceInitialized } from "$lib/server/auth/instance";
import { generateHostCode, hostCodesMatch } from "$lib/server/auth/host-code";

// Held in memory: a restart prints a new code, which is also how a user who
// lost the log line gets one.
const setupCode = generateHostCode();

export function isSetupCode(provided: string): boolean {
  return hostCodesMatch(setupCode, provided);
}

export async function announceSetupCode(
  log: (message: string) => void = console.info,
): Promise<void> {
  if (await isInstanceInitialized()) return;
  log(
    `\nAnysub has no owner account yet. Open Anysub in a browser and enter this setup code:\n\n    ${setupCode}\n`,
  );
}
