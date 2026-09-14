'use client';

import { useEffect, useState } from 'react';

interface VisualViewportState {
  /** Altura realmente visível em px — encolhe quando o teclado abre. */
  height: number;
  /** Deslocamento do topo do visual viewport face ao layout viewport (o
   *  iOS por vezes desloca a página para manter o campo focado visível). */
  offsetTop: number;
}

/**
 * `window.visualViewport` — ao contrário de `100dvh`/`100vh`, encolhe
 * mesmo quando o teclado do telemóvel abre, em Android **e** iOS (o
 * `interactive-widget=resizes-content` do viewport meta só tem efeito no
 * Chrome/Android; isto funciona nos dois). Usado para o `<Sheet>` (Fase 9 —
 * ecrãs inteiros) nunca esconder o rodapé/botão "Guardar" atrás do teclado.
 * `undefined` até ao primeiro `resize` (SSR e antes de montar) — os
 * chamadores devem ter um fallback CSS (`100dvh`) para esse intervalo.
 */
export function useVisualViewport(): VisualViewportState | undefined {
  const [state, setState] = useState<VisualViewportState>();

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setState({ height: vv.height, offsetTop: vv.offsetTop });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return state;
}
