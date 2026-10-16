import type { Pool, PoolClient } from "pg";

export type Queryable = Pick<PoolClient, "query">;
export type Connectable = Pick<Pool, "connect">;
