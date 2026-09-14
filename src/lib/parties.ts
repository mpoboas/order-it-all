import type { Group, Party, Placeholder, User } from '@/lib/types';
import { getUserAvatarUrl } from '@/lib/orderParticipants';

/** Constrói o mapa de partes de um grupo: membros com conta + placeholders
 *  (membros sem conta). Toda a UI de despesas/saldos resolve nomes/avatares
 *  através daqui em vez de percorrer `group.expand`/nomes livres. */
export function buildPartyMap(
  members: User[],
  placeholders: Placeholder[],
): Map<string, Party> {
  const map = new Map<string, Party>();
  for (const m of members) {
    map.set(m.id, {
      id: m.id,
      name: m.name || m.email || 'Sem nome',
      avatar: getUserAvatarUrl(m.id, m.avatar),
      email: m.email,
      mbwayPhone: m.mbway_phone,
      username: m.username,
      kind: 'user',
    });
  }
  for (const p of placeholders) {
    map.set(p.id, {
      id: p.id,
      name: p.name,
      kind: 'placeholder',
      claimedBy: p.claimed_by || undefined,
    });
  }
  return map;
}

/** Membros (com conta) de um grupo — mesma extração que `collectGroupMembers`
 *  de `splitShare.ts`, reaproveitada aqui para não duplicar a lógica de expand. */
export function groupMembersFromExpand(group: Pick<Group, 'expand'> | null | undefined): User[] {
  if (!group?.expand) return [];
  const people: User[] = [];
  if (group.expand.creator) people.push(group.expand.creator);
  if (group.expand.admins) people.push(...group.expand.admins);
  if (group.expand.members) people.push(...group.expand.members);
  const seen = new Set<string>();
  const out: User[] = [];
  for (const m of people) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** Id "canónico" de uma parte — funde um placeholder reclamado com o
 *  utilizador que o reclamou. Toda a matemática de saldos deve passar os ids
 *  por aqui antes de somar; a UI mostra sempre o nome do reclamante. */
export function canonicalPartyId(id: string, parties: Map<string, Party>): string {
  const party = parties.get(id);
  return party?.claimedBy ?? id;
}

export function partyLabel(id: string, parties: Map<string, Party>): string {
  const canonical = parties.get(id)?.claimedBy ?? id;
  return parties.get(canonical)?.name ?? parties.get(id)?.name ?? 'Alguém';
}

export function partyAvatarUrl(id: string, parties: Map<string, Party>): string | undefined {
  const canonical = parties.get(id)?.claimedBy ?? id;
  return parties.get(canonical)?.avatar ?? parties.get(id)?.avatar;
}

/** Resolve nome/avatar de um id de parte — a mesma forma serve tanto o lado
 *  autenticado (`partyResolver`, sobre o `Map<string, Party>` do grupo) como
 *  o lado público do link partilhado (`publicPartyResolver` em
 *  `splitShare.ts`, sobre a lista `parties` do payload), para os sheets de
 *  alocação (`SplitMemberItemAllocationSheet`) não precisarem de dois caminhos. */
export interface PartyResolver {
  label: (id: string) => string;
  avatarUrl: (id: string) => string | undefined;
}

export function partyResolver(parties: Map<string, Party>): PartyResolver {
  return {
    label: (id) => partyLabel(id, parties),
    avatarUrl: (id) => partyAvatarUrl(id, parties),
  };
}

/** Ids de utilizadores reais (nunca placeholders) entre uma lista de ids de
 *  parte — resolve pelo id canónico primeiro (um placeholder reclamado conta
 *  como o utilizador que o reclamou). É o valor a gravar em
 *  `Expense.participants`/`ExpenseComment.participants` (Fase 8): o
 *  mecanismo de autorização/sync para despesas sem grupo. */
export function realParticipantIds(ids: string[], parties: Map<string, Party>): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const canonical = canonicalPartyId(id, parties);
    if (parties.get(canonical)?.kind === 'user') out.add(canonical);
  }
  return Array.from(out);
}

export function isPlaceholder(id: string, parties: Map<string, Party>): boolean {
  return parties.get(id)?.kind === 'placeholder';
}

/** Um placeholder reclamado (`claimedBy` presente) já não deve aparecer como
 *  "sem conta" em picklists — o utilizador reclamante é que representa a parte. */
export function isUnclaimedPlaceholder(id: string, parties: Map<string, Party>): boolean {
  const party = parties.get(id);
  return party?.kind === 'placeholder' && !party.claimedBy;
}

/** Partes do grupo que ainda não estão numa lista de participantes — para os
 *  candidatos do seletor "+ Pessoa". */
export function partiesNotIn(
  parties: Map<string, Party>,
  participantIds: string[],
): Party[] {
  const already = new Set(participantIds);
  return Array.from(parties.values()).filter((p) => !already.has(p.id));
}

/** Placeholder do grupo com este nome (comparação sem maiúsculas/acentos triviais)
 *  — evita criar um duplicado quando alguém escreve um nome já usado por outro
 *  placeholder que ainda não está nesta divisão em particular. */
export function findPlaceholderByName(
  name: string,
  placeholders: Placeholder[],
): Placeholder | undefined {
  const norm = name.trim().toLowerCase();
  return placeholders.find((p) => p.name.trim().toLowerCase() === norm);
}

/**
 * A parte do utilizador atual numa lista de participantes — id direto se for
 * membro, o placeholder que já reclamou (histórico não reescrito), ou por
 * fim uma correspondência de nome com um placeholder ainda não reclamado
 * (ajuda quem abre um link de partilha pela primeira vez a encontrar-se na
 * lista antes de reclamar). `null` se não encontrar nada.
 */
export function findMyPartyId(
  participantIds: string[],
  parties: Map<string, Party>,
  user: Pick<User, 'id' | 'name' | 'email'> | null | undefined,
): string | null {
  if (!user) return null;
  if (participantIds.includes(user.id)) return user.id;

  const claimed = participantIds.find((id) => parties.get(id)?.claimedBy === user.id);
  if (claimed) return claimed;

  const candidates = [user.name, user.email]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.trim().toLowerCase());
  const emailLocal = user.email?.split('@')[0]?.trim().toLowerCase();
  if (emailLocal) candidates.push(emailLocal);

  for (const id of participantIds) {
    const party = parties.get(id);
    if (!party || party.kind !== 'placeholder' || party.claimedBy) continue;
    if (candidates.includes(party.name.trim().toLowerCase())) return id;
  }
  return null;
}
