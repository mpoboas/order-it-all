'use client';

import { useEffect, useState } from 'react';
import { useOnline } from '@/hooks/useOnline';
import { checkConnectivity, lastSyncedAt } from '@/lib/connectivity';
import { relativeOrDatePhrase } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

/**
 * Faixa global "Sem ligação" (Fase 13 · Parte B). A app é online: sem rede
 * (ou com lie-fi) só se VÊ o que já estava guardado — escritas bloqueadas em
 * `pocketbase.ts`. A faixa diz isso sem ambiguidade e há quanto tempo os dados
 * foram atualizados. Ocupa o espaço extra do `--safe-top` (classe
 * `app-offline` no <html>, ver globals.css), por isso não tapa cabeçalhos.
 */
export function ConnectivityBanner() {
  const online = useOnline();
  const [, tick] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('app-offline', !online);
    if (online) return;
    // Atualiza o "há X minutos" enquanto a faixa estiver à vista.
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [online]);

  if (online) return null;

  const syncedAt = lastSyncedAt();
  const when = syncedAt ? relativeOrDatePhrase(new Date(syncedAt).toISOString()) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[120] bg-warning-bg text-warning-fg border-b border-hairline shadow-sm"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center gap-2 px-4 text-sm" style={{ height: 'var(--offline-banner-h)' }}>
        <Icon name="cloud_off" size={16} className="shrink-0" />
        <p className="flex-1 min-w-0 truncate">
          <span className="font-semibold">Sem ligação</span>
          {' · '}
          {when ? `a ver dados guardados ${when}` : 'a ver dados guardados'}
        </p>
        <button
          type="button"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            await checkConnectivity();
            setChecking(false);
          }}
          className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-60"
        >
          {checking ? 'A verificar…' : 'Tentar'}
        </button>
      </div>
    </div>
  );
}
