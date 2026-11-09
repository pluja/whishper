import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ precompress: true }),
    // Anysub answers on whatever address the browser used, so the fixed-origin
    // check is replaced by the Sec-Fetch-Site check in lib/server/http.
    csrf: { trustedOrigins: ["*"] },
    typescript: {
      config: (config) => ({
        ...config,
        include: [...config.include, "../scripts/**/*.mjs"],
      }),
    },
  },
};

export default config;
