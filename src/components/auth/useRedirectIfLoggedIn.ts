'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { useAppNavigate } from '@/hooks/useAppNavigate';

/**
 * Quem JÁ tem sessão e abre um ecrã de entrar/criar conta (ex.: um link de
 * convite antigo `/auth/register?redirect=/invite/…`, ou o botão "voltar" do
 * browser depois de entrar) segue logo para o destino — antes via o
 * formulário e podia criar/entrar noutra conta por cima.
 *
 * Só olha para o estado À ENTRADA: depois de o utilizador entrar pelo próprio
 * formulário, é o `handleSubmit` que decide para onde ir (perfil, onboarding).
 * Devolve `true` enquanto está a reencaminhar (para não pintar o formulário).
 */
export function useRedirectIfLoggedIn(redirect: string | null): boolean {
    const { isLoggedIn } = useUser();
    const nav = useAppNavigate();
    const [loggedInOnEntry] = useState(isLoggedIn);

    useEffect(() => {
        if (loggedInOnEntry) nav.replace(redirect || '/groups', { haptic: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só à entrada
    }, [loggedInOnEntry]);

    return loggedInOnEntry;
}
