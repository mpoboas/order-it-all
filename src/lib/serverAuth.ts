import PocketBase from 'pocketbase';
import { NextResponse } from 'next/server';

/**
 * Autenticação das rotas de servidor (API routes + server actions). A sessão
 * do PocketBase vive no cliente (`pb.authStore`), por isso o cliente manda o
 * token em `Authorization` (ver `authHeaders()` em `src/lib/pocketbase.ts`) e
 * aqui confirma-se junto do PocketBase que é válido e de quem é — nunca
 * confiar num `userId` vindo do corpo do pedido.
 *
 * Nunca importar isto num componente de cliente.
 */

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top';

/** Formato dos ids do PocketBase — para validar ids vindos do cliente antes
 *  de os usar em filtros ou comparações. */
export const PB_ID_RE = /^[a-z0-9]{15}$/;

/** Id do utilizador dono do token, ou `null` se faltar/expirou/é inválido. */
export async function userIdFromToken(token: string | null | undefined): Promise<string | null> {
  const raw = token?.replace(/^Bearer\s+/i, '').trim();
  if (!raw) return null;

  // Cliente por pedido — o authStore nunca é partilhado entre utilizadores.
  const client = new PocketBase(PB_URL);
  client.autoCancellation(false);
  client.authStore.save(raw, null);
  // JWT expirado ou mal formado: rejeita sem ir à rede.
  if (!client.authStore.isValid) return null;

  try {
    const { record } = await client.collection('users').authRefresh();
    return record.id;
  } catch {
    return null;
  }
}

/** Id do utilizador autenticado no pedido (`Authorization: <token>`). */
export function requireUserId(request: Request): Promise<string | null> {
  return userIdFromToken(request.headers.get('authorization'));
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
