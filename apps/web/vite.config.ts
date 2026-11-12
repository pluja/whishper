import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

const DATABASE_TESTS = "src/**/*.db.test.ts";
const TEST_ENVIRONMENT = "src/lib/server/db/testing/environment.ts";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ precompress: true }),
      // Anysub answers on whatever address the browser used, so the fixed-origin
      // check is replaced by the Sec-Fetch-Site check in lib/server/http.
      csrf: { trustedOrigins: ["*"] },
    }),
  ],
  server: { allowedHosts: ["web"] },
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
