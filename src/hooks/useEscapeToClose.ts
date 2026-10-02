'use client';

import { useEffect, useRef } from 'react';

// Pilha partilhada de overlays abertos (sheets, diálogo de confirmação) — a
// ordem de abertura é a ordem visual. Só o de cima responde ao Escape: com
// "Saldos" + "Acertar contas" empilhadas, ou um `useConfirm()` por cima de uma
// sheet, um Escape fecha apenas o que está à frente.
const stack: symbol[] = [];

/** Fecha o overlay com Escape enquanto `active` — só se for o de cima. */
export function useEscapeToClose(active: boolean, onEscape: () => void) {
  const tokenRef = useRef<symbol | null>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  // Entra na pilha ao ficar ativo e sai ao fechar — num efeito separado do
  // listener, para mudar o `onEscape` não o mandar para o topo da pilha.
  useEffect(() => {
    if (!active) return;
    const token = Symbol('overlay');
    tokenRef.current = token;
    stack.push(token);
    return () => {
      const i = stack.lastIndexOf(token);
      if (i !== -1) stack.splice(i, 1);
      tokenRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (stack[stack.length - 1] !== tokenRef.current) return;
      e.preventDefault();
      onEscapeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
