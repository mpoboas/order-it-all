'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Distancia (px) a partir da qual largar o dedo dispara o refresh. */
const THRESHOLD = 72;
/** Distancia maxima que o indicador percorre. */
const MAX_PULL = 96;
/** Onde o indicador assenta enquanto atualiza, a contar da base da top bar. */
const REST_OFFSET = 24;
/** Travao aplicado ao arrasto, para o gesto ter peso. */
const RESISTANCE = 0.5;

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    /** Chamado no inicio do gesto: se devolver false, o gesto e ignorado. */
    canRefresh: () => boolean;
}

/**
 * Pull-to-refresh da app. O overscroll nativo esta bloqueado em globals.css
 * (senao o rubber-band do iOS expunha o fundo do documento em faixas no topo e
 * no fundo), por isso o gesto e feito aqui.
 */
export function PullToRefresh({ onRefresh, canRefresh }: PullToRefreshProps) {
    const [pull, setPull] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [dragging, setDragging] = useState(false);
    /** Base do indicador: o fundo da top bar do ecra, medido no inicio do gesto. */
    const [baseTop, setBaseTop] = useState(0);

    const startY = useRef<number | null>(null);
    const pullRef = useRef(0);
    const busy = useRef(false);
    const latest = useRef({ onRefresh, canRefresh });

    useEffect(() => {
        latest.current = { onRefresh, canRefresh };
    }, [onRefresh, canRefresh]);

    const setPullValue = useCallback((value: number) => {
        pullRef.current = value;
        setPull(value);
    }, []);

    useEffect(() => {
        const atTop = () =>
            !busy.current &&
            window.scrollY <= 0 &&
            // Um sheet aberto trava o scroll do body; nesse caso o gesto e dele.
            document.body.style.overflow !== 'hidden' &&
            latest.current.canRefresh();

        /** Ignora o gesto se comecou dentro de uma area com scroll proprio ja rolada. */
        const insideScrolledArea = (target: EventTarget | null) => {
            let node = target instanceof Element ? target : null;
            while (node && node !== document.body) {
                if (node.scrollTop > 0) return true;
                node = node.parentElement;
            }
            return false;
        };

        /**
         * O indicador sai de baixo da top bar. A altura do header varia com o
         * ecra (e com a safe area), por isso mede-se em vez de se assumir; nos
         * ecras sem header cai para a safe area.
         */
        const topBarBottom = () => {
            const header = document.querySelector('header');
            if (!header) return 0;
            return Math.max(0, header.getBoundingClientRect().bottom);
        };

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length !== 1 || !atTop() || insideScrolledArea(e.target)) {
                startY.current = null;
                return;
            }
            startY.current = e.touches[0].clientY;
            setBaseTop(topBarBottom());
            setDragging(true);
        };

        const onTouchMove = (e: TouchEvent) => {
            if (startY.current === null) return;

            const dy = e.touches[0].clientY - startY.current;
            if (dy <= 0 || window.scrollY > 0) {
                if (pullRef.current !== 0) setPullValue(0);
                return;
            }
            setPullValue(Math.min(MAX_PULL, dy * RESISTANCE));
        };

        const onTouchEnd = () => {
            if (startY.current === null) return;
            startY.current = null;
            setDragging(false);

            if (pullRef.current < THRESHOLD) {
                setPullValue(0);
                return;
            }

            busy.current = true;
            setRefreshing(true);
            setPullValue(REST_OFFSET);

            void latest.current
                .onRefresh()
                .catch(() => {
                    // O ecra ja trata (e mostra) os seus proprios erros de carregamento.
                })
                .finally(() => {
                    busy.current = false;
                    setRefreshing(false);
                    setPullValue(0);
                });
        };

        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd, { passive: true });
        window.addEventListener('touchcancel', onTouchEnd, { passive: true });

        return () => {
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
            window.removeEventListener('touchcancel', onTouchEnd);
        };
    }, [setPullValue]);

    const visible = pull > 0 || refreshing;
    const progress = Math.min(1, pull / THRESHOLD);

    return (
        <div
            role="status"
            aria-hidden={!visible}
            aria-label={refreshing ? 'A atualizar' : undefined}
            className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center"
            style={{
                top: baseTop > 0 ? `${baseTop}px` : 'var(--safe-top)',
                transform: `translateY(${pull}px)`,
                opacity: visible ? 1 : 0,
                // Enquanto o dedo esta no ecra o indicador segue-o sem atraso.
                transition: dragging
                    ? 'opacity 150ms ease-out'
                    : 'transform 250ms ease-out, opacity 250ms ease-out',
            }}
        >
            <div className="mt-3 flex h-11 w-11 items-center justify-center rounded-full border border-black/5 bg-surface shadow-lg dark:border-white/10">
                <svg
                    className={cn('h-5 w-5 text-primary-600 dark:text-primary-300', refreshing && 'animate-spin')}
                    style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                </svg>
            </div>
        </div>
    );
}
