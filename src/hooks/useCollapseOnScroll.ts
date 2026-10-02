'use client';

import { useEffect, useRef, useState } from 'react';

const DIRECTION_THRESHOLD = 5; // px de tolerância — ignora jitter (rebound do scroll no iOS, etc.)
const TOP_THRESHOLD = 24; // perto do topo fica sempre expandido, mesmo com um scroll down mínimo

/** `true` enquanto o utilizador está a fazer scroll down, `false` assim que
 *  inverte para scroll up — em vez de depender só da posição (que colapsava
 *  e ficava colapsado o resto da página). Perto do topo força sempre
 *  expandido, para o ecrã não abrir já colapsado antes de haver scroll. */
export function useCollapseOnScroll(): boolean {
    const [collapsed, setCollapsed] = useState(false);
    const lastY = useRef(0);

    useEffect(() => {
        lastY.current = window.scrollY;
        const onScroll = () => {
            const y = window.scrollY;
            const delta = y - lastY.current;
            if (y <= TOP_THRESHOLD) {
                setCollapsed(false);
            } else if (delta > DIRECTION_THRESHOLD) {
                setCollapsed(true);
            } else if (delta < -DIRECTION_THRESHOLD) {
                setCollapsed(false);
            }
            lastY.current = y;
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return collapsed;
}
