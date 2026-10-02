import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

/**
 * As bancadas em `/dev/*` (primitivos, notificações) só existem em
 * desenvolvimento. O `notFound()` dentro das páginas (componentes de cliente)
 * não chega: no build de produção eram pré-renderizadas como estáticas e
 * respondiam 200. Este layout corre no servidor e corta tudo em produção.
 */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
