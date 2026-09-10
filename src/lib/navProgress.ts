/**
 * Barra de progresso de navegação (topo da página). O App Router do Next removeu
 * os router events → o "start" vem do `useAppNavigate` / de um clique num `<a>` /
 * de `popstate`, e o "fim" da mudança de `pathname`. Só aparece se a navegação
 * demorar mais de `DELAY_MS` — as navegações a quente (Fase 4: View Transitions
 * + prefetch) são instantâneas e não a piscam.
 *
 * Toda a máquina de estados (delay, animação, fade) vive aqui — o componente só
 * lê `phase` via `useSyncExternalStore`.
 */

const DELAY_MS = 250;
const MAX_MS = 12_000;
const FADE_MS = 450;

export type NavPhase = 'idle' | 'loading' | 'done';

let phase: NavPhase = 'idle';
let snapshot: { phase: NavPhase } = { phase: 'idle' };
const timers = new Set<ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function setPhase(next: NavPhase) {
  if (phase === next) return;
  phase = next;
  snapshot = { phase: next };
  listeners.forEach((l) => l());
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers.clear();
}

function after(ms: number, fn: () => void) {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}

/** Uma navegação começou. */
export function navStart() {
  clearTimers();
  if (phase === 'done') setPhase('idle');
  after(DELAY_MS, () => {
    setPhase('loading');
    after(MAX_MS, () => navDone());
  });
}

/** A navegação assentou (o `pathname` mudou) — ou nunca chegou a começar. */
export function navDone() {
  clearTimers();
  if (phase === 'loading') {
    setPhase('done');
    after(FADE_MS, () => setPhase('idle'));
  } else {
    setPhase('idle');
  }
}

export const navProgressStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => snapshot,
};
