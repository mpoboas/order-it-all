#!/usr/bin/env node
/**
 * Aplica o esquema PocketBase da Fase 8 ("Amigos") ao servidor apontado por
 * NEXT_PUBLIC_POCKETBASE_URL (por omissão, com `.env.development.local`, o
 * PocketBase de dev) — é a mesma especificação de `pb/migrations/3_friendships.js`,
 * mas aplicada via API de admin (superuser) em vez de um ficheiro de
 * migração no servidor, porque não há acesso de deploy a este PocketBase
 * a partir daqui.
 *
 * Idempotente: só cria/altera o que ainda não existir. Corre sempre em
 * dry-run primeiro; só escreve com --apply.
 *
 * Uso:
 *   node scripts/apply-friendships-schema.mjs [--apply]
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

const GROUP_OR_PARTICIPANTS_RULE =
  '(group_id != "" && group_id.members ~ @request.auth.id) || (group_id = "" && participants ~ @request.auth.id)';

// `:isset` porque `accept()` só manda `{status}` — um `@request.body.user_a`
// ausente não pode reprovar a regra (ver nota em 3_friendships.js).
const FRIENDSHIPS_UPDATE_RULE =
  '(user_a = @request.auth.id || user_b = @request.auth.id) && requested_by != @request.auth.id && (@request.body.user_a:isset = false || @request.body.user_a = user_a) && (@request.body.user_b:isset = false || @request.body.user_b = user_b) && (@request.body.requested_by:isset = false || @request.body.requested_by = requested_by)';

function participantsField(usersCollectionId) {
  return {
    name: 'participants',
    type: 'relation',
    required: false,
    collectionId: usersCollectionId,
    maxSelect: 999,
    minSelect: 0,
    cascadeDelete: false,
  };
}

async function main() {
  const pb = new PocketBase(PB_URL);
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`Ligado a ${PB_URL} como ${ADMIN_EMAIL}. Modo: ${APPLY ? 'APLICAR' : 'dry-run'}\n`);

  const users = await pb.collections.getOne('users');
  const expenses = await pb.collections.getOne('expenses');
  const comments = await pb.collections.getOne('expense_comments');

  // --- 1. friendships ------------------------------------------------------
  let friendships;
  try {
    friendships = await pb.collections.getOne('friendships');
    console.log('✓ Coleção `friendships` já existe.');
  } catch {
    friendships = null;
  }

  if (friendships && friendships.updateRule !== FRIENDSHIPS_UPDATE_RULE) {
    console.log('~ Atualizar `friendships.updateRule` (regra antiga estava a bloquear accept() legítimo).');
    if (APPLY) {
      await pb.collections.update(friendships.id, { updateRule: FRIENDSHIPS_UPDATE_RULE });
      console.log('  ✓ `friendships.updateRule` atualizada.');
    }
  }

  if (!friendships) {
    const payload = {
      name: 'friendships',
      type: 'base',
      fields: [
        { name: 'user_a', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, minSelect: 0 },
        { name: 'user_b', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, minSelect: 0 },
        { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['pending', 'accepted'] },
        { name: 'requested_by', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, minSelect: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_friendships_pair ON friendships (user_a, user_b)'],
      listRule: 'user_a = @request.auth.id || user_b = @request.auth.id',
      viewRule: 'user_a = @request.auth.id || user_b = @request.auth.id',
      createRule:
        'requested_by = @request.auth.id && (user_a = @request.auth.id || user_b = @request.auth.id) && user_a != user_b && user_a < user_b',
      updateRule: FRIENDSHIPS_UPDATE_RULE,
      deleteRule: 'user_a = @request.auth.id || user_b = @request.auth.id',
    };
    console.log('+ Criar coleção `friendships`:', JSON.stringify(payload, null, 2));
    if (APPLY) {
      friendships = await pb.collections.create(payload);
      console.log('  ✓ criada, id =', friendships.id);
    }
  }

  // --- 2. expenses: group_id opcional + participants + regras --------------
  await patchGroupOrDirectCollection(pb, expenses, users, { patchUpdateDelete: true });

  // --- 3. expense_comments: idem, mas update/delete ficam "autor só" -------
  await patchGroupOrDirectCollection(pb, comments, users, { patchUpdateDelete: false });

  console.log(APPLY ? '\nAplicado.' : '\nDry-run — nada escrito. Corre com --apply para gravar a sério.');
}

async function patchGroupOrDirectCollection(pb, collection, users, { patchUpdateDelete }) {
  const groupIdField = collection.fields.find((f) => f.name === 'group_id');
  const hasParticipants = collection.fields.some((f) => f.name === 'participants');
  const needsGroupIdOptional = groupIdField?.required === true;

  if (!needsGroupIdOptional && hasParticipants && collection.listRule === GROUP_OR_PARTICIPANTS_RULE) {
    console.log(`✓ \`${collection.name}\` já está atualizada — a saltar.`);
    return;
  }

  const fields = collection.fields.map((f) =>
    f.name === 'group_id' ? { ...f, required: false } : f,
  );
  if (!hasParticipants) fields.push(participantsField(users.id));

  const patch = {
    fields,
    listRule: GROUP_OR_PARTICIPANTS_RULE,
    viewRule: GROUP_OR_PARTICIPANTS_RULE,
    createRule: GROUP_OR_PARTICIPANTS_RULE,
  };
  if (patchUpdateDelete) {
    patch.updateRule = GROUP_OR_PARTICIPANTS_RULE;
    patch.deleteRule = GROUP_OR_PARTICIPANTS_RULE;
  }

  console.log(`~ Atualizar \`${collection.name}\`: group_id opcional=${needsGroupIdOptional}, +participants=${!hasParticipants}, regras -> ${GROUP_OR_PARTICIPANTS_RULE}`);
  if (APPLY) {
    await pb.collections.update(collection.id, patch);
    console.log(`  ✓ \`${collection.name}\` atualizada.`);
  }
}

main().catch((err) => {
  console.error('Falhou:', err?.response?.data ?? err);
  process.exit(1);
});
