#!/usr/bin/env node
/**
 * Build de PRODUÇÃO local apontado para o PocketBase de DEV — para testar o
 * service worker (só existe em produção) sem tocar em dados reais. Corre na
 * porta 3110, ao lado do `next dev` (o Next 16 põe o dev em `.next/dev`, por
 * isso o build não lhe mexe).
 *
 * Porquê um script: `next build`/`next start` carregam o `.env` (URL e
 * credenciais de PRODUÇÃO). Aqui carrega-se primeiro o `.env.development.local`
 * para o `process.env` — o Next nunca sobrepõe variáveis que já existem.
 *
 * Uso: [PORT=3000] node scripts/start-local-prod.mjs [--no-build]   (porta por omissão: 3110)
 * (ou a configuração "prod-local" em .claude/launch.json)
 */

import nextEnv from '@next/env';
import { spawnSync, spawn } from 'node:child_process';

nextEnv.loadEnvConfig(process.cwd(), true); // modo dev → .env.development.local primeiro

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || '';
if (!pbUrl.includes('pb-orderit-dev.')) {
  console.error(`Recusado: NEXT_PUBLIC_POCKETBASE_URL (${pbUrl}) não é a BD de dev.`);
  process.exit(1);
}
console.log(`Build de produção local → PocketBase ${pbUrl}`);

const env = { ...process.env, NODE_ENV: 'production' };
if (!process.argv.includes('--no-build')) {
  const build = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const port = process.env.PORT || '3110';
const server = spawn('npx', ['next', 'start', '-p', port], { stdio: 'inherit', env });
server.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig));
