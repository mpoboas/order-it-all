'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useUser } from '@/context/UserContext';
import { db, clearAllData, metaGet } from '@/lib/db/schema';
import {
  backfillUsersFromCache,
  catchUp,
  hydrateAll,
  startRealtime,
  stopRealtime,
} from '@/lib/db/sync';

interface SyncStatus {
  /** Primeira hidratação a decorrer com a cache ainda vazia (cold start real). */
  hydrating: boolean;
  /** Já houve pelo menos uma sincronização bem-sucedida nesta sessão. */
  ready: boolean;
}

const SyncContext = createContext<SyncStatus>({ hydrating: false, ready: false });

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const userId: string | undefined = user?.id;
  const [status, setStatus] = useState<SyncStatus>({
    hydrating: false,
    ready: false,
  });
  const runId = useRef(0);

  useEffect(() => {
    const currentRun = ++runId.current;
    const cancelled = () => currentRun !== runId.current;

    if (!userId) {
      stopRealtime();
      // Reset fora do corpo síncrono do efeito (regra react-hooks/set-state-in-effect).
      Promise.resolve().then(() => {
        if (!cancelled()) setStatus({ hydrating: false, ready: false });
      });
      return;
    }

    (async () => {
      try {
        // Troca de utilizador no mesmo browser → deita fora a cache anterior.
        const cachedUser = await metaGet('session:userId');
        if (cachedUser && cachedUser !== userId) {
          await clearAllData();
        }

        const groupCount = await db.groups.count();
        const coldStart = groupCount === 0;

        if (coldStart) {
          setStatus({ hydrating: true, ready: false });
          await hydrateAll(userId);
        } else {
          // Garante que a tabela `users` reflete pelo menos o `expand` em cache
          // (cobre clientes migrados de v1). Barato e idempotente.
          await backfillUsersFromCache();
          // Revisita: mostra já o que está em cache e apanha o atraso em fundo.
          void catchUp();
        }

        if (cancelled()) return;
        setStatus({ hydrating: false, ready: true });
        await startRealtime();
      } catch (err) {
        console.error('[sync] hydration failed', err);
        if (!cancelled()) setStatus({ hydrating: false, ready: false });
      }
    })();

    return () => {
      // Não paramos o realtime aqui — só na troca/saída de utilizador — para não
      // o derrubar a cada re-render do provider.
    };
  }, [userId]);

  // Sinais que disparam catch-up:
  //  - voltar ao primeiro plano: incremental leve (a ligação pode estar viva).
  //  - recuperar rede: incremental + reconciliação (equivale a uma reconexão).
  //  - heartbeat lento em foreground: apanha hard-deletes.
  //  (A reconexão do realtime em si é tratada pelo `PB_CONNECT` em startRealtime.)
  useEffect(() => {
    if (!userId) return;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void catchUp();
    };
    const onOnline = () =>
      void catchUp({ reconcileDeletes: true, refreshUsers: true });

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void catchUp({ reconcileDeletes: true });
      }
    }, 5 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      clearInterval(heartbeat);
    };
  }, [userId]);

  return <SyncContext.Provider value={status}>{children}</SyncContext.Provider>;
}

export function useSyncStatus(): SyncStatus {
  return useContext(SyncContext);
}
