import type { GroupMember } from 'splitwise';
import type { SplitwiseMemberCache } from '@/lib/types';

export function splitwiseMembersFromGroup(
  members: GroupMember[] | undefined
): SplitwiseMemberCache[] {
  if (!members?.length) return [];
  return members.map((m) => {
    const firstName = m.firstName ?? '';
    const lastName = m.lastName ?? '';
    const email = m.email ?? '';
    return {
      id: m.id,
      firstName,
      lastName,
      email,
      displayName: `${firstName} ${lastName}`.trim() || email || `User ${m.id}`,
    };
  });
}
