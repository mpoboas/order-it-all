'use client';

import { useSyncExternalStore } from 'react';
import { isAppOffline, subscribeConnectivity } from '@/lib/connectivity';

/**
 * `true` se a app tem ligação. Não é só `navigator.onLine`: um pedido ao PB
 * que falhe por rede também conta como offline até um health check passar
 * (lie-fi — ver `src/lib/connectivity.ts`). SSR assume online.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeConnectivity,
    () => !isAppOffline(),
    () => true,
  );
}
