#!/usr/bin/env node
/**
 * Aplica o esquema PocketBase do `username` (Fase 8b — "Amigos" via
 * username) ao servidor — mesma especificação de `pb/migrations/4_usernames.js`,
 * aplicada via API de admin. Idempotente e em duas fases:
 *
 *   1ª corrida: acrescenta o campo `username` (sem índice único ainda).
 *   Depois disso: corre `scripts/backfill-usernames.mjs --apply` para dar
 *   um username a cada utilizador que ainda não tem.
 *   2ª corrida deste script: se já não houver nenhum `username` vazio,
 *   acrescenta o índice único — nunca antes, ou rejeita os "" duplicados
 *   dos utilizadores ainda por migrar.
 *
 * Uso:
 *   node scripts/apply-usernames-schema.mjs [--apply]
 */

import nextEnv from '@next/env';
import PocketBase from 'pocketbase';

// Por omissão, a BD de dev (`.env.development.local`). Para produção:
// `NODE_ENV=production node scripts/<script>.mjs` (lê só `.env`) — confirma o
// URL que aparece logo no início antes de passar `--apply`.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
// As dicas "a seguir, corre…" repetem o NODE_ENV — senão o passo seguinte ia para o dev.
const ENV_PREFIX = process.env.NODE_ENV === 'production' ? 'NODE_ENV=production ' : '';

const APPLY = process.argv.includes('--apply');
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!PB_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Faltam NEXT_PUBLIC_POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD.');
  process.exit(1);
}

// Parcial, como o do email no PocketBase: uma conta acabada de criar ainda não
// tem username ("") até ao ecrã do nome — um índice sobre todos os valores só
// deixava existir UMA conta assim, e o registo seguinte falhava.
const UNIQUE_INDEX = "CREATE UNIQUE INDEX idx_users_username ON users (username) WHERE username != ''";

async function main() {
  const pb = new PocketBase(PB_URL);
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`Ligado a ${PB_URL} como ${ADMIN_EMAIL}. Modo: ${APPLY ? 'APLICAR' : 'dry-run'}\n`);

  const users = await pb.collections.getOne('users');
  const hasField = users.fields.some((f) => f.name === 'username');

  if (!hasField) {
    console.log('+ Acrescentar campo `username` a `users` (sem índice único ainda).');
    if (APPLY) {
      await pb.collections.update(users.id, {
        fields: [...users.fields, { name: 'username', type: 'text', required: false, min: 0, max: 20 }],
      });
      console.log('  ✓ campo criado.');
    }
    console.log(`\nA seguir: ${ENV_PREFIX}node scripts/backfill-usernames.mjs --apply, depois corre este script outra vez para o índice único.`);
    return;
  }
  console.log('✓ Campo `username` já existe.');

  const current = (users.indexes ?? []).find((i) => i.includes('idx_users_username'));
  if (current === UNIQUE_INDEX) {
    console.log('✓ Índice único já existe — nada a fazer.');
    return;
  }
  if (current) {
    // Versão antiga, sem o `WHERE`: bloqueava o 2.º registo seguido.
    console.log('~ Trocar o índice único antigo pelo parcial (ignora usernames vazios).');
    if (APPLY) {
      await pb.collections.update(users.id, {
        indexes: (users.indexes ?? []).map((i) => (i === current ? UNIQUE_INDEX : i)),
      });
      console.log('  ✓ índice trocado.');
    } else {
      console.log('\nDry-run — nada escrito. Corre com --apply para gravar a sério.');
    }
    return;
  }

  const empty = await pb.collection('users').getList(1, 1, { filter: 'username = ""' });
  if (empty.totalItems > 0) {
    console.log(`✗ Ainda há ${empty.totalItems} utilizador(es) sem username — corre o backfill primeiro:`);
    console.log(`  ${ENV_PREFIX}node scripts/backfill-usernames.mjs --dry-run   (revê)`);
    console.log(`  ${ENV_PREFIX}node scripts/backfill-usernames.mjs --apply`);
    return;
  }

  console.log('+ Acrescentar índice único a `username`.');
  if (APPLY) {
    await pb.collections.update(users.id, { indexes: [...(users.indexes ?? []), UNIQUE_INDEX] });
    console.log('  ✓ índice criado.');
  } else {
    console.log('\nDry-run — nada escrito. Corre com --apply para gravar a sério.');
  }
}

main().catch((err) => {
  console.error('Falhou:', err?.response?.data ?? err);
  process.exit(1);
});
