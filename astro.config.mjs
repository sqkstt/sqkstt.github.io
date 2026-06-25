// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://sqkstt.github.io',
  integrations: [sitemap()],
  vite: {
    cacheDir: '.astro/vite',
  },
  devToolbar: {
    enabled: false,
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
