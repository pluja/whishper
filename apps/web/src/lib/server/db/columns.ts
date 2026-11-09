import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { integer, text } from "drizzle-orm/sqlite-core";

// Milliseconds since the epoch, so drizzle reads the column back as a Date.
// The SQL default covers rows written outside drizzle as well.
const NOW_MS = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

export const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" });

export const timestampDefaultNow = (name: string) =>
  timestamp(name).notNull().default(NOW_MS);

export const createdAt = () => timestampDefaultNow("created_at");

export const updatedAt = () =>
  timestampDefaultNow("updated_at").$onUpdate(() => new Date());

export const flag = (name: string) => integer(name, { mode: "boolean" });

export const json = <T>(name: string) =>
  text(name, { mode: "json" }).$type<T>();

export const uuidPrimaryKey = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());
