'use client';

// Estado de rede único da app (Fase 13 · Parte B). "Offline" quando:
//   - o browser diz que está offline (`navigator.onLine === false`), OU
//   - um pedido ao PocketBase falhou por rede (lie-fi: o telemóvel diz que tem
//     rede mas nada passa — Wi-Fi sem internet, 1 barra de 3G…).
// Uma falha de rede só se desfaz com um health check ao PB que responda; até
// lá a app fica em modo só-leitura (faixa "Sem ligação", escritas bloqueadas
// em `pocketbase.ts`). Nunca há fila de escritas: o que falha, falha à vista.

const PB_URL = (process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb-orderit.povoas.top').replace(/\/$/, '');
const HEALTH_TIMEOUT_MS = 4000;
const BACKOFF_MS = [3000, 5000, 10000, 20000, 30000];

type Listener = () => void;

/** Escrita recusada por falta de rede — a app não tem fila de escritas. */
export class OfflineError extends Error {
  constructor(message = 'Sem ligação à internet') {
    super(message);
    this.name = 'OfflineError';
  }
}

let browserOffline = typeof navigator !== 'undefined' ? navigator.onLine === false : false;
let requestFailed = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let checking = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

/** `true` se a app deve comportar-se como offline (só leitura). */
export function isAppOffline(): boolean {
  return browserOffline || requestFailed;
}

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function scheduleHealthCheck() {
  if (retryTimer || typeof window === 'undefined') return;
  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void checkConnectivity();
  }, delay);
}

/**
 * Pergunta ao PB se está alcançável. Sucesso → sai do modo offline (e avisa o
 * sync para apanhar o que perdeu); falha → volta a tentar com backoff.
 * Devolve `true` se há ligação.
 */
export async function checkConnectivity(): Promise<boolean> {
  if (checking) return !isAppOffline();
  checking = true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${PB_URL}/api/health`, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`health ${res.status}`);
    reportNetworkSuccess();
    return true;
  } catch {
    attempt += 1;
    if (requestFailed || browserOffline) scheduleHealthCheck();
    return false;
  } finally {
    checking = false;
  }
}

/** Um pedido ao PB falhou por rede (não por 4xx/5xx nem por cancelamento). */
export function reportNetworkFailure(): void {
  if (!requestFailed) {
    requestFailed = true;
    attempt = 0;
    emit();
  }
  scheduleHealthCheck();
}

/** O PB respondeu (a qualquer coisa) — há rede. */
export function reportNetworkSuccess(): void {
  if (!requestFailed) return;
  requestFailed = false;
  attempt = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  emit();
  // O `online` do browser não dispara quando se recupera de lie-fi — o sync
  // (SyncProvider) ouve também este evento para apanhar o que perdeu.
  if (!browserOffline && typeof window !== 'undefined') window.dispatchEvent(new Event('app:online'));
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    browserOffline = true;
    emit();
  });
  window.addEventListener('online', () => {
    browserOffline = false;
    emit();
    // O browser diz que voltou — confirmar que o PB responde mesmo.
    if (requestFailed) void checkConnectivity();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && requestFailed) void checkConnectivity();
  });
}

/** Carimbo local da última sincronização bem-sucedida (para a faixa offline). */
const LAST_SYNC_KEY = 'oia:lastSyncAt';

export function markSynced(): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  } catch {
    /* modo privado / storage bloqueado — a faixa só não mostra a hora */
  }
}

export function lastSyncedAt(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_SYNC_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
