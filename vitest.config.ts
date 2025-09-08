import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10000, // Reduced timeout since no real API calls
    hookTimeout: 5000,
    setupFiles: ['./test/setup.ts'], // Global mocks
    include: ['**/*.test.{ts,js}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.git/**'
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,js}'],
      exclude: [
        'src/**/*.test.{ts,js}',
        'src/**/*.d.ts'
      ]
    }
  },
  esbuild: {
    target: 'node18'
  }
});