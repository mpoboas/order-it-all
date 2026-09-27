'use client';

/**
 * View Transitions das navegações — substitui a lógica de "fim de transição"
 * do `next-view-transitions` (Fase 15).
 *
 * O problema: a biblioteca terminava a transição assim que a rota nova
 * MONTAVA. Com os dados a vir do IndexedDB (assíncrono, sobretudo lento no
 * iPhone), nesse instante o ecrã novo ainda estava em skeleton/spinner — o
 * browser tirava o "snapshot novo" desse estado, animava-o, e o conteúdo real
 * aparecia de repente no fim (o "flash"). Aqui a transição só termina quando o
 * ecrã novo está PRONTO: rota já montada e sem marcadores de carregamento,
 * com um teto para nunca congelar o ecrã mais do que `MAX_WAIT_MS`.
 */

/** O que conta como "ainda a carregar" — skeletons (`.animate-pulse`) e
 *  spinners (`.animate-spin`). Um `animate-pulse` puramente decorativo (ex.:
 *  aviso a piscar) marca-se com `data-decorative` para não contar. */
const LOADING_SELECTOR = '.animate-pulse:not([data-decorative]), .animate-spin';

/** Teto de espera pelo ecrã novo. Até lá mantém-se o snapshot do ecrã antigo
 *  (congelado); passado isto anima-se de qualquer forma, com o que houver. */
const MAX_WAIT_MS = 450;

/** Caminho que o React já montou (atualizado por `RouteTransitions` num
 *  layout effect quando o `pathname` muda). No `popstate` o `location` muda
 *  ANTES de o React montar a rota — é isto que diz quando o DOM já é o novo. */
let committedPath: string | null = null;

export function setCommittedPath(path: string): void {
  committedPath = normalizePath(path);
}

/** A rota `path` ainda não foi montada pelo React? */
export function isPendingPath(path: string): boolean {
  return committedPath !== null && committedPath !== normalizePath(path);
}

function normalizePath(path: string): string {
  const clean = path.split(/[?#]/)[0];
  return clean.length > 1 ? clean.replace(/\/$/, '') : clean;
}

/** `targetPath` — destino de um `push`/`replace`: sem isto, antes de a
 *  navegação arrancar o URL e a rota montada ainda são os ANTIGOS e batem
 *  certo entre si, e a espera dava-se por "pronta" com o ecrã anterior (o
 *  snapshot novo era o ecrã antigo — o flash). */
function isSettled(targetPath?: string): boolean {
  const current = normalizePath(window.location.pathname);
  if (targetPath && current !== targetPath) return false;
  if (committedPath !== current) return false;
  return document.querySelector(LOADING_SELECTOR) === null;
}

/** Resolve quando a rota nova está montada e sem loading (2 verificações
 *  seguidas, para não apanhar um estado intermédio), ou ao fim de `maxMs`.
 *  `setTimeout`, NÃO `requestAnimationFrame`: durante a View Transition o
 *  browser suspende o rendering até este callback resolver, e o rAF não corre
 *  — a espera ficava parada até o browser a abortar (4 s no Chrome). O React
 *  continua a montar o DOM, só não é pintado. */
export function waitForRouteSettled(targetHref?: string, maxMs = MAX_WAIT_MS): Promise<void> {
  const targetPath = targetHref ? normalizePath(new URL(targetHref, window.location.href).pathname) : undefined;
  return new Promise((resolve) => {
    const start = performance.now();
    let settledChecks = 0;
    const tick = () => {
      settledChecks = isSettled(targetPath) ? settledChecks + 1 : 0;
      if (settledChecks >= 2 || performance.now() - start >= maxMs) resolve();
      else setTimeout(tick, 16);
    };
    setTimeout(tick, 16);
  });
}

export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document;
}

type StartViewTransition = (update: () => Promise<void>) => { finished: Promise<void> };

/** Corre `navigate()` dentro de uma View Transition que só termina quando o
 *  ecrã novo está pronto. `onFinished` limpa a direção marcada (ver
 *  `navTransition.ts`). Sem suporte, navega logo. */
export function navigateWithTransition(href: string, navigate: () => void, onFinished?: () => void): void {
  if (!supportsViewTransitions()) {
    navigate();
    return;
  }
  const start = (document as Document & { startViewTransition: StartViewTransition }).startViewTransition.bind(document);
  const transition = start(async () => {
    navigate();
    await waitForRouteSettled(href);
  });
  transition.finished.finally(() => onFinished?.());
}

// --- Gesto de voltar do iOS --------------------------------------------------
// No Safari do iPhone, deslizar da borda esquerda já anima a página anterior
// (nativamente). Se a nossa View Transition corresse também no `popstate` que
// vem a seguir, o ecrã anterior reaparecia por instantes e voltava a deslizar
// — o "flash do ecrã anterior". Um toque que começa rente à borda, pouco
// antes do `popstate`, é esse gesto: aí não se anima.

const EDGE_PX = 24;
const EDGE_GESTURE_WINDOW_MS = 1000;
let lastEdgeTouch = 0;

export function trackEdgeSwipes(): () => void {
  const onTouchStart = (e: TouchEvent) => {
    const x = e.touches[0]?.clientX ?? EDGE_PX + 1;
    if (x <= EDGE_PX || x >= window.innerWidth - EDGE_PX) lastEdgeTouch = Date.now();
  };
  window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  return () => window.removeEventListener('touchstart', onTouchStart, { capture: true });
}

export function isNativeSwipeNavigation(): boolean {
  return Date.now() - lastEdgeTouch < EDGE_GESTURE_WINDOW_MS;
}
