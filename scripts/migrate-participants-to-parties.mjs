#!/usr/bin/env node
/**
 * Fase 1 do livro-razão de despesas — migra `Split.participants` (e
 * `item.participants`/`item.allocations` chaves) de **nomes livres**
 * (strings como "Ana", "Rui") para **ids de parte**: o id do utilizador do
 * grupo que corresponde ao nome, ou um novo `placeholders` (membro sem
 * conta) quando não há correspondência.
 *
 * Corre como super-utilizador (`POCKETBASE_ADMIN_EMAIL`/`PASSWORD`) — as
 * regras de acesso das coleções não se aplicam, por isso não há dança de
 * OCC (`items_version`) a fazer aqui, só se bumpa por consistência com o
 * que a app espera de um registo escrito.
 *
 * Uso (por omissão é dry-run — só relatório, nada é escrito). Carrega o
 * `.env`/`.env.development.local` da mesma forma que o Next.js (via
 * `@next/env`, já uma dependência do projeto) — o `--env-file` nativo do
 * Node interpreta `\$` de forma diferente do Next e parte a password:
 *   node scripts/migrate-participants-to-parties.mjs
 *   node scripts/migrate-participants-to-parties.mjs --apply
 */

import nextEnv from '@next/env';
import PocketBase from 'pocketbase';

// `dev: true` — também carrega `.env.development.local`/`.env.development`
// (onde vive o URL da BD de teste); sem isto só lia `.env.local`/`.env` (produção).
nextEnv.loadEnvConfig(process.cwd(), true);

const APPLY = process.argv.includes('--apply');

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

function normalize(value) {
  return (value || '').trim().toLowerCase();
}

function nameCandidates(user) {
  const candidates = [user.name, user.email].filter(Boolean);
  const emailLocal = user.email?.split('@')[0];
  if (emailLocal) candidates.push(emailLocal);
  return candidates.map(normalize).filter(Boolean);
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error(
      'Faltam POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD no ambiente.\n' +
        'Corre com: node --env-file=.env.development.local scripts/migrate-participants-to-parties.mjs'
    );
    process.exit(1);
  }

  console.log(`PocketBase: ${PB_URL}`);
  console.log(APPLY ? '⚠️  MODO REAL — vai escrever.' : '🔍 DRY-RUN — só relatório, nada é escrito. Usa --apply para gravar a sério.');
  console.log('');

  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);

  const [groups, splits, allPlaceholders] = await Promise.all([
    pb.collection('groups').getFullList({ expand: 'creator,admins,members' }),
    pb.collection('splits').getFullList(),
    pb.collection('placeholders').getFullList(),
  ]);

  // --- membros por grupo (id, candidatos de nome normalizados) ------------
  const membersByGroup = new Map(); // groupId -> Array<{ id, candidates: string[] }>
  for (const group of groups) {
    const people = [];
    const seen = new Set();
    const push = (u) => {
      if (u?.id && !seen.has(u.id)) {
        seen.add(u.id);
        people.push({ id: u.id, candidates: nameCandidates(u) });
      }
    };
    push(group.expand?.creator);
    group.expand?.admins?.forEach(push);
    group.expand?.members?.forEach(push);
    membersByGroup.set(group.id, people);
  }

  // --- placeholders existentes por grupo (normalizado → id) ---------------
  const placeholdersByGroup = new Map(); // groupId -> Map<normalizedName, id>
  for (const p of allPlaceholders) {
    const map = placeholdersByGroup.get(p.group_id) ?? new Map();
    map.set(normalize(p.name), p.id);
    placeholdersByGroup.set(p.group_id, map);
  }

  // "ids conhecidos" por grupo — usado para detetar splits já migrados
  // (todos os participantes já são um id de membro ou de placeholder).
  function knownIds(groupId) {
    const ids = new Set((membersByGroup.get(groupId) ?? []).map((m) => m.id));
    for (const id of (placeholdersByGroup.get(groupId) ?? new Map()).values()) ids.add(id);
    return ids;
  }

  let migrated = 0;
  let skippedAlready = 0;
  let skippedEmpty = 0;
  let placeholdersCreated = 0;
  const report = [];

  for (const split of splits) {
    const participants = Array.isArray(split.participants) ? split.participants : [];
    if (participants.length === 0) {
      skippedEmpty++;
      continue;
    }

    const known = knownIds(split.group_id);
    if (participants.every((p) => known.has(p))) {
      skippedAlready++;
      continue;
    }

    const members = membersByGroup.get(split.group_id) ?? [];
    const groupPlaceholders =
      placeholdersByGroup.get(split.group_id) ?? new Map();
    placeholdersByGroup.set(split.group_id, groupPlaceholders);

    /** Resolve um nome (ou um id já migrado) para um id de parte, criando um
     *  placeholder novo se preciso — reaproveita entre splits do mesmo grupo. */
    const nameToId = new Map();
    async function resolve(raw) {
      if (known.has(raw)) return raw; // já é um id (membro ou placeholder existente)
      if (nameToId.has(raw)) return nameToId.get(raw);

      const norm = normalize(raw);
      const member = members.find((m) => m.candidates.includes(norm));
      if (member) {
        nameToId.set(raw, member.id);
        return member.id;
      }

      const existingPlaceholder = groupPlaceholders.get(norm);
      if (existingPlaceholder) {
        nameToId.set(raw, existingPlaceholder);
        return existingPlaceholder;
      }

      if (!APPLY) {
        const fakeId = `[novo placeholder: "${raw}"]`;
        nameToId.set(raw, fakeId);
        return fakeId;
      }

      const created = await pb.collection('placeholders').create({
        group_id: split.group_id,
        name: raw.trim(),
        created_by: split.created_by,
      });
      placeholdersCreated++;
      groupPlaceholders.set(norm, created.id);
      nameToId.set(raw, created.id);
      return created.id;
    }

    const newParticipants = [];
    for (const p of participants) newParticipants.push(await resolve(p));

    const items = Array.isArray(split.items) ? split.items : [];
    const newItems = [];
    for (const item of items) {
      const itemParticipants = [];
      for (const p of item.participants ?? []) itemParticipants.push(await resolve(p));

      let allocations;
      if (item.allocations) {
        allocations = {};
        for (const [name, value] of Object.entries(item.allocations)) {
          const id = await resolve(name);
          allocations[id] = value;
        }
      }

      newItems.push({ ...item, participants: itemParticipants, allocations });
    }

    report.push({
      splitId: split.id,
      splitName: split.name,
      groupId: split.group_id,
      mapping: [...nameToId.entries()],
    });

    if (APPLY) {
      await pb.collection('splits').update(split.id, {
        participants: newParticipants,
        items: newItems,
        items_version: (split.items_version ?? 0) + 1,
      });
    }
    migrated++;
  }

  console.log(`Grupos: ${groups.length}`);
  console.log(`Splits: ${splits.length}`);
  console.log(`  migrados${APPLY ? '' : ' (seriam)'}: ${migrated}`);
  console.log(`  já migrados (ignorados): ${skippedAlready}`);
  console.log(`  sem participantes (ignorados): ${skippedEmpty}`);
  console.log(`Placeholders ${APPLY ? 'criados' : 'que seriam criados'}: ${APPLY ? placeholdersCreated : report.reduce((s, r) => s + r.mapping.filter(([, v]) => typeof v === 'string' && v.startsWith('[novo placeholder')).length, 0)}`);
  console.log('');

  if (report.length > 0) {
    console.log('Detalhe por divisão:');
    for (const r of report) {
      console.log(`\n— "${r.splitName}" (${r.splitId}, grupo ${r.groupId})`);
      for (const [from, to] of r.mapping) {
        console.log(`    "${from}" → ${to}`);
      }
    }
  }

  if (!APPLY) {
    console.log('\nDry-run concluído — nada foi escrito. Confirma o relatório e corre outra vez com --apply.');
  } else {
    console.log('\nMigração aplicada.');
  }
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
