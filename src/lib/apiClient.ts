import { pb } from '@/lib/pocketbase';

export function getAuthHeaders(): HeadersInit {
  const token = pb.authStore.token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers as Record<string, string>),
    },
  });
}
