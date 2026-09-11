/**
 * Deteção de ligação lenta (Network Information API — Chromium/Edge; ausente no
 * Safari/Firefox, onde devolve sempre `false`).
 *
 * Usado para desligar o crossfade do View Transitions em 3G: o
 * `next-view-transitions` segura o screenshot do ecrã antigo até a rota nova
 * montar, e numa ligação lenta isso são segundos de ecrã congelado sem qualquer
 * indicação de progresso. Sem transição, o `loading.tsx` e a barra de topo
 * aparecem assim que a rede deixa.
 */

interface NetworkInformation {
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  saveData?: boolean;
}

function getConnection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

/** `true` em `save-data` ou `effectiveType` até 3G. */
export function isSlowConnection(): boolean {
  const c = getConnection();
  if (!c) return false;
  if (c.saveData) return true;
  return (
    c.effectiveType === 'slow-2g' ||
    c.effectiveType === '2g' ||
    c.effectiveType === '3g'
  );
}
