import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

const DATABASE_TESTS = "src/**/*.db.test.ts";
const TEST_ENVIRONMENT = "src/lib/server/db/testing/environment.ts";

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
          setupFiles: [TEST_ENVIRONMENT],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: [DATABASE_TESTS],
          setupFiles: [TEST_ENVIRONMENT, "src/lib/server/db/testing/setup.ts"],
        },
      },
    ],
  },
});
