'use client';

/**
 * Direção da próxima View Transition de navegação (Fase 9 — navegação estilo
 * iOS). Só precisa de estar presente no `<html data-nav-transition="…">` no
 * instante em que a View Transition arranca (ver as regras
 * `html[data-nav-transition="…"]::view-transition-*(root)` em `globals.css`)
 * — por isso limpa-se sozinha a seguir, sem precisar de um "fim de transição"
 * explícito. Sem atributo = comportamento antigo (crossfade), usado pelas
 * trocas de tab (`GlobalBottomNav`/`GroupTabs`, que passam `transition: 'none'`
 * a `useAppNavigate`).
 */

const RESET_DELAY_MS = 500;
let resetTimer: ReturnType<typeof setTimeout> | null = null;

export function markNavDirection(direction: 'forward' | 'back'): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.navTransition = direction;
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    delete document.documentElement.dataset.navTransition;
    resetTimer = null;
  }, RESET_DELAY_MS);
}
