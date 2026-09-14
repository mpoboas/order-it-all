import { canonicalPartyId } from '@/lib/parties';
import type { Party } from '@/lib/types';

/** Dispara uma notificação push via `/api/notify` — falha em silêncio (a
 *  mesma política dos outros disparos existentes, ex. viagens). */
export async function notify(opts: {
  targetUserIds: string[];
  excludeUserId?: string;
  title: string;
  message: string;
  url: string;
}): Promise<void> {
  if (opts.targetUserIds.length === 0) return;
  try {
    await fetch('/api/notify', {
      method: 'POST',
      body: JSON.stringify(opts),
    });
  } catch (error) {
    console.error('notify failed', error);
  }
}

/** Ids de utilizadores com conta (não fantasmas) a partir de uma lista de
 *  ids de parte — resolve placeholders reclamados ao utilizador que os
 *  reclamou, ignora os por reclamar (não têm conta para notificar). */
export function notifiableUserIds(
  partyIds: string[],
  parties: Map<string, Party>,
  excludeUserId?: string,
): string[] {
  const ids = new Set<string>();
  for (const pid of partyIds) {
    const canonical = canonicalPartyId(pid, parties);
    const party = parties.get(canonical);
    if (party?.kind === 'user' && canonical !== excludeUserId) ids.add(canonical);
  }
  return Array.from(ids);
}
