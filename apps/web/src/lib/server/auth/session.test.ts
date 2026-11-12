import { isHttpError, isRedirect } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";

import {
  requireAdminOrLogin,
  requireUser,
  requireUserOrLogin,
} from "./session";

const user = { id: "user-1" } as NonNullable<App.Locals["user"]>;
const signedIn = { user, session: null } as App.Locals;
const signedOut = { user: null, session: null } as App.Locals;

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (thrown) {
    return thrown;
  }
  throw new Error("Expected a throw");
}

describe("requireUser", () => {
  it("returns the signed-in user", () => {
    expect(requireUser(signedIn)).toBe(user);
  });

  it("answers 401 without a session", () => {
    const thrown = thrownBy(() => requireUser(signedOut));
    expect(isHttpError(thrown, 401)).toBe(true);
  });
});

describe("requireUserOrLogin", () => {
  it("returns the signed-in user", () => {
    expect(requireUserOrLogin(signedIn)).toBe(user);
  });

  it("redirects to the login page without a session", () => {
    const thrown = thrownBy(() => requireUserOrLogin(signedOut));
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ status: 303, location: "/login" });
  });
});

describe("requireAdminOrLogin", () => {
  const admin = { id: "admin-1", role: "admin" } as NonNullable<
    App.Locals["user"]
  >;

  it("returns the administrator", () => {
    expect(
      requireAdminOrLogin({ user: admin, session: null, apiScope: null }),
    ).toBe(admin);
  });

  it("answers 403 to other accounts", () => {
    const member = { ...admin, role: "user" };
    const thrown = thrownBy(() =>
      requireAdminOrLogin({ user: member, session: null, apiScope: null }),
    );
    expect(isHttpError(thrown, 403)).toBe(true);
  });

  it("redirects to the login page without a session", () => {
    expect(isRedirect(thrownBy(() => requireAdminOrLogin(signedOut)))).toBe(
      true,
    );
  });
});
