import PocketBase from 'pocketbase';
import type { Group, User } from '@/lib/types';

const pbUrl =
  process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function getRequestPb(
  request: Request
): Promise<{ pb: PocketBase; user: User }> {
  const header = request.headers.get('Authorization');
  const token = header?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new ApiAuthError('Não autenticado', 401);
  }

  const pb = new PocketBase(pbUrl);
  pb.authStore.save(token, null);
  try {
    await pb.collection('users').authRefresh();
  } catch {
    throw new ApiAuthError('Sessão inválida', 401);
  }

  const user = pb.authStore.model as User | null;
  if (!user?.id) {
    throw new ApiAuthError('Não autenticado', 401);
  }

  return { pb, user };
}

export async function requireGroupAdmin(
  request: Request,
  groupId: string
): Promise<{ pb: PocketBase; user: User; group: Group }> {
  const { pb, user } = await getRequestPb(request);
  const group = await pb.collection('groups').getOne<Group>(groupId);
  if (!group.admins?.includes(user.id)) {
    throw new ApiAuthError('Apenas administradores', 403);
  }
  return { pb, user, group };
}
