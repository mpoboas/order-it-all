#!/usr/bin/env node
/**
 * Fase 2 do livro-razão de despesas — cada `Split` existente passa a ter uma
 * `Expense` ligada (kind: 'expense', split_mode: 'itemized', split_id).
 * Sem pagador ("Falta pagador" na UI — fora dos saldos até alguém o definir),
 * porque um split nunca teve essa noção. Total e partes vêm dos itens do
 * split, com a mesma matemática de `src/lib/splitItemAllocation.ts`.
 *
 * Idempotente: salta qualquer split que já tenha uma despesa a apontar para
 * ele (`expense.split_id === split.id`).
 *
 * Uso (por omissão é dry-run — só relatório, nada é escrito):
 *   node scripts/migrate-splits-to-expenses.mjs
 *   node scripts/migrate-splits-to-expenses.mjs --apply
 */

import nextEnv from '@next/env';
import PocketBase from 'pocketbase';

// `dev: true` — também carrega `.env.development.local` (BD de teste).
nextEnv.loadEnvConfig(process.cwd(), true);

const APPLY = process.argv.includes('--apply');

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

// --- mesma matemática de src/lib/splitItemAllocation.ts / splitShare.ts ---

function getActiveParticipants(item) {
  const mode = item.split_mode || 'equal';
  if (mode === 'equal') return [...(item.participants ?? [])];
  const allocs = item.allocations ?? {};
  const fromAlloc = Object.entries(allocs).filter(([, v]) => v > 0).map(([k]) => k);
  if (fromAlloc.length > 0) return fromAlloc;
  return [...(item.participants ?? [])];
}

function computeParticipantAmount(item, participant) {
  const price = item.price ?? 0;
  if (price <= 0) return 0;
  const participants = getActiveParticipants(item);
  if (!participants.includes(participant)) return 0;
  const mode = item.split_mode || 'equal';
  const allocs = item.allocations ?? {};
  switch (mode) {
    case 'equal':
      return price / participants.length;
    case 'unequal':
      return allocs[participant] ?? 0;
    case 'percentage':
      return (price * (allocs[participant] ?? 0)) / 100;
    case 'shares': {
      const total = participants.reduce((sum, name) => sum + (allocs[name] ?? 0), 0);
      if (total <= 0) return 0;
      return (price * (allocs[participant] ?? 0)) / total;
    }
    default:
      return 0;
  }
}

function calculateSplitTotals(split) {
  const totals = {};
  (split.participants ?? []).forEach((p) => { totals[p] = 0; });
  (split.items ?? []).forEach((item) => {
    const active = getActiveParticipants(item);
    if (active.length === 0) return;
    active.forEach((p) => {
      if (totals[p] === undefined) return;
      totals[p] += computeParticipantAmount(item, p);
    });
  });
  return totals;
}

function calculateExportGrandTotal(items) {
  return (items ?? []).reduce(
    (sum, item) => (getActiveParticipants(item).length > 0 ? sum + (item.price ?? 0) : sum),
    0,
  );
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Faltam POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD no ambiente.');
    process.exit(1);
  }

  console.log(`PocketBase: ${PB_URL}`);
  console.log(APPLY ? '⚠️  MODO REAL — vai escrever.' : '🔍 DRY-RUN — só relatório, nada é escrito. Usa --apply para gravar a sério.');
  console.log('');

  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);

  const [splits, expenses] = await Promise.all([
    pb.collection('splits').getFullList(),
    pb.collection('expenses').getFullList(),
  ]);

  const linkedSplitIds = new Set(expenses.filter((e) => e.split_id).map((e) => e.split_id));

  let migrated = 0;
  let skipped = 0;
  let skippedEmpty = 0;
  let failed = 0;
  const report = [];

  for (const split of splits) {
    if (linkedSplitIds.has(split.id)) {
      skipped++;
      continue;
    }

    const totals = calculateSplitTotals(split);
    const shares = Object.entries(totals)
      .filter(([, amount]) => amount > 0.004)
      .map(([party, amount]) => ({ party, amount: round2(amount) }));
    const amount = round2(calculateExportGrandTotal(split.items));

    // Um número `required` no PocketBase rejeita 0 — e um split sem itens
    // com preço/participantes não tem mesmo nada para migrar.
    if (amount <= 0 && shares.length === 0) {
      skippedEmpty++;
      report.push({
        splitId: split.id, splitName: split.name, groupId: split.group_id,
        amount, shareCount: 0, note: 'vazio — ignorado',
      });
      continue;
    }

    report.push({
      splitId: split.id,
      splitName: split.name,
      groupId: split.group_id,
      amount,
      shareCount: shares.length,
    });

    if (APPLY) {
      try {
      await pb.collection('expenses').create({
        group_id: split.group_id,
        kind: 'expense',
        description: split.name,
        amount,
        date: (split.created || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        notes: '',
        split_mode: 'itemized',
        payers: [],
        shares,
        split_id: split.id,
        created_by: split.created_by,
        updated_by: split.created_by,
      });
      } catch (err) {
        failed++;
        const detail = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
        console.error(`  ✗ falhou "${split.name}" (${split.id}): ${detail}`);
        continue;
      }
    }
    migrated++;
  }

  console.log(`Splits: ${splits.length}`);
  console.log(`  despesas ${APPLY ? 'criadas' : 'que seriam criadas'}: ${migrated}`);
  console.log(`  já ligados a uma despesa (ignorados): ${skipped}`);
  console.log(`  vazios sem itens/valor (ignorados): ${skippedEmpty}`);
  if (APPLY) console.log(`  falharam a criar: ${failed}`);
  console.log('');

  if (report.length > 0) {
    console.log('Detalhe:');
    for (const r of report) {
      console.log(`  "${r.splitName}" (${r.splitId}, grupo ${r.groupId}) — ${r.amount.toFixed(2)} €, ${r.shareCount} partes${r.note ? ` (${r.note})` : ''}`);
    }
  }

  console.log(APPLY ? '\nMigração aplicada.' : '\nDry-run concluído — nada foi escrito. Corre outra vez com --apply.');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
