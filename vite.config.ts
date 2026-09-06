import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';

export default defineConfig({
  base: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`,
  css: { postcss: { plugins: [tailwindcss()] } },
  // GitHub's clean source export deliberately excludes local hosting metadata.
  plugins: [vinext(), ...(existsSync('.openai/hosting.json') ? [sites()] : [])],
});
