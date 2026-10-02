#!/usr/bin/env node
/**
 * Apaga do PocketBase de DEV o que os testes E2E (`e2e/`, `npm run e2e`)
 * criaram: as contas `…@e2e.test` e os grupos "E2E …" só com essas contas,
 * mais tudo o que pende deles (viagens → pedidos → itens, despesas,
 * comentários, divisões, pessoas sem conta, amizades, subscrições push).
 *
 * Nunca toca num grupo que tenha alguém de fora dos testes, e recusa
 * qualquer base de dados que não seja a de dev.
 *
 * Uso:
 *   node scripts/cleanup-e2e.mjs            # dry-run: mostra o que apagava
 *   node scripts/cleanup-e2e.mjs --apply    # apaga a sério
 */

import nextEnv from '@next/env';
import PocketBase from 'pocketbase';

nextEnv.loadEnvConfig(process.cwd(), true);

const APPLY = process.argv.includes('--apply');
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? '';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!PB_URL.includes('pb-orderit-dev.')) {
  console.error(`Recusado: ${PB_URL || '(sem URL)'} não é a BD de dev.`);
  process.exit(1);
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Faltam POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD.');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

/** Registos de `collection` cujo `field` é um destes ids (em lotes, para o filtro não crescer demais). */
async function byField(collection, field, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const filter = chunk.map((_, j) => `${field} = {:v${j}}`).join(' || ');
    const params = Object.fromEntries(chunk.map((id, j) => [`v${j}`, id]));
    out.push(...(await pb.collection(collection).getFullList({ filter: pb.filter(filter, params), fields: 'id' })));
  }
  return out.map((r) => r.id);
}

async function main() {
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`Ligado a ${PB_URL}. Modo: ${APPLY ? 'APAGAR' : 'dry-run'}\n`);

  const existing = new Set((await pb.collections.getFullList()).map((c) => c.name));
  const has = (name) => existing.has(name);

  const users = await pb.collection('users').getFullList({ filter: 'email ~ "@e2e.test"', fields: 'id,email' });
  const userIds = new Set(users.map((u) => u.id));

  const candidates = await pb.collection('groups').getFullList({ filter: 'name ~ "E2E "', fields: 'id,name,members' });
  const groups = candidates.filter((g) => (g.members ?? []).length > 0 && g.members.every((m) => userIds.has(m)));
  const skipped = candidates.filter((g) => !groups.includes(g));
  const groupIds = groups.map((g) => g.id);

  // Do mais dependente para o menos — cada apagar já não tem nada a apontar para ele.
  const trips = has('trips') ? await byField('trips', 'group_id', groupIds) : [];
  const orders = has('orders') ? await byField('orders', 'trip_id', trips) : [];
  const expenses = has('expenses') ? await byField('expenses', 'group_id', groupIds) : [];
  const plan = [
    ['items', has('items') ? await byField('items', 'order_id', orders) : []],
    ['orders', orders],
    ['expense_comments', has('expense_comments') ? await byField('expense_comments', 'group_id', groupIds) : []],
    ['expenses', expenses],
    ['trips', trips],
    ['splits', has('splits') ? await byField('splits', 'group_id', groupIds) : []],
    ['placeholders', has('placeholders') ? await byField('placeholders', 'group_id', groupIds) : []],
    ['groups', groupIds],
    [
      'friendships',
      has('friendships')
        ? [...new Set([...(await byField('friendships', 'user_a', [...userIds])), ...(await byField('friendships', 'user_b', [...userIds]))])]
        : [],
    ],
    ['push_subscriptions', has('push_subscriptions') ? await byField('push_subscriptions', 'user', [...userIds]) : []],
    ['users', [...userIds]],
  ];

  for (const [collection, ids] of plan) console.log(`${String(ids.length).padStart(5)}  ${collection}`);
  if (skipped.length > 0) {
    console.log(`\nIgnorados (têm alguém de fora dos testes): ${skipped.map((g) => g.name).join(', ')}`);
  }

  if (!APPLY) {
    console.log('\nDry-run — nada apagado. Corre com --apply para apagar a sério.');
    return;
  }

  let failed = 0;
  for (const [collection, ids] of plan) {
    for (const id of ids) {
      try {
        await pb.collection(collection).delete(id);
      } catch (err) {
        failed += 1;
        console.error(`  ✗ ${collection}/${id}: ${err?.response?.message ?? err?.message}`);
      }
    }
    if (ids.length > 0) console.log(`  ✓ ${collection}`);
  }
  console.log(failed ? `\n${failed} registo(s) não apagado(s) — ver acima.` : '\nFeito.');
}

main().catch((err) => {
  console.error('Falhou:', err?.response?.data ?? err);
  process.exit(1);
});
