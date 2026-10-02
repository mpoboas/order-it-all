'use client';

import { useEffect } from 'react';

const SELECTOR = 'label[for^="web-haptics-"]';

function hide(label: Element) {
  if (label.getAttribute('aria-hidden') === 'true') return;
  label.setAttribute('aria-hidden', 'true');
  label.querySelectorAll('input').forEach((input) => {
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
  });
}

/**
 * Esconde dos leitores de ecrã (e do Tab) o `<label>Haptic feedback</label>` +
 * switch que o `web-haptics` cria por cada `useWebHaptics()`. O `globals.css`
 * obriga-o a `display: block` de propósito — é isso que faz o toque háptico
 * disparar no iOS — mas assim o VoiceOver lia "Haptic feedback, interruptor"
 * em todos os ecrãs. `aria-hidden`/`tabIndex=-1` só mexem na árvore de
 * acessibilidade; o `.click()` programático da biblioteca continua a funcionar.
 * As instâncias aparecem a qualquer momento (cada componente cria a sua), daí
 * o `MutationObserver`. Montado uma vez no layout.
 */
export function HapticsA11yGuard() {
  useEffect(() => {
    document.querySelectorAll(SELECTOR).forEach(hide);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(SELECTOR)) hide(node);
          node.querySelectorAll?.(SELECTOR).forEach(hide);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
