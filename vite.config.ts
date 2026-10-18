/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// GitHub Pages serves the site from https://<user>.github.io/petri/,
// so every asset URL must be prefixed with /petri/ in production builds.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/petri/' : '/',
  build: { target: 'es2022' },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
}));
