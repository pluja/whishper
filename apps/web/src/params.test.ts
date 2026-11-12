import { describe, expect, it } from "vitest";

import { params } from "./params.ts";

const matchUuid = (param: string) => params.uuid["~standard"].validate(param);

describe("uuid param matcher", () => {
  it("routes only UUIDs", async () => {
    const id = "b14d765a-0cb2-4fa8-af80-c563ab57c959";
    expect(await matchUuid(id)).toEqual({ value: id });
    expect(await matchUuid("not-a-uuid")).toHaveProperty("issues");
  });
});
