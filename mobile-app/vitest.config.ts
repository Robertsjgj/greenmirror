import { defineConfig } from 'vitest/config';

// Node environment: the tested modules are pure (no DOM, no Firebase).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
