#!/usr/bin/env node
/**
 * Fix único: `pb/migrations/1_ledger.js` (Fase 0) esqueceu-se de que, no
 * PocketBase moderno (v0.23+), os campos `created`/`updated` **já não são
 * automáticos** — têm de ser adicionados explicitamente como campos
 * "autodate" (`onCreate`/`onUpdate`). Sem isto, `expenses`/`placeholders`
 * ficavam com esses campos vazios, partindo a Atividade (ordenação) e
 * qualquer "há X horas" no detalhe.
 *
 * Este script:
 *  1. Adiciona os campos `created`/`updated` (autodate) às duas coleções,
 *     se ainda não existirem — corrige todos os registos NOVOS a partir daqui.
 *  2. Apaga os `expenses` já existentes (reproduzíveis — vieram de scripts
 *     de migração ou de testes manuais nesta BD de dev) para os recriar com
 *     timestamps a sério a seguir, correndo outra vez
 *     `migrate-splits-to-expenses.mjs --apply`.
 *
 * Não mexe em `placeholders` já criados (dados reais de utilizadores —
 * ficam só sem essas duas datas, cosmético, sem impacto funcional).
 *
 * Uso: node scripts/fix-ledger-timestamps.mjs --apply
 */

import nextEnv from '@next/env';
import PocketBase from 'pocketbase';

nextEnv.loadEnvConfig(process.cwd(), true);

const APPLY = process.argv.includes('--apply');
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

function autodateFields() {
  return [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
  ];
}

async function ensureTimestamps(pb, collectionName) {
  const collection = await pb.collection(collectionName).getOne
    ? await pb.collections.getOne(collectionName)
    : null;
  const existingNames = new Set((collection.fields ?? []).map((f) => f.name));
  const missing = autodateFields().filter((f) => !existingNames.has(f.name));
  if (missing.length === 0) {
    console.log(`  ${collectionName}: já tem created/updated.`);
    return;
  }
  console.log(`  ${collectionName}: a adicionar ${missing.map((f) => f.name).join(', ')}...`);
  if (APPLY) {
    await pb.collections.update(collection.id, {
      fields: [...collection.fields, ...missing],
    });
  }
}

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

  console.log('\n1) Campos autodate:');
  await ensureTimestamps(pb, 'expenses');
  await ensureTimestamps(pb, 'placeholders');

  console.log('\n2) Recriar despesas existentes (para ganharem created/updated a sério):');
  const expenses = await pb.collection('expenses').getFullList();
  console.log(`  ${expenses.length} despesas a apagar e recriar.`);
  if (APPLY) {
    const fieldsToCopy = [
      'group_id', 'kind', 'description', 'amount', 'date', 'category', 'notes',
      'split_mode', 'payers', 'shares', 'split_id', 'trip_id', 'receipt',
      'created_by', 'updated_by', 'deleted_at', 'deleted_by',
    ];
    for (const e of expenses) {
      await pb.collection('expenses').delete(e.id);
      const data = Object.fromEntries(fieldsToCopy.map((f) => [f, e[f]]));
      await pb.collection('expenses').create(data);
    }
    console.log('  Feito — corre agora `node scripts/migrate-splits-to-expenses.mjs --apply` outra vez para os splits ainda sem despesa.');
  }

  console.log(APPLY ? '\nAplicado.' : '\nDry-run — nada escrito, corre com --apply.');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
