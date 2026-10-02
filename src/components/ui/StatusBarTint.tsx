'use client';

import { useId, useLayoutEffect } from 'react';

interface StatusBarTintProps {
    /** Qualquer valor válido de `background` CSS — cor sólida ou gradiente,
     *  a mesma coisa que está mesmo por baixo, para a faixa ficar contínua. */
    background: string;
    /** Cor SÓLIDA da barra de estado do iOS (o sistema lê um `background-color`,
     *  não um gradiente). Por omissão, `background` — passa-a sempre que
     *  `background` for um gradiente. */
    color?: string;
}

// Pilha de cores pedidas (ecrã + sheet em ecrã inteiro por cima, …): a barra
// de estado fica com a do último a montar e volta à anterior quando ele sai.
const stack: { id: string; color: string }[] = [];

function apply() {
    const top = stack[stack.length - 1];
    const root = document.documentElement.style;
    if (top) root.setProperty('--status-bar-color', top.color);
    else root.removeProperty('--status-bar-color');
}

/**
 * Cor da barra de estado do iPhone numa WPA instalada, a condizer com o topo
 * do ecrã atual. Duas partes:
 *
 * 1. **Cor da barra (iOS 26+)** — a app usa `apple-mobile-web-app-status-bar-
 *    style: default` (barra opaca; ver `layout.tsx`). O iOS ignora o
 *    `theme-color` e pinta a barra com o `background-color` de um elemento
 *    REAL fixo no topo da página: é o `.status-bar-color` (1px, em
 *    `layout.tsx`), que lê `--status-bar-color` — definido aqui, pelo tema da
 *    app (classe `.dark`), e não por `prefers-color-scheme`, que numa WPA fica
 *    congelado até a reabrir.
 *
 * 2. **Instalações antigas** (`black-translucent`, congelado no momento em que
 *    a app foi adicionada ao ecrã principal) — o iOS 27 desfoca o topo; esta
 *    `<div>` tapa a faixa com a mesma cor do ecrã (`.status-bar-tint` em
 *    `globals.css`). Com `default` a área segura do topo é 0 e ela não ocupa
 *    espaço nenhum.
 */
export function StatusBarTint({ background, color }: StatusBarTintProps) {
    const id = useId();
    const solid = color ?? background;

    useLayoutEffect(() => {
        stack.push({ id, color: solid });
        apply();
        return () => {
            const i = stack.findIndex((entry) => entry.id === id);
            if (i >= 0) stack.splice(i, 1);
            apply();
        };
    }, [id, solid]);

    return <div aria-hidden className="status-bar-tint" style={{ background }} />;
}
