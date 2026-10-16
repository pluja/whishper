import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

const DATABASE_TESTS = "src/**/*.db.test.ts";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    allowedHosts: ["web"],
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          exclude: [DATABASE_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: [DATABASE_TESTS],
          globalSetup: ["src/lib/server/db/testing/global-setup.ts"],
          setupFiles: ["src/lib/server/db/testing/setup.ts"],
          // Lease reclaim and the upload sweep act on every matching row, so
          // files sharing the database must not run concurrently.
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
