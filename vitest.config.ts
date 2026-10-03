import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'tests/**/*.test.ts'
    ],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts']
    }
  },
  resolve: {
    alias: {
      '@antislop/protocol': path.resolve(__dirname, './packages/antislop-protocol/src/index.ts'),
      '@antislop/sidecar': path.resolve(__dirname, './packages/antislop-sidecar/src/index.ts'),
      '@antislop/vscode-extension': path.resolve(__dirname, './packages/antislop-vscode-extension/src/index.ts'),
      '@antislop/theia-shell-extension': path.resolve(__dirname, './packages/theia-shell-extension/src/index.ts'),
      '@antislop/webview': path.resolve(__dirname, './packages/antislop-webview/src/index.ts')
    }
  }
});
