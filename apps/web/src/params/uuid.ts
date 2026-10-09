import type { ParamMatcher } from "@sveltejs/kit";
import { isUuid } from "$lib/uuid";

export const match: ParamMatcher = (param) => isUuid(param);
