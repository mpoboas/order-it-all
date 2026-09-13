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

export function isPlaceholder(id: string, parties: Map<string, Party>): boolean {
  return parties.get(id)?.kind === 'placeholder';
}

/** Um placeholder reclamado (`claimedBy` presente) já não deve aparecer como
 *  "sem conta" em picklists — o utilizador reclamante é que representa a parte. */
export function isUnclaimedPlaceholder(id: string, parties: Map<string, Party>): boolean {
  const party = parties.get(id);
  return party?.kind === 'placeholder' && !party.claimedBy;
}
