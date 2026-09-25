import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:4321',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  env: {
    schema: {
      ADMIN_LOGIN: envField.string({ context: 'server', access: 'secret' }),
      ADMIN_PASSWORD: envField.string({ context: 'server', access: 'secret', min: 8 }),
    },
  },
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssMinify: 'lightningcss',
    },
  },
});
