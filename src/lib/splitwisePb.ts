import PocketBase from 'pocketbase';
import type { Group, GroupSplitwise, GroupSplitwisePublic, Split } from '@/lib/types';

const pbUrl =
  process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';

const COLLECTION = 'group_splitwise';

let adminAuthPromise: Promise<PocketBase> | null = null;

export async function getPbAdmin(): Promise<PocketBase> {
  if (adminAuthPromise) return adminAuthPromise;

  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const pass = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || !pass) {
    throw new Error('Server misconfiguration');
  }

  adminAuthPromise = (async () => {
    const pb = new PocketBase(pbUrl);
    try {
      await pb.collection('_superusers').authWithPassword(email, pass);
      return pb;
    } catch (err) {
      adminAuthPromise = null;
      throw err;
    }
  })();

  return adminAuthPromise;
}

function escapeId(id: string): string {
  return id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function getGroupSplitwiseByGroupId(
  groupId: string
): Promise<GroupSplitwise | null> {
  const pb = await getPbAdmin();
  try {
    return await pb.collection(COLLECTION).getFirstListItem<GroupSplitwise>(
      `group_id = "${escapeId(groupId)}"`
    );
  } catch {
    return null;
  }
}

export async function upsertGroupSplitwise(
  groupId: string,
  data: Partial<
    Omit<GroupSplitwise, 'id' | 'group_id' | 'created' | 'updated'>
  >
): Promise<GroupSplitwise> {
  const pb = await getPbAdmin();
  const existing = await getGroupSplitwiseByGroupId(groupId);

  if (existing) {
    return pb.collection(COLLECTION).update<GroupSplitwise>(existing.id, data);
  }

  return pb.collection(COLLECTION).create<GroupSplitwise>({
    group_id: groupId,
    ...data,
  });
}

export async function deleteGroupSplitwiseByGroupId(
  groupId: string
): Promise<void> {
  const pb = await getPbAdmin();
  const existing = await getGroupSplitwiseByGroupId(groupId);
  if (existing) {
    await pb.collection(COLLECTION).delete(existing.id);
  }
}

export function isSplitwiseConnected(
  config: GroupSplitwise | null | undefined
): boolean {
  return Boolean(config?.access_token?.trim());
}

export function toPublicSplitwiseConfig(
  config: GroupSplitwise | null
): GroupSplitwisePublic | null {
  if (!config) return null;
  const { access_token: _token, ...rest } = config;
  return {
    ...rest,
    connected: isSplitwiseConnected(config),
  };
}

export async function getGroupByIdAdmin(groupId: string): Promise<Group> {
  const pb = await getPbAdmin();
  return pb.collection('groups').getOne<Group>(groupId);
}

export async function getSplitByIdAdmin(splitId: string): Promise<Split> {
  const pb = await getPbAdmin();
  return pb.collection('splits').getOne<Split>(splitId);
}

export async function updateSplitAdmin(
  splitId: string,
  data: Partial<Split>
): Promise<Split> {
  const pb = await getPbAdmin();
  return pb.collection('splits').update<Split>(splitId, data);
}

/** Load group + Splitwise config for server routes */
export async function getGroupWithSplitwise(groupId: string): Promise<{
  group: Group;
  splitwise: GroupSplitwise | null;
}> {
  const group = await getGroupByIdAdmin(groupId);
  const splitwise = await getGroupSplitwiseByGroupId(groupId);
  return { group, splitwise };
}
