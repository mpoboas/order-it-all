// Invariantes do livro-razão e limites de grupo, impostas NO SERVIDOR
// (PocketBase JSVM) — as regras de API não conseguem somar arrays JSON nem
// comparar o grupo antigo com o novo, e a UI sozinha não é garantia (qualquer
// membro pode escrever direto na API).
//
// Este módulo é carregado com `require()` dentro dos handlers de
// `main.pb.js` (cada handler corre num contexto isolado — não vê variáveis de
// fora). A lógica é pura: recebe os dados e um objeto `lookup` com as
// consultas à BD, para poder ser testada fora do PocketBase
// (`src/lib/ledger/serverInvariants.test.ts`).

/** Erro de validação com mensagem pt-PT para mostrar ao utilizador. */
class InvariantError extends Error {}

function toCents(amount) {
  const n = Number(amount);
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

function sumCents(lines) {
  return lines.reduce((sum, line) => sum + toCents(line.amount), 0);
}

function fmt(cents) {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

function asLines(value, field) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new InvariantError(`"${field}" tem de ser uma lista.`);
  for (const line of value) {
    if (!line || typeof line.party !== 'string' || !line.party) {
      throw new InvariantError(`"${field}" tem uma linha sem pessoa.`);
    }
    const n = Number(line.amount);
    if (!Number.isFinite(n) || n < 0) {
      throw new InvariantError(`"${field}" tem um valor inválido.`);
    }
  }
  return value;
}

/**
 * 1 · Somas: Σ pagadores = total e Σ partes = total, em cêntimos.
 * Estados intermédios legítimos que continuam a ser aceites:
 *   - sem pagadores ("Falta pagador" — despesas migradas das divisões antigas);
 *   - sem partes só em `split_mode = itemized` (a despesa nasce antes de os
 *     itens estarem distribuídos).
 */
function checkSums(expense) {
  const totalCents = toCents(expense.amount);
  if (totalCents <= 0) throw new InvariantError('O total tem de ser maior que zero.');

  const payers = asLines(expense.payers, 'payers');
  const shares = asLines(expense.shares, 'shares');

  if (payers.length > 0) {
    const paid = sumCents(payers);
    if (paid !== totalCents) {
      throw new InvariantError(`Os pagadores somam ${fmt(paid)} mas o total é ${fmt(totalCents)}.`);
    }
  }
  if (shares.length > 0) {
    const owed = sumCents(shares);
    if (owed !== totalCents) {
      throw new InvariantError(`A divisão soma ${fmt(owed)} mas o total é ${fmt(totalCents)}.`);
    }
  } else if (expense.split_mode !== 'itemized') {
    throw new InvariantError('A despesa tem de estar dividida por alguém.');
  }
  if (expense.kind === 'payment' && (payers.length !== 1 || shares.length !== 1)) {
    throw new InvariantError('Um pagamento tem exatamente um pagador e um recetor.');
  }
  return { payers, shares };
}

function partiesOf(payers, shares) {
  return Array.from(new Set(payers.concat(shares).map((l) => l.party)));
}

/**
 * Valida uma despesa completa (já com os dados novos aplicados).
 *
 * @param expense  { group_id, kind, amount, split_mode, payers, shares, participants }
 * @param ctx      { authId, isCreate, groupChanged, previousParties }
 *                 `previousParties` = partes da versão anterior (update) — só as
 *                 partes NOVAS têm de pertencer ao grupo, para quem saiu do grupo
 *                 não tornar o histórico dele impossível de editar.
 * @param lookup   { isGroupMember(groupId, userId), isGroupParty(groupId, partyId),
 *                   areFriends(a, b), haveDirectHistory(a, b) }
 */
function validateExpense(expense, ctx, lookup) {
  const { payers, shares } = checkSums(expense);
  const parties = partiesOf(payers, shares);
  const groupId = expense.group_id || '';

  if (groupId) {
    // 2 · Limites de grupo: mudar de grupo só para um grupo onde quem pede
    // é membro, e todas as partes têm de pertencer ao grupo de destino.
    if ((ctx.isCreate || ctx.groupChanged) && !lookup.isGroupMember(groupId, ctx.authId)) {
      throw new InvariantError('Não és membro desse grupo.');
    }
    const known = ctx.groupChanged ? [] : ctx.previousParties || [];
    for (const party of parties) {
      if (known.indexOf(party) === -1 && !lookup.isGroupParty(groupId, party)) {
        throw new InvariantError('Há pessoas na despesa que não pertencem ao grupo.');
      }
    }
    return;
  }

  // 3 · Despesa direta (sem grupo): só entre amigos. Só se verifica ao criar
  // (ou ao sair de um grupo para direta) — desfazer uma amizade não pode
  // impedir de editar/apagar o histórico que já existe.
  const participants = Array.isArray(expense.participants) ? expense.participants : [];
  for (const party of parties) {
    if (participants.indexOf(party) === -1) {
      throw new InvariantError('Numa despesa direta, todos os envolvidos têm de ser participantes.');
    }
  }
  if (!(ctx.isCreate || ctx.groupChanged)) return;

  if (participants.indexOf(ctx.authId) === -1) {
    throw new InvariantError('Tens de fazer parte da despesa.');
  }
  for (const other of participants) {
    if (other === ctx.authId) continue;
    const ok =
      lookup.areFriends(ctx.authId, other) ||
      // Acertar contas depois de desfazer a amizade continua possível — mas
      // só um pagamento, e só com quem já há despesas diretas em comum.
      (expense.kind === 'payment' && lookup.haveDirectHistory(ctx.authId, other));
    if (!ok) {
      throw new InvariantError('Só podes criar despesas diretas com amigos.');
    }
  }
}

/** Conflito de edição (outra pessoa gravou entretanto) — vira HTTP 409. */
class ConflictError extends Error {}

/**
 * 4 · Controlo de concorrência otimista das despesas. O cliente manda o
 * `updated` da versão que abriu para editar (`expected_updated`); se o
 * guardado já for outro, alguém gravou entretanto e esta escrita apagaria a
 * alteração dessa pessoa sem ela (nem quem edita) saber. Sem
 * `expected_updated` não há verificação (scripts, versões antigas da app).
 *
 * @param expected   `expected_updated` enviado pelo cliente (ou vazio)
 * @param current    { updated, deleted_at } da versão guardada
 * @param touchesDeletion  o pedido mexe em `deleted_at` (apagar/restaurar)
 */
function checkNotStale(expected, current, touchesDeletion) {
  if (!expected) return;
  if (current.deleted_at && !touchesDeletion) {
    throw new ConflictError('Esta despesa foi apagada por outra pessoa entretanto.');
  }
  if (String(expected) !== String(current.updated)) {
    throw new ConflictError('Esta despesa foi alterada por outra pessoa entretanto.');
  }
}

/** 2 · Mover um registo filho entre grupos: o grupo antigo e o novo têm de
 *  ser o mesmo (encomendas entre viagens, itens entre encomendas). */
function checkSameGroup(oldGroupId, newGroupId, what) {
  if (oldGroupId !== newGroupId) {
    throw new InvariantError(`Não é possível mover ${what} para outro grupo.`);
  }
}

module.exports = {
  InvariantError,
  ConflictError,
  checkNotStale,
  toCents,
  checkSums,
  validateExpense,
  checkSameGroup,
};
