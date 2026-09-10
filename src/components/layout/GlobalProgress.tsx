'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { navProgressStore, navStart, navDone } from '@/lib/navProgress';

/**
 * Feedback visual global (Fase 6): **barra de progresso** no topo enquanto uma
 * navegação está em curso. A lógica de timing vive no módulo-store
 * (`navProgress.ts`); monta-se uma vez no root layout.
 *
 * Nota: as escritas optimistas (Fases 1–3) não têm indicador — o resultado
 * aparece já no ecrã e isso é a confirmação; só os *erros* são mostrados
 * (toast + revert). Ver `PLANONATIVEFEEL.md` › Fase 6.
 */
export function GlobalProgress() {
  return <NavProgressBar />;
}

function NavProgressBar() {
  const { phase } = useSyncExternalStore(
    navProgressStore.subscribe,
    navProgressStore.getSnapshot,
    navProgressStore.getServerSnapshot,
  );
  const pathname = usePathname();

  // A navegação assentou quando o pathname muda.
  useEffect(() => {
    navDone();
  }, [pathname]);

  // A navegação primária (cards, bottom-nav, header, botão "voltar") passa toda
  // pelo `useAppNavigate`, que chama `navStart()`. Aqui cobrimos o resto:
  // back/forward (`popstate`) e quaisquer `<a>`/`<Link>` avulsos. O atraso de
  // `navStart` garante que navegações a quente não piscam a barra.
  useEffect(() => {
    const onPop = () => navStart();
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest('a[href]');
      if (!anchor || anchor.getAttribute('target') === '_blank') return;
      const href = anchor.getAttribute('href') || '';
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        return;
      }
      if (href.startsWith('http') && !href.startsWith(window.location.origin)) return;
      const dest = href.startsWith('http')
        ? new URL(href).pathname
        : href.split('?')[0].split('#')[0];
      if (dest === window.location.pathname) return;
      navStart();
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  if (phase === 'idle') return null;

  return (
    <div className="nav-progress-track" aria-hidden>
      <div className={`nav-progress-bar nav-progress-bar--${phase}`} />
    </div>
  );
}
