'use client';

import { useEffect } from 'react';

const GUARD_KEY = 'oia-chunk-reload';
const GUARD_MS = 30_000;

/** Um pedaço de JS/CSS da app que não carregou — o ecrã ficava parado num
 *  skeleton/spinner para sempre. Acontece logo a seguir a um build novo: a
 *  página em memória (ou a cópia guardada pelo service worker) ainda é do
 *  build anterior e pede ficheiros que o servidor já não tem. */
function isChunkFailure(reason: unknown): boolean {
    const err = reason as { name?: string; message?: string } | null;
    const text = `${err?.name ?? ''} ${err?.message ?? String(reason ?? '')}`;
    return /ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text);
}

/**
 * Recupera sozinho de um `ChunkLoadError`: recarrega a página (o HTML novo
 * traz os ficheiros certos), uma vez por 30 s para nunca entrar em ciclo.
 * Montado uma vez, no layout raiz.
 */
export function ChunkErrorRecovery() {
    useEffect(() => {
        const recover = () => {
            // Sem rede, recarregar não traz nada de novo (e a cópia offline
            // do service worker já é a que está aberta).
            if (!navigator.onLine) return;
            try {
                const last = Number(sessionStorage.getItem(GUARD_KEY)) || 0;
                if (Date.now() - last < GUARD_MS) return;
                sessionStorage.setItem(GUARD_KEY, String(Date.now()));
            } catch {
                // sem sessionStorage: recarrega na mesma (uma vez por página)
            }
            window.location.reload();
        };

        const onRejection = (e: PromiseRejectionEvent) => {
            if (isChunkFailure(e.reason)) recover();
        };
        const onError = (e: ErrorEvent | Event) => {
            // Erro de script da app (<script src=/_next/static/…> que falhou).
            const target = e.target as HTMLElement | null;
            // Só scripts: um `<link rel=prefetch>` falhado não parte nada.
            const src = target instanceof HTMLScriptElement ? target.src : '';
            if (src.includes('/_next/static/') || ('error' in e && isChunkFailure(e.error))) recover();
        };

        window.addEventListener('unhandledrejection', onRejection);
        window.addEventListener('error', onError, true);
        return () => {
            window.removeEventListener('unhandledrejection', onRejection);
            window.removeEventListener('error', onError, true);
        };
    }, []);

    return null;
}
