import type { ParamMatcher } from "@sveltejs/kit";
import { isUuid } from "$lib/shared/uuid";

export const match: ParamMatcher = (param) => isUuid(param);
