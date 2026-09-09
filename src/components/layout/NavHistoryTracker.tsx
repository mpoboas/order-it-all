'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { recordVisit } from '@/lib/navHierarchy';

/**
 * Regista cada rota visitada (módulo em `navHierarchy`). O botão "voltar" usa
 * isto para decidir entre `router.back()` (o histórico já bate certo com a
 * hierarquia — restaura scroll) e `router.push(pai)` (não bate — deep link,
 * refresh, navegação lateral).
 */
export function NavHistoryTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordVisit(pathname);
  }, [pathname]);
  return null;
}
