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
    // La primera carga de Nest y la generación de claves RSA pueden tardar en una máquina ocupada.
    hookTimeout: 30_000,
    // DynamoDB Local recién levantado (el servicio del job de CI, 601) tarda en crear las primeras tablas.
    testTimeout: 15_000,
  },
});
