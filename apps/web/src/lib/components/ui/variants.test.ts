import { describe, expect, it } from "vitest";
import { badgeClasses, buttonClasses, CONTROL_CLASSES } from "./variants";

describe("buttonClasses", () => {
  it("combines base, variant and size classes", () => {
    const primary = buttonClasses("primary", "md");
    expect(primary).toContain("bg-accent");
    expect(primary).toContain("text-accent-fg");
    expect(primary).toContain("h-9");
    expect(buttonClasses("ghost", "sm")).toContain("h-8");
  });
  it("always includes a visible focus ring", () => {
    for (const variant of [
      "primary",
      "secondary",
      "ghost",
      "danger",
    ] as const) {
      expect(buttonClasses(variant, "md")).toContain(
        "focus-visible:outline-focus",
      );
    }
  });
  it("uses only semantic color tokens", () => {
    const all = [
      ...(["primary", "secondary", "ghost", "danger"] as const).map((v) =>
        buttonClasses(v, "md"),
      ),
      ...(["neutral", "accent", "success", "warning", "danger"] as const).map(
        badgeClasses,
      ),
      CONTROL_CLASSES,
    ].join(" ");
    expect(all).not.toMatch(
      /\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|indigo|red|green|amber)-\d/,
    );
    expect(all).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
