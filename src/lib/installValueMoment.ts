import { pb } from '@/lib/pocketbase';

/**
 * Fase 4 do onboarding: só faz sentido pedir para instalar a app depois de
 * uma ação que já mostrou valor — primeiro pedido feito (membro), ou
 * primeiro grupo/viagem criado (admin) — nunca ao calhar da primeira
 * visita. Por utilizador, não por grupo: uma vez atingido, fica para
 * sempre (mesmo que esse grupo/viagem seja depois apagado).
 */
function storageKey(): string | null {
  const userId = pb.authStore.model?.id;
  return userId ? `install-value-moment:${userId}` : null;
}

export function markInstallValueMoment(): void {
  const key = storageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

export function hasReachedInstallValueMoment(): boolean {
  const key = storageKey();
  if (!key) return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
