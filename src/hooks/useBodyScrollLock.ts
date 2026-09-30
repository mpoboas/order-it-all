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
/**
 * Contador partilhado: vários modais podem estar abertos ao mesmo tempo (um
 * `ConfirmDialog` por cima de um `<Sheet>`) e fechar por qualquer ordem. Só o
 * primeiro bloqueio guarda o estado original do `<body>` e só o último a
 * sair o repõe. Antes, cada um guardava "o anterior": se o sheet fechasse
 * antes do diálogo, o diálogo repunha o `position: fixed` do sheet e a
 * página seguinte ficava sem scroll até recarregar.
 */
let locks = 0;
let saved: { scrollY: number; position: string; top: string; left: string; right: string; width: string } | null = null;

/** @internal (exportado para testes) */
export function lockBody() {
  locks += 1;
  if (locks > 1) return;
  const { style } = document.body;
  const scrollY = window.scrollY;
  saved = { scrollY, position: style.position, top: style.top, left: style.left, right: style.right, width: style.width };
  style.position = 'fixed';
  style.top = `-${scrollY}px`;
  style.left = '0';
  style.right = '0';
  style.width = '100%';
}

/** @internal (exportado para testes) */
export function unlockBody() {
  locks = Math.max(0, locks - 1);
  if (locks > 0 || !saved) return;
  const { style } = document.body;
  const { scrollY, ...prev } = saved;
  saved = null;
  style.position = prev.position;
  style.top = prev.top;
  style.left = prev.left;
  style.right = prev.right;
  style.width = prev.width;
  window.scrollTo(0, scrollY);
}

export function useBodyScrollLock(locked: boolean): void {
  useLayoutEffect(() => {
    if (!locked) return;
    lockBody();
    return unlockBody;
  }, [locked]);
}
