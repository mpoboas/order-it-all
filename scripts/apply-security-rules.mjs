#!/usr/bin/env node
/**
 * Aplica as regras de `pb/migrations/5_lock_legacy.js` (fecha `groups`,
 * `trips`, `orders`, `items`, `splits`) via API de admin, e opcionalmente roda
 * os códigos de convite/partilha que estiveram expostos publicamente.
 *
 * Em dry-run (default) mostra as regras ATUAIS de cada coleção ao lado das
 * novas — útil também só para auditar o que está no servidor.
 *
 * Uso:
 *   node scripts/apply-security-rules.mjs                   # dry-run
 *   node scripts/apply-security-rules.mjs --apply           # aplica regras
 *   node scripts/apply-security-rules.mjs --apply --rotate-codes
 *        # + gera `invite_code` novo em todos os grupos e `share_code` novo
 *        #   em todas as divisões que tinham um (links antigos deixam de
 *        #   funcionar — é esse o objetivo)
 *
 * Correr primeiro contra o dev (`.env.development.local`) e só depois prod
 * (`NODE_ENV=production node scripts/apply-security-rules.mjs ...`, que lê
 * `.env`/`.env.production`).
 *
 * ⚠️ Ordem de deploy: publicar primeiro a versão da app com
 * `/api/groups/invite/[code]` e o link público de divisão a passar só pela
 * rota de servidor (`src/lib/splitShareAdmin.ts`) — com as regras novas, a versão antiga da
 * app deixa de conseguir entrar em grupos por convite e o link público de
 * divisão deixa de funcionar.
 */

import nextEnv from '@next/env';
import PocketBase from 'pocketbase';
import { webcrypto } from 'node:crypto';

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

const APPLY = process.argv.includes('--apply');
const ROTATE = process.argv.includes('--rotate-codes');
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!PB_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Faltam NEXT_PUBLIC_POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD.');
  process.exit(1);
}

// --- Regras: manter em sintonia com pb/migrations/5_lock_legacy.js --------
const MEMBER = (path) => `${path}.members.id ?= @request.auth.id`;
const ADMIN = (path) => `${path}.admins.id ?= @request.auth.id`;
const VERSION_OK =
  '(@request.body.items_version:isset = false || @request.body.items_version > items_version)';

const RULES = {
  groups: {
    listRule: 'members.id ?= @request.auth.id',
    viewRule: 'members.id ?= @request.auth.id',
    createRule:
      '@request.auth.id != "" && @request.body.creator = @request.auth.id' +
      ' && @request.body.members:length <= 1 && @request.body.admins:length <= 1',
    updateRule: 'admins.id ?= @request.auth.id && @request.body.creator:isset = false',
    deleteRule: 'creator = @request.auth.id',
  },
  trips: {
    listRule: MEMBER('group_id'),
    viewRule: MEMBER('group_id'),
    createRule: ADMIN('group_id'),
    updateRule: `${ADMIN('group_id')} && @request.body.group_id:isset = false`,
    deleteRule: ADMIN('group_id'),
  },
  orders: {
    listRule: MEMBER('trip_id.group_id'),
    viewRule: MEMBER('trip_id.group_id'),
    createRule: MEMBER('trip_id.group_id'),
    updateRule: MEMBER('trip_id.group_id'),
    deleteRule: MEMBER('trip_id.group_id'),
  },
  items: {
    listRule: MEMBER('order_id.trip_id.group_id'),
    viewRule: MEMBER('order_id.trip_id.group_id'),
    createRule: MEMBER('order_id.trip_id.group_id'),
    updateRule: MEMBER('order_id.trip_id.group_id'),
    deleteRule: MEMBER('order_id.trip_id.group_id'),
  },
  // Só membros. O link público (`/split/[code]`) não toca no PB diretamente:
  // passa pela rota `/api/splits/share/[code]` (superuser), que só deixa
  // escolher o que se consumiu — nunca itens/preços/total.
  splits: {
    listRule: MEMBER('group_id'),
    viewRule: MEMBER('group_id'),
    createRule: MEMBER('group_id'),
    updateRule: `${MEMBER('group_id')} && ${VERSION_OK}`,
    deleteRule: MEMBER('group_id'),
  },
};

// `push_subscriptions` — só as próprias linhas (em sintonia com
// pb/migrations/8_push_and_onboarding.js). Estava com leitura pública.
RULES.push_subscriptions = {
  listRule: 'user = @request.auth.id',
  viewRule: 'user = @request.auth.id',
  createRule: '@request.auth.id != "" && user = @request.auth.id',
  updateRule: 'user = @request.auth.id && @request.body.user:isset = false',
  deleteRule: 'user = @request.auth.id',
};

// --- Códigos: mesmo gerador de src/lib/pocketbase.ts ----------------------
const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const INVITE_LENGTH = 10;
function generateCode() {
  const limit = 256 - (256 % INVITE_CHARS.length);
  let code = '';
  while (code.length < INVITE_LENGTH) {
    for (const byte of webcrypto.getRandomValues(new Uint8Array(INVITE_LENGTH * 2))) {
      if (byte < limit && code.length < INVITE_LENGTH) code += INVITE_CHARS[byte % INVITE_CHARS.length];
    }
  }
  return code;
}

const show = (rule) => (rule === null ? '(null = só superuser)' : rule === '' ? '"" (PÚBLICO)' : rule);

async function main() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`Ligado a ${PB_URL}. Modo: ${APPLY ? 'APLICAR' : 'dry-run'}${ROTATE ? ' + rodar códigos' : ''}\n`);

  for (const [name, rules] of Object.entries(RULES)) {
    const collection = await pb.collections.getOne(name);
    console.log(`■ ${name}`);
    const changed = {};
    for (const [key, rule] of Object.entries(rules)) {
      if (collection[key] !== rule) {
        changed[key] = rule;
        console.log(`  ${key}\n    atual: ${show(collection[key])}\n    nova:  ${rule}`);
      }
    }
    if (Object.keys(changed).length === 0) {
      console.log('  ✓ já está com as regras novas');
    } else if (APPLY) {
      await pb.collections.update(collection.id, changed);
      console.log('  ✓ regras aplicadas');
    }
    console.log();
  }

  if (!ROTATE) {
    console.log('Códigos não rodados (usa --rotate-codes).');
    return;
  }

  const groups = await pb.collection('groups').getFullList({ fields: 'id,name' });
  console.log(`Rodar invite_code de ${groups.length} grupos.`);
  const splits = await pb.collection('splits').getFullList({ filter: 'share_code != ""', fields: 'id' });
  console.log(`Rodar share_code de ${splits.length} divisões.`);
  if (!APPLY) return;

  for (const g of groups) await pb.collection('groups').update(g.id, { invite_code: generateCode() });
  // Superuser ignora a regra de `items_version`, por isso isto não colide com
  // o controlo de concorrência — só muda `share_code`.
  for (const s of splits) await pb.collection('splits').update(s.id, { share_code: generateCode() });
  console.log('✓ códigos rodados — os links de convite/partilha antigos deixaram de funcionar.');
}

main().catch((err) => {
  console.error(err?.response ?? err);
  process.exit(1);
});
