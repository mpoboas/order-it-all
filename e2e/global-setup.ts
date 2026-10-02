import { mkdirSync } from 'node:fs';
import { loadEnvConfig } from '@next/env';

/**
 * Antes de tudo: garante que o `next dev` aponta para o PocketBase de DEV
 * (os testes criam contas, grupos e despesas a sério) e liga a captura de
 * notificações (`.e2e/` — ver `captureForE2E` em `src/lib/notifications/send.ts`).
 */
export default function globalSetup() {
  loadEnvConfig(process.cwd(), true);
  const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? '';
  if (!pbUrl.includes('pb-orderit-dev.')) {
    throw new Error(`Recusado: NEXT_PUBLIC_POCKETBASE_URL (${pbUrl}) não é a BD de dev.`);
  }
  mkdirSync('.e2e', { recursive: true });
}
