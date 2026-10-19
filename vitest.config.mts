import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __DEV__: true },
  test: { include: ['tests/unit/**/*.test.{ts,tsx}'], clearMocks: true },
});
