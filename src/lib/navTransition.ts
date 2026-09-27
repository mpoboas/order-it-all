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

/** Rede de segurança — normalmente limpa-se no fim da transição
 *  (`clearNavDirection`), que agora pode esperar pelo ecrã novo até ~450 ms
 *  antes de animar; um timer curto apagava a direção antes de a animação
 *  arrancar (ficava crossfade). */
const RESET_DELAY_MS = 2000;
let resetTimer: ReturnType<typeof setTimeout> | null = null;

export function markNavDirection(direction: 'forward' | 'back' | 'tab'): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.navTransition = direction;
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(clearNavDirection, RESET_DELAY_MS);
}

export function clearNavDirection(): void {
  if (typeof document === 'undefined') return;
  delete document.documentElement.dataset.navTransition;
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = null;
}
