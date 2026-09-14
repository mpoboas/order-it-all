#!/usr/bin/env node
/**
 * Dá um `username` a cada utilizador existente que ainda não tenha (Fase 8b
 * — "Amigos" via username). Gera a partir do `name`, minúsculas, só
 * `a-z0-9` (nomes só com emoji/símbolos caem no fallback `userXXX`); em
 * colisão acrescenta um sufixo sequencial (`joao`, `joao2`, `joao3`…).
 *
 * Espelha `src/lib/username.ts` (`slugifyUsername`/`nextUsernameCandidate`)
 * — não é importável diretamente aqui porque é um módulo TS e este script
 * corre em Node puro, sem transpilação.
 *
 * Idempotente: salta quem já tem username. Corre sempre em dry-run primeiro
 * (mostra o relatório nome → username); só escreve com --apply.
 *
 * Uso:
 *   node scripts/backfill-usernames.mjs [--apply]
 */

import nextEnv from '@next/env';
import PocketBase from 'pocketbase';

nextEnv.loadEnvConfig(process.cwd(), true);

const APPLY = process.argv.includes('--apply');
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!PB_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Faltam NEXT_PUBLIC_POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD.');
  process.exit(1);
}

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

function slugifyUsername(name) {
  const base = (name || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, MAX_LENGTH);
  return base.length >= MIN_LENGTH ? base : `user${base}`;
}

function nextUsernameCandidate(base, attempt) {
  if (attempt <= 0) return base;
  const suffix = String(attempt + 1);
  const trimmed = base.slice(0, Math.max(MIN_LENGTH, MAX_LENGTH - suffix.length));
  return `${trimmed}${suffix}`;
}

async function main() {
  const pb = new PocketBase(PB_URL);
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`Ligado a ${PB_URL} como ${ADMIN_EMAIL}. Modo: ${APPLY ? 'APLICAR' : 'dry-run'}\n`);

  const allUsers = await pb.collection('users').getFullList({ fields: 'id,name,username' });
  const taken = new Set(allUsers.map((u) => u.username).filter(Boolean));
  const missing = allUsers.filter((u) => !u.username);

  console.log(`${allUsers.length} utilizadores no total, ${missing.length} sem username.\n`);

  const plan = [];
  for (const u of missing) {
    const base = slugifyUsername(u.name);
    let candidate;
    for (let attempt = 0; ; attempt++) {
      candidate = nextUsernameCandidate(base, attempt);
      if (!taken.has(candidate)) break;
    }
    taken.add(candidate);
    plan.push({ id: u.id, name: u.name, username: candidate });
  }

  for (const p of plan) console.log(`  ${p.name || '(sem nome)'} -> @${p.username}`);

  if (!APPLY) {
    console.log('\nDry-run — nada escrito. Corre com --apply para gravar a sério.');
    return;
  }

  for (const p of plan) {
    await pb.collection('users').update(p.id, { username: p.username });
  }
  console.log(`\n✓ ${plan.length} username(s) atribuído(s).`);
  console.log('A seguir: node scripts/apply-usernames-schema.mjs --apply (acrescenta o índice único).');
}

main().catch((err) => {
  console.error('Falhou:', err?.response?.data ?? err);
  process.exit(1);
});
