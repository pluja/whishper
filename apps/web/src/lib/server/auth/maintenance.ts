import { deleteLongExpiredApiTokens } from "#lib/server/auth/api-tokens.ts";

const TOKEN_SWEEP_INTERVAL_MS = 3_600_000;

let started = false;

export function startTokenMaintenance(): void {
  if (started) return;
  started = true;
  const run = () => {
    try {
      deleteLongExpiredApiTokens(new Date());
    } catch (cause) {
      console.error("Deleting expired API tokens failed", cause);
    }
  };
  run();
  setInterval(run, TOKEN_SWEEP_INTERVAL_MS).unref();
}
