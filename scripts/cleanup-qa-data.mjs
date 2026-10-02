#!/usr/bin/env node
/**
 * Apaga os dados de QA criados pelos testes E2E com o Playwright (25/09/2026)
 * na BD de DEV: os grupos "QA Playwright" e "QA Playwright 2" e tudo o que
 * lhes pertence. Só aceita os IDs exatos abaixo (e confirma o nome) — nunca
 * apaga por nome, para não apanhar um grupo real com o mesmo nome.
 *
 * Ordem: folhas primeiro (itens → encomendas → viagens → comentários →
 * despesas → divisões → placeholders → grupos). As coleções antigas
 * (trips/orders/items/splits) não têm cascata, por isso não se confia nela.
 *
 * Uso:
 *   node scripts/cleanup-qa-data.mjs            # dry-run: lista o que apagaria
 *   node scripts/cleanup-qa-data.mjs --apply    # apaga (PERMANENTE)
 *
 * Recusa correr contra produção.
 */

import nextEnv from '@next/env';
import PocketBase from 'pocketbase';

nextEnv.loadEnvConfig(process.cwd(), true);

const APPLY = process.argv.includes('--apply');
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

const QA_GROUPS = {
  siwkd9kqarzsh33: 'QA Playwright',
  dywly4ll3j74mof: 'QA Playwright 2',
};

if (!PB_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Faltam NEXT_PUBLIC_POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD.');
  process.exit(1);
}
if (!PB_URL.includes('pb-orderit-dev.')) {
  console.error(`Recusado: ${PB_URL} não é a BD de dev.`);
  process.exit(1);
}

const orFilter = (field, ids) => ids.map((id) => `${field} = "${id}"`).join(' || ');

async function main() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`Ligado a ${PB_URL}. Modo: ${APPLY ? 'APAGAR (permanente)' : 'dry-run'}\n`);

  const groupIds = [];
  for (const [id, name] of Object.entries(QA_GROUPS)) {
    try {
      const g = await pb.collection('groups').getOne(id);
      if (g.name !== name) {
        console.error(`Recusado: o grupo ${id} chama-se "${g.name}", não "${name}".`);
        process.exit(1);
      }
      groupIds.push(id);
    } catch {
      console.log(`(grupo ${id} "${name}" já não existe)`);
    }
  }
  if (groupIds.length === 0) {
    console.log('Nada a apagar.');
    return;
  }

  const list = (coll, filter) => pb.collection(coll).getFullList({ filter, fields: 'id' }).then((r) => r.map((x) => x.id));

  const trips = await list('trips', orFilter('group_id', groupIds));
  const orders = trips.length ? await list('orders', orFilter('trip_id', trips)) : [];
  const items = orders.length ? await list('items', orFilter('order_id', orders)) : [];
  const expenses = await list('expenses', orFilter('group_id', groupIds));
  const comments = await list('expense_comments', orFilter('group_id', groupIds));
  const splits = await list('splits', orFilter('group_id', groupIds));
  const placeholders = await list('placeholders', orFilter('group_id', groupIds));

  const plan = [
    ['items', items],
    ['orders', orders],
    ['trips', trips],
    ['expense_comments', comments],
    ['expenses', expenses],
    ['splits', splits],
    ['placeholders', placeholders],
    ['groups', groupIds],
  ];

  for (const [coll, ids] of plan) console.log(`  ${coll.padEnd(17)} ${ids.length}`);
  console.log(`  grupos: ${groupIds.map((id) => `${QA_GROUPS[id]} (${id})`).join(', ')}\n`);

  if (!APPLY) {
    console.log('Dry-run — nada foi apagado. Corre com --apply para apagar.');
    return;
  }

  for (const [coll, ids] of plan) {
    for (const id of ids) {
      try {
        await pb.collection(coll).delete(id);
      } catch (err) {
        // 404 = já apagado por uma cascata anterior nesta mesma corrida.
        if (err?.status !== 404) throw err;
      }
    }
    console.log(`  ✓ ${coll}: ${ids.length}`);
  }
  console.log('\nLimpeza concluída.');
}

main().catch((err) => {
  console.error(err?.response ?? err);
  process.exit(1);
});
