//import adapter from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/kit/vite';
import dotenv from 'dotenv';

dotenv.config();
/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapterNode()
  },
  preprocess: vitePreprocess()
};
export default config;