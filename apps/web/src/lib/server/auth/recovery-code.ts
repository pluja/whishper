import { generateHostCode, hostCodesMatch } from "$lib/server/auth/host-code";

const CODE_LIFETIME_MS = 15 * 60_000;
// Asking again within this window keeps the current code, so repeated clicks
// cannot flood the log.
const REISSUE_AFTER_MS = 30_000;

type IssuedCode = { code: string; issuedAt: number };

let issued: IssuedCode | null = null;

export function issueRecoveryCode(
  log: (message: string) => void = console.info,
  now = Date.now(),
): void {
  if (issued && now - issued.issuedAt < REISSUE_AFTER_MS) return;
  issued = { code: generateHostCode(), issuedAt: now };
  log(
    `\nPassword recovery was requested in the browser. Enter this code on the recovery page within 15 minutes:\n\n    ${issued.code}\n`,
  );
}

export function isRecoveryCode(provided: string, now = Date.now()): boolean {
  return (
    issued !== null &&
    now - issued.issuedAt <= CODE_LIFETIME_MS &&
    hostCodesMatch(issued.code, provided)
  );
}

export function clearRecoveryCode(): void {
  issued = null;
}
