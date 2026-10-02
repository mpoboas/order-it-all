import { defineConfig } from 'vitest/config';
import path from 'path';

// Só o motor de cálculo (src/lib/ledger/**) tem testes por agora — funções
// puras, sem DOM/PocketBase/Dexie a mockar. Ver o resto da estratégia de
// verificação (tsc/lint/build/browser preview) no plano do livro-razão.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
