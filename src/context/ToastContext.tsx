'use client';

import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    toasts: Toast[];
    showToast: (message: string, type?: ToastType) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Toasts são o canal *raro* de feedback — reservados para: erros, validações, e
 * resultados que **não se veem no ecrã** (link copiado, item eliminado). As
 * mutações optimistas cuja mudança aparece já não levam toast nenhum (ver
 * `PLANONATIVEFEEL.md` › Fase 6). Por isso este provider é conservador:
 * - **dedupe**: a mesma mensagem não empilha — reinicia o timer da existente;
 * - **teto**: no máximo `MAX_TOASTS` em simultâneo (cai o mais antigo);
 * - **duração por tipo**: erros ficam mais tempo do que sucessos.
 */
const MAX_TOASTS = 2;
const DURATION: Record<ToastType, number> = {
    success: 3500,
    info: 3500,
    error: 6000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const removeToast = useCallback((id: string) => {
        const t = timers.current.get(id);
        if (t) {
            clearTimeout(t);
            timers.current.delete(id);
        }
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const scheduleRemoval = useCallback(
        (id: string, ms: number) => {
            const existing = timers.current.get(id);
            if (existing) clearTimeout(existing);
            timers.current.set(
                id,
                setTimeout(() => removeToast(id), ms),
            );
        },
        [removeToast],
    );

    const showToast = useCallback(
        (message: string, type: ToastType = 'info') => {
            const ms = DURATION[type];

            setToasts((prev) => {
                // Dedupe: mensagem idêntica já visível → só renova o timer.
                const dupe = prev.find((t) => t.message === message && t.type === type);
                if (dupe) {
                    scheduleRemoval(dupe.id, ms);
                    return prev;
                }

                const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                scheduleRemoval(id, ms);

                const next = [...prev, { id, message, type }];
                // Teto: descarta os mais antigos que excedam o limite.
                while (next.length > MAX_TOASTS) {
                    const dropped = next.shift();
                    if (dropped) {
                        const dt = timers.current.get(dropped.id);
                        if (dt) {
                            clearTimeout(dt);
                            timers.current.delete(dropped.id);
                        }
                    }
                }
                return next;
            });
        },
        [scheduleRemoval],
    );

    return (
        <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
