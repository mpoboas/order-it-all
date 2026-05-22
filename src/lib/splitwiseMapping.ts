import type { SplitwiseMemberCache } from '@/lib/types';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function memberDisplayName(m: SplitwiseMemberCache): string {
  return m.displayName || `${m.firstName} ${m.lastName}`.trim();
}

export function suggestSplitwiseMemberId(
  participantName: string,
  members: SplitwiseMemberCache[],
  existingMap?: Record<string, number>
): number | null {
  if (existingMap?.[participantName]) return existingMap[participantName];

  const norm = normalize(participantName);
  if (!norm) return null;

  for (const m of members) {
    if (normalize(memberDisplayName(m)) === norm) return m.id;
    if (m.email && normalize(m.email) === norm) return m.id;
    const local = m.email?.split('@')[0];
    if (local && normalize(local) === norm) return m.id;
  }

  for (const m of members) {
    const display = normalize(memberDisplayName(m));
    if (display.includes(norm) || norm.includes(display)) return m.id;
  }

  return null;
}

export function buildDefaultParticipantMap(
  participants: string[],
  members: SplitwiseMemberCache[],
  groupDefaults?: Record<string, number>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const name of participants) {
    const fromGroup = groupDefaults?.[name];
    if (fromGroup) {
      map[name] = fromGroup;
      continue;
    }
    const suggested = suggestSplitwiseMemberId(name, members, map);
    if (suggested) map[name] = suggested;
  }
  return map;
}
