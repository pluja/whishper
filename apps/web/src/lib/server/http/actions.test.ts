import { isActionFailure, isRedirect, redirect } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

import { runFormAction } from "#lib/server/http/actions.ts";
import { conflict } from "#lib/server/http/errors.ts";

describe("runFormAction", () => {
  it("turns a client failure into an inline message", async () => {
    const result = await runFormAction(async () => {
      throw conflict("That download has already finished.");
    });

    expect(isActionFailure(result)).toBe(true);
    expect(result).toMatchObject({
      status: 409,
      data: { message: "That download has already finished." },
    });
  });

  it("passes redirects through", async () => {
    const result = runFormAction(() => redirect(303, "/"), "Not shown.");

    await expect(result).rejects.toSatisfy(isRedirect);
  });

  it("leaves other errors to the error hook without a fallback", async () => {
    const outage = new Error("disk full");

    await expect(
      runFormAction(() => {
        throw outage;
      }),
    ).rejects.toBe(outage);
  });

  it("logs other errors and shows the fallback when there is one", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const outage = new Error("disk full");

    const result = await runFormAction(() => {
      throw outage;
    }, "The project could not be deleted.");

    expect(result).toMatchObject({
      status: 500,
      data: { message: "The project could not be deleted." },
    });
    expect(log).toHaveBeenCalledWith(
      "The project could not be deleted.",
      outage,
    );
    log.mockRestore();
  });
});
