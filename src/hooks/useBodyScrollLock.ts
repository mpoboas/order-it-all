'use client';

import { useLayoutEffect } from 'react';

/**
 * Bloqueia o scroll da página enquanto `locked` for `true` — para modais
 * full-screen (`<Sheet>`, `ConfirmDialog`). `overflow: hidden` no `<body>`
 * sozinho **não chega no iOS Safari**: quando o teclado abre e foca um
 * campo dentro de um `position: fixed`, o WebKit continua a fazer scroll do
 * documento por baixo para "trazer o campo à vista", revelando o conteúdo
 * de trás e fazendo o próprio cabeçalho do sheet parecer deslizar para fora
 * — exatamente o bug reportado (a página só funciona bem no Android, que
 * respeita `overflow: hidden`). A técnica robusta e universalmente usada
 * (react-remove-scroll, body-scroll-lock, etc.) é fixar o `<body>` na
 * posição de scroll atual — impede fisicamente o WebKit de o mexer.
 *
 * `useLayoutEffect`, não `useEffect`: o `autoFocus` de um input dentro do
 * sheet foca — e o WebKit começa a decidir se tem de fazer scroll para
 * revelar o campo — antes de qualquer efeito passivo correr. Um
 * `useEffect` normal só bloqueia depois do browser já ter pintado, o que
 * deixava a janela exata onde a página inteira "salta" para trás na
 * primeira abertura de um sheet com campo em foco automático.
 */
export function useBodyScrollLock(locked: boolean): void {
  useLayoutEffect(() => {
    if (!locked) return;
    const scrollY = window.scrollY;
    const { style } = document.body;
    const prev = { position: style.position, top: style.top, left: style.left, right: style.right, width: style.width };

    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';

    return () => {
      style.position = prev.position;
      style.top = prev.top;
      style.left = prev.left;
      style.right = prev.right;
      style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
