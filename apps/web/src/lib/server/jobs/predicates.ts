import { eq, inArray } from "drizzle-orm";

import { jobs } from "$lib/server/db/schema";

export const isMediaPrepareJob = eq(jobs.kind, "media_prepare");
export const isActiveJob = inArray(jobs.state, ["queued", "leased"]);
