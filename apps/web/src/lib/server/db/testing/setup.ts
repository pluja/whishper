import { sql } from "drizzle-orm";
import { afterEach } from "vitest";

import { db } from "$lib/server/db";

afterEach(() => {
  const tables = db.all<{ name: string }>(
    sql`select name from sqlite_master
         where type = 'table'
           and name not like 'sqlite_%'
           and name not like '__drizzle%'`,
  );
  db.run(sql`pragma foreign_keys = off`);
  for (const { name } of tables) db.run(sql.raw(`delete from "${name}"`));
  db.run(sql`pragma foreign_keys = on`);
});
