import { defineParams } from "@sveltejs/kit/params";
import { isUuid } from "#lib/shared/uuid.ts";

export const params = defineParams({
  uuid: (param) => (isUuid(param) ? param : undefined),
});
