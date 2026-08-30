import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config.ts';

export default defineConfig({
  plugins: [vue(), crx({ manifest })],
  define: { 'import.meta.env.VITE_TARGET_BROWSER': JSON.stringify(process.env.TARGET_BROWSER || 'chrome') },
  server: {
    port: 5175,
    strictPort: true,
    hmr: { port: 5175 },
  },
});
