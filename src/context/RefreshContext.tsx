'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { PullToRefresh } from '@/components/ui/PullToRefresh';

type RefreshHandler = () => void | Promise<void>;

interface RefreshContextValue {
    register: (handler: RefreshHandler) => () => void;
}

const RefreshContext = createContext<RefreshContextValue | null>(null);

/** Tempo minimo com o indicador visivel, para o gesto nao dar um flash. */
const MIN_VISIBLE_MS = 400;
/** Intervalo minimo entre recargas automaticas, para nao martelar o servidor. */
const AUTO_REFRESH_THROTTLE_MS = 1500;

export function RefreshProvider({ children }: { children: React.ReactNode }) {
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

    const onRefresh = useCallback(async () => {
        await Promise.all([
            runAll(),
            new Promise((resolve) => setTimeout(resolve, MIN_VISIBLE_MS)),
        ]);
    }, [runAll]);

    const canRefresh = useCallback(() => handlers.current.size > 0, []);

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
