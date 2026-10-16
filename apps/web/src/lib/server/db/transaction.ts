import type { PoolClient } from "pg";

import { pool } from "./index";
import type { Connectable } from "./types";

// A failed rollback leaves the connection in an unknown state, so it is
// destroyed instead of returned to the pool. The original error always wins.
export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
  source: Connectable = pool,
): Promise<T> {
  const client = await source.connect();
  let discardClient = false;
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (cause) {
    try {
      await client.query("rollback");
    } catch {
      discardClient = true;
    }
    throw cause;
  } finally {
    client.release(discardClient);
  }
}
