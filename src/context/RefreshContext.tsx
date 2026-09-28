'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { useUser } from '@/context/UserContext';
import { fullResync } from '@/lib/db/sync';
import { useSyncStatus } from '@/context/SyncProvider';
import { finishesWithin, hardReset, isRunningStaleBuild } from '@/lib/appRecovery';

type RefreshHandler = () => void | Promise<void>;

interface RefreshContextValue {
    register: (handler: RefreshHandler) => () => void;
}

const RefreshContext = createContext<RefreshContextValue | null>(null);

/** Tempo minimo com o indicador visivel, para o gesto nao dar um flash. */
const MIN_VISIBLE_MS = 400;
/** Teto do pull-to-refresh — passado isto, recarrega a app. */
const REFRESH_TIMEOUT_MS = 8_000;
/** Intervalo minimo entre recargas automaticas, para nao martelar o servidor. */
const AUTO_REFRESH_THROTTLE_MS = 1500;

export function RefreshProvider({ children }: { children: React.ReactNode }) {
    const { isLoggedIn } = useUser();
    const { ready: syncReady } = useSyncStatus();
    const handlers = useRef(new Set<RefreshHandler>());
    const lastAutoRefresh = useRef(0);

    const register = useCallback((handler: RefreshHandler) => {
        handlers.current.add(handler);
        return () => {
            handlers.current.delete(handler);
        };
    }, []);

    const runAll = useCallback(async () => {
        await Promise.all([...handlers.current].map((handler) => handler()));
    }, []);

    // Pull-to-refresh = "põe tudo fresco" — e tem de resolver QUALQUER estado
    // preso no instante a seguir (o utilizador puxa exatamente quando algo não
    // está bem). Por ordem:
    //  1. o JS é de outro build que não o do servidor (service worker antigo a
    //     servir código velho) → limpa SW + caches e recarrega;
    //  2. o arranque do sync nunca terminou (lista presa em skeleton) →
    //     recarrega da rede;
    //  3. sync incremental com reconciliação + realtime (fullResync) e os
    //     handlers por-ecrã (ex. /split/[code]); se não terminar em 8 s,
    //     recarrega da rede em vez de deixar o indicador a rodar.
    const onRefresh = useCallback(async () => {
        // `hardReset` recarrega da rede sem service worker pelo meio — um
        // `reload()` simples voltava a receber a cópia velha do SW.
        if (await isRunningStaleBuild()) return hardReset();
        if (isLoggedIn && !syncReady) return hardReset();
        const [finished] = await Promise.all([
            finishesWithin(Promise.all([fullResync().catch(() => {}), runAll()]), REFRESH_TIMEOUT_MS),
            new Promise((resolve) => setTimeout(resolve, MIN_VISIBLE_MS)),
        ]);
        if (!finished) return hardReset();
    }, [runAll, isLoggedIn, syncReady]);

    const canRefresh = useCallback(
        () => isLoggedIn || handlers.current.size > 0,
        [isLoggedIn],
    );

    // A app volta ao primeiro plano (ou a rede volta): com o ecra bloqueado a
    // ligacao realtime do PocketBase cai, por isso recarrega-se o ecra atual.
    useEffect(() => {
        const autoRefresh = () => {
            const now = Date.now();
            if (now - lastAutoRefresh.current < AUTO_REFRESH_THROTTLE_MS) return;
            lastAutoRefresh.current = now;
            void runAll();
        };

        const onVisibility = () => {
            if (document.visibilityState === 'visible') autoRefresh();
        };

        // Restauro do bfcache (voltar atras no browser) conta como reabrir a app.
        const onPageShow = (e: PageTransitionEvent) => {
            if (e.persisted) autoRefresh();
        };

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('online', autoRefresh);
        window.addEventListener('pageshow', onPageShow);

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('online', autoRefresh);
            window.removeEventListener('pageshow', onPageShow);
        };
    }, [runAll]);

    const value = useMemo(() => ({ register }), [register]);

    return (
        <RefreshContext.Provider value={value}>
            {children}
            <PullToRefresh onRefresh={onRefresh} canRefresh={canRefresh} />
        </RefreshContext.Provider>
    );
}

/**
 * Regista o recarregamento do ecra atual. Corre no pull-to-refresh e sempre que a
 * app volta ao primeiro plano ou recupera rede. Varios podem estar registados ao
 * mesmo tempo (ex.: o layout do grupo e a pagina que esta dentro dele).
 */
export function useRefreshHandler(handler: RefreshHandler) {
    const ctx = useContext(RefreshContext);
    const latest = useRef(handler);

    useEffect(() => {
        latest.current = handler;
    }, [handler]);

    useEffect(() => {
        if (!ctx) return;
        return ctx.register(() => latest.current());
    }, [ctx]);
}
