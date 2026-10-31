import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Todos los archivos usan el mismo DynamoDB Local: de a uno, para que no se pisen las tablas.
    fileParallelism: false,
  },
});
