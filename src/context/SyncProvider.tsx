'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useUser } from '@/context/UserContext';
import { db, clearAllData, metaGet } from '@/lib/db/schema';
import { clearLiveResultCache } from '@/lib/db/hooks';
import {
  backfillUsersFromCache,
  catchUp,
  hydrateGroups,
  resetSyncState,
  setActiveGroup,
  startRealtime,
  stopRealtime,
  syncStore,
} from '@/lib/db/sync';

interface SyncStatus {
  /** Primeira hidratação (lista de grupos) com a cache vazia. */
  hydrating: boolean;
  /** Já houve pelo menos uma sincronização bem-sucedida nesta sessão. */
  ready: boolean;
  /** Primeira sincronização dos dados do grupo aberto a decorrer. */
  groupSyncing: boolean;
  /** Regista qual o grupo aberto (chamado pelo layout do grupo). */
  setActiveGroup: (groupId: string | null) => void;
}

const SyncContext = createContext<SyncStatus>({
  hydrating: false,
  ready: false,
  groupSyncing: false,
  setActiveGroup: () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const userId: string | undefined = user?.id;
  const [status, setStatus] = useState({ hydrating: false, ready: false });
  const runId = useRef(0);

  const groupState = useSyncExternalStore(
    syncStore.subscribe,
    syncStore.getSnapshot,
    syncStore.getSnapshot,
  );

  useEffect(() => {
    const currentRun = ++runId.current;
    const cancelled = () => currentRun !== runId.current;

    if (!userId) {
      void stopRealtime();
      resetSyncState();
      clearLiveResultCache();
      Promise.resolve().then(() => {
        if (!cancelled()) setStatus({ hydrating: false, ready: false });
      });
      return;
    }

    // Arranque: hidrata (1.ª vez) ou apanha o que mudou, e liga o realtime.
    // Se falhar (típico ao abrir a WPA no Android com a rede ainda a acordar),
    // volta a tentar sozinho — antes ficava `ready: false` até recarregar a
    // página, e nem o pull-to-refresh desbloqueava a lista vazia.
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const retryListeners: Array<[EventTarget, string]> = [
      [window, 'online'],
      [window, 'app:online'],
      [document, 'visibilitychange'],
    ];
    const clearRetry = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      for (const [target, type] of retryListeners) target.removeEventListener(type, onRetrySignal);
    };
    function onRetrySignal() {
      if (document.visibilityState !== 'visible' || cancelled()) return;
      clearRetry();
      void boot();
    }
    const scheduleRetry = () => {
      clearRetry();
      retryTimer = setTimeout(onRetrySignal, 5000);
      for (const [target, type] of retryListeners) target.addEventListener(type, onRetrySignal);
    };

    const boot = async () => {
      try {
        const cachedUser = await metaGet('session:userId');
        if (cachedUser && cachedUser !== userId) {
          await clearAllData();
          resetSyncState();
          clearLiveResultCache();
        }

        const coldStart = (await db.groups.count()) === 0;
        if (coldStart) {
          setStatus({ hydrating: true, ready: false });
          await hydrateGroups(userId);
        } else {
          await backfillUsersFromCache();
          void catchUp();
        }

        if (cancelled()) return;
        setStatus({ hydrating: false, ready: true });
        await startRealtime();
      } catch (err) {
        console.error('[sync] hydration failed', err);
        if (cancelled()) return;
        setStatus({ hydrating: false, ready: false });
        scheduleRetry();
      }
    };
    void boot();
    return clearRetry;
  }, [userId]);

  // Sinais que disparam catch-up (grupos + grupo ativo).
  useEffect(() => {
    if (!userId) return;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void catchUp();
    };
    const onOnline = () =>
      void catchUp({ reconcileDeletes: true, fullGroups: true });

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    // Recuperação de lie-fi (o browser nunca disse offline) — ver connectivity.ts.
    window.addEventListener('app:online', onOnline);

    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void catchUp({ reconcileDeletes: true });
      }
    }, 5 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('app:online', onOnline);
      clearInterval(heartbeat);
    };
  }, [userId]);

  const value: SyncStatus = {
    hydrating: status.hydrating,
    ready: status.ready,
    groupSyncing: groupState.groupSyncing,
    setActiveGroup,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncStatus(): SyncStatus {
  return useContext(SyncContext);
}
