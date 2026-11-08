import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Three bundles: the main process (tray, printing, local storage), the
// preload bridge, and the window (UI + the job loop, which renders tickets
// with the same code the Tiko panel uses).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(__dirname, 'electron/main.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(__dirname, 'electron/preload.ts') } },
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    // The panel's printing code imports '@/lib/...': src/tiko mirrors that tree.
    resolve: { alias: { '@': resolve(__dirname, 'src/tiko') } },
    build: { rollupOptions: { input: resolve(__dirname, 'src/index.html') } },
    envDir: __dirname,
  },
});
