import { defineConfig } from '@playwright/test';

/**
 * Testes E2E — simulam um grupo de amigos a usar a app ao mesmo tempo (cada
 * um no seu "telemóvel": um contexto de browser isolado). Só contra o
 * `next dev` local + PocketBase de DEV (o `e2e/global-setup.ts` recusa outro).
 *
 *   npm run e2e            # sem janela
 *   npm run e2e -- --headed  # a ver os amigos a mexer na app
 *   npx playwright show-report
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Um cenário inteiro (registos, grupo, viagem, despesas) leva minutos.
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
