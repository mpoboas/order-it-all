#!/usr/bin/env node
/**
 * Cria a coleção `expense_comments` (Fase 5) via API de admin — equivalente
 * a aplicar `pb/migrations/2_comments.js`, mas sem depender do runner de
 * migrações do servidor (útil para a BD de dev). Idempotente.
 *
 * Uso: node scripts/create-comments-collection.mjs --apply
 */

import nextEnv from '@next/env';
import PocketBase from 'pocketbase';

nextEnv.loadEnvConfig(process.cwd(), true);

const APPLY = process.argv.includes('--apply');
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Faltam POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD.');
    process.exit(1);
  }
  console.log(`PocketBase: ${PB_URL}`);
  console.log(APPLY ? '⚠️  MODO REAL' : '🔍 DRY-RUN (usa --apply para gravar)');

  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);

  try {
    await pb.collections.getOne('expense_comments');
    console.log('expense_comments já existe — nada a fazer.');
    return;
  } catch {
    // não existe — continua
  }

  const groups = await pb.collections.getOne('groups');
  const users = await pb.collections.getOne('users');
  const expenses = await pb.collections.getOne('expenses');

  const def = {
    name: 'expense_comments',
    type: 'base',
    fields: [
      { name: 'expense_id', type: 'relation', required: true, collectionId: expenses.id, maxSelect: 1, cascadeDelete: true },
      { name: 'group_id', type: 'relation', required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: true },
      { name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1 },
      { name: 'content', type: 'text', required: true, max: 2000 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_expense_comments_expense ON expense_comments (expense_id)',
      'CREATE INDEX idx_expense_comments_group ON expense_comments (group_id)',
    ],
    listRule: 'group_id.members ~ @request.auth.id',
    viewRule: 'group_id.members ~ @request.auth.id',
    createRule: 'group_id.members ~ @request.auth.id',
    updateRule: 'user = @request.auth.id',
    deleteRule: 'user = @request.auth.id',
  };

  console.log('A criar expense_comments...');
  if (APPLY) {
    await pb.collections.create(def);
    console.log('Criada.');
  }
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
