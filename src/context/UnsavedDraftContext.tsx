'use client';

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { UNSAVED_DRAFT_MESSAGE } from '@/lib/confirmDiscard';
import { useConfirm } from '@/context/ConfirmContext';

export type UnsavedDraftGuard = {
    message: string;
    onDiscard: () => void;
};

type UnsavedDraftContextValue = {
    tryNavigate: (navigate: () => void) => void;
};

const UnsavedDraftContext = createContext<UnsavedDraftContextValue | undefined>(undefined);

const UnsavedDraftRegisterContext = createContext<
    { registerGuard: (guard: UnsavedDraftGuard | null) => void } | undefined
>(undefined);

export function UnsavedDraftProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [guard, setGuard] = useState<UnsavedDraftGuard | null>(null);
    const confirmAction = useConfirm();

    const registerGuard = useCallback((next: UnsavedDraftGuard | null) => {
        setGuard(next);
    }, []);

    const tryNavigate = useCallback(
        (navigate: () => void) => {
            if (!guard) {
                navigate();
                return;
            }
            void confirmAction({
                title: guard.message,
                tone: 'warning',
                confirmLabel: 'Descartar',
                cancelLabel: 'Continuar a editar',
            }).then((ok) => {
                if (!ok) return;
                guard.onDiscard();
                setGuard(null);
                navigate();
            });
        },
        [guard, confirmAction]
    );

    useEffect(() => {
        if (!guard) return;

        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };

        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [guard]);

    useEffect(() => {
        if (!guard) return;

        const onDocumentClick = (e: MouseEvent) => {
            const anchor = (e.target as HTMLElement).closest('a[href]');
            if (!anchor || anchor.getAttribute('target') === '_blank') return;

            const href = anchor.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
                return;
            if (href.startsWith('http') && !href.startsWith(window.location.origin)) return;

            const path = href.startsWith('http')
                ? new URL(href).pathname
                : href.split('?')[0].split('#')[0];
            if (path === pathname) return;

            e.preventDefault();
            e.stopPropagation();
            tryNavigate(() => router.push(href));
        };

        document.addEventListener('click', onDocumentClick, true);
        return () => document.removeEventListener('click', onDocumentClick, true);
    }, [guard, pathname, router, tryNavigate]);

    const registerValue = useMemo(() => ({ registerGuard }), [registerGuard]);

    return (
        <UnsavedDraftContext.Provider value={{ tryNavigate }}>
            <UnsavedDraftRegisterContext.Provider value={registerValue}>
                {children}
            </UnsavedDraftRegisterContext.Provider>
        </UnsavedDraftContext.Provider>
    );
}

export function useTryNavigate() {
    const ctx = useContext(UnsavedDraftContext);
    if (!ctx) {
        return (navigate: () => void) => navigate();
    }
    return ctx.tryNavigate;
}

/** Register unsaved draft while a minimizable sheet session is open */
export function useUnsavedDraftGuard(
    enabled: boolean,
    onDiscard: () => void,
    message = UNSAVED_DRAFT_MESSAGE
) {
    const register = useContext(UnsavedDraftRegisterContext);
    const onDiscardRef = useRef(onDiscard);
    onDiscardRef.current = onDiscard;

    useEffect(() => {
        if (!register) return;
        if (!enabled) {
            register.registerGuard(null);
            return;
        }
        register.registerGuard({
            message,
            onDiscard: () => onDiscardRef.current(),
        });
        return () => register.registerGuard(null);
    }, [enabled, message, register]);
}
