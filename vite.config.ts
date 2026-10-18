/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// GitHub Pages serves the site from https://<user>.github.io/petri/,
// so every asset URL must be prefixed with /petri/ in production builds.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/petri/' : '/',
  build: {
    target: 'es2022',
    // Several HTML pages: the game, the design mockup and the creature sheet.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        mockup: resolve(__dirname, 'mockup.html'),
        creatures: resolve(__dirname, 'creatures.html'),
      },
    },
  },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
}));
