import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const buildOutput = process.env.ANYSUB_BUILD_OUTPUT ?? "build";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: buildOutput, precompress: true }),
  },
};

export default config;
