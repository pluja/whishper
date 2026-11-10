import { generateHostCode, hostCodesMatch } from "$lib/server/auth/host-code";
import { pluralize } from "$lib/shared/format";
import { RECOVERY_CODE_LIFETIME_MINUTES } from "$lib/shared/limits";

const CODE_LIFETIME_MS = RECOVERY_CODE_LIFETIME_MINUTES * 60_000;
// Asking again within this window prints nothing, so repeated clicks cannot
// flood the log.
const REPRINT_AFTER_MS = 30_000;

type IssuedCode = { code: string; issuedAt: number; printedAt: number };

let issued: IssuedCode | null = null;

function isValid(code: IssuedCode | null, now: number): code is IssuedCode {
  return code !== null && now - code.issuedAt <= CODE_LIFETIME_MS;
}

// Anyone can ask for a code, so asking again reprints the valid one instead of
// replacing the code the owner may be typing.
export function issueRecoveryCode(
  log: (message: string) => void = console.info,
  now = Date.now(),
): void {
  if (!isValid(issued, now)) {
    issued = { code: generateHostCode(), issuedAt: now, printedAt: now };
  } else if (now - issued.printedAt < REPRINT_AFTER_MS) {
    return;
  } else {
    issued.printedAt = now;
  }
  const minutesLeft = Math.ceil(
    (issued.issuedAt + CODE_LIFETIME_MS - now) / 60_000,
  );
  log(
    `\nPassword recovery was requested in the browser. Enter this code on the recovery page within ${pluralize(minutesLeft, "minute")}:\n\n    ${issued.code}\n`,
  );
}

export function isRecoveryCode(provided: string, now = Date.now()): boolean {
  return isValid(issued, now) && hostCodesMatch(issued.code, provided);
}

export function clearRecoveryCode(): void {
  issued = null;
}
