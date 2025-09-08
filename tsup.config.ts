import { defineConfig } from 'tsup';

export default defineConfig({
  // CLI-only build
  entry: ['bin/cli.ts'],
  format: ['esm'], // Use ESM to support top-level await
  dts: false,
  clean: true,
  target: 'node18',
  external: ['vitest']
});