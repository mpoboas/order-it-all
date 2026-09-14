#!/usr/bin/env node
/**
 * Importa um export CSV do Splitwise ("Detailed export") como despesas do
 * livro-razão nativo, para um grupo já existente. Ignora linhas de
 * categoria "Payment" (pedido explícito — pagamentos não entram) e a linha
 * de resumo "Total balance".
 *
 * Cada pessoa do CSV que ainda não é membro do grupo (nem já tem um
 * placeholder com esse nome) ganha um placeholder novo — reclamável mais
 * tarde pela própria pessoa (Fase 1 do livro-razão).
 *
 * Reconstrução de payers/shares a partir do valor líquido do Splitwise
 * (positivo = credor, negativo = devedor) — ver nota no código sobre o caso
 * (raro) de mais do que um credor na mesma despesa: o maior fica com o
 * "resto" do valor pago, os outros ficam sem parte própria (share = 0),
 * porque o CSV não dá para separar isso ao cêntimo — só junta os dois.
 *
 * Uso:
 *   node scripts/import-splitwise-csv.mjs --file "<csv>" --group <groupId> [--apply]
 */

import { readFileSync } from 'node:fs';
import nextEnv from '@next/env';
import PocketBase from 'pocketbase';

nextEnv.loadEnvConfig(process.cwd(), true);

const APPLY = process.argv.includes('--apply');
const fileArg = argValue('--file');
const groupArg = argValue('--group');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

if (!fileArg || !groupArg) {
  console.error('Uso: node scripts/import-splitwise-csv.mjs --file <csv> --group <groupId> [--apply]');
  process.exit(1);
}

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

const CATEGORY_MAP = {
  Groceries: 'groceries',
  Liquor: 'food',
  Pets: 'pets',
};

const KEYWORD_RULES = [
  { category: 'groceries', keywords: ['mercearia', 'continente', 'pingo doce', 'lidl', 'auchan', 'minipreco', 'mini-preco', 'supermercado', 'compras', 'e-leclerc', 'leclerc'] },
  { category: 'food', keywords: ['jantar', 'almoco', 'almoço', 'pequeno-almoco', 'restaurante', 'cafe', 'café', 'pizza', 'hamburguer', 'sushi', 'lanche', 'bebidas', 'bar', 'padaria', 'gelado'] },
  { category: 'transport', keywords: ['uber', 'bolt', 'taxi', 'gasolina', 'combustivel', 'combustível', 'portagem', 'portagens', 'estacionamento', 'comboio', 'cp ', 'metro', 'autocarro', 'via verde'] },
  { category: 'home', keywords: ['renda', 'aluguer', 'condominio', 'condomínio'] },
  { category: 'utilities', keywords: ['luz', 'eletricidade', 'água', 'agua', 'gas', 'gás', 'internet', 'wifi', 'telemovel', 'telemóvel'] },
  { category: 'entertainment', keywords: ['cinema', 'concerto', 'festival', 'bilhetes', 'netflix', 'spotify', 'jogo', 'discoteca'] },
  { category: 'health', keywords: ['farmacia', 'farmácia', 'medico', 'médico', 'consulta', 'hospital'] },
  { category: 'travel', keywords: ['viagem', 'hotel', 'alojamento', 'voo', 'aviao', 'avião', 'airbnb'] },
  { category: 'pets', keywords: ['veterinario', 'veterinário', 'racao', 'ração'] },
];

function normalize(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function guessCategory(description) {
  const norm = normalize(description);
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((k) => norm.includes(k))) return rule.category;
  }
  return 'other';
}

function mapCategory(splitwiseCategory, description) {
  if (splitwiseCategory === 'General' || !splitwiseCategory) return guessCategory(description);
  return CATEGORY_MAP[splitwiseCategory] ?? 'other';
}

function parseCsv(text) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const header = lines[0].split(',');
  const personNames = header.slice(5); // Date,Description,Category,Cost,Currency, ...pessoas
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (cells.length < 5) continue;
    const [date, description, category, cost] = cells;
    if (!date || description === 'Total balance') continue;
    if (category === 'Payment') continue; // pedido explícito: sem pagamentos
    const amounts = cells.slice(5).map((c) => Number(c) || 0);
    rows.push({ date, description, category, cost: Number(cost), amounts, personNames });
  }
  return rows;
}

/** payers/shares a partir dos valores líquidos por pessoa (positivo =
 *  credor, negativo = devedor) — ver nota no topo do ficheiro. */
function reconstructPayersShares(cost, entries) {
  const creditors = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  const debtors = entries.filter((e) => e.value < 0);

  const payers = [];
  const shares = [];

  for (const d of debtors) shares.push({ party: d.partyId, amount: round2(-d.value) });

  const [primary, ...secondary] = creditors;
  for (const s of secondary) payers.push({ party: s.partyId, amount: round2(s.value) });

  if (primary) {
    // Os credores secundários (raros — ver nota no topo) ficam sem parte
    // própria (share = 0); só o resto do custo (depois das partes de quem
    // deve) fica atribuído ao credor principal.
    const debtorSharesSum = shares.reduce((sum, s) => sum + s.amount, 0);
    const primaryShare = round2(cost - debtorSharesSum);
    payers.push({ party: primary.partyId, amount: round2(primary.value + primaryShare) });
    if (primaryShare > 0.001) shares.push({ party: primary.partyId, amount: primaryShare });
  }

  return { payers, shares };
}

function round2(n) {
  return Math.round(n * 100) / 100;
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

  const group = await pb.collection('groups').getOne(groupArg, { expand: 'creator,admins,members' });
  console.log(`Grupo: ${group.name} (${group.id})`);
  const actorId = group.creator;

  const csvText = readFileSync(fileArg, 'utf-8');
  const rows = parseCsv(csvText);
  console.log(`\n${rows.length} despesas a importar (pagamentos excluídos).`);

  // Nomes → placeholders (existentes ou a criar)
  const memberByName = new Map();
  for (const m of [group.expand?.creator, ...(group.expand?.admins ?? []), ...(group.expand?.members ?? [])]) {
    if (m?.name) memberByName.set(m.name.trim().toLowerCase(), m.id);
  }
  const existingPlaceholders = await pb.collection('placeholders').getFullList({ filter: `group_id = "${group.id}"` });
  const placeholderByName = new Map(existingPlaceholders.map((p) => [p.name.trim().toLowerCase(), p.id]));

  const allNames = new Set();
  for (const r of rows) for (const name of r.personNames) allNames.add(name.trim());

  console.log('\nPartes:');
  const nameToPartyId = new Map();
  for (const name of allNames) {
    const norm = name.toLowerCase();
    if (memberByName.has(norm)) {
      nameToPartyId.set(name, memberByName.get(norm));
      console.log(`  ${name} → membro existente`);
    } else if (placeholderByName.has(norm)) {
      nameToPartyId.set(name, placeholderByName.get(norm));
      console.log(`  ${name} → placeholder já existente`);
    } else {
      console.log(`  ${name} → placeholder NOVO`);
      if (APPLY) {
        const created = await pb.collection('placeholders').create({
          group_id: group.id,
          name,
          created_by: actorId,
        });
        nameToPartyId.set(name, created.id);
      } else {
        nameToPartyId.set(name, `dryrun:${name}`); // só para a pré-visualização somar certo
      }
    }
  }

  console.log('\nDespesas:');
  let created = 0;
  for (const row of rows) {
    const entries = row.personNames
      .map((name, i) => ({ partyId: nameToPartyId.get(name.trim()), value: row.amounts[i] }))
      .filter((e) => Math.abs(e.value) > 0.001 && e.partyId);

    const { payers, shares } = reconstructPayersShares(row.cost, entries);
    const category = mapCategory(row.category, row.description);
    const payersSum = round2(payers.reduce((s, p) => s + p.amount, 0));
    const sharesSum = round2(shares.reduce((s, p) => s + p.amount, 0));

    console.log(
      `  ${row.date} · ${row.description} (${category}) · ${row.cost}€ · pagadores=${payersSum}€ partes=${sharesSum}€${
        Math.abs(payersSum - row.cost) > 0.02 || Math.abs(sharesSum - row.cost) > 0.02 ? '  ⚠️ NÃO BATE CERTO' : ''
      }`,
    );

    if (APPLY) {
      await pb.collection('expenses').create({
        group_id: group.id,
        kind: 'expense',
        description: row.description,
        amount: row.cost,
        date: row.date,
        category,
        split_mode: 'exact',
        payers,
        shares,
        created_by: actorId,
      });
      created++;
    }
  }

  console.log(APPLY ? `\nCriadas ${created} despesas.` : '\nDry-run — nada escrito, corre com --apply.');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
