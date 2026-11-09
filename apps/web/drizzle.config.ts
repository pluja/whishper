import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/lib/server/auth/schema.ts", "./src/lib/server/db/schema.ts"],
  out: "./migrations",
  strict: true,
});
