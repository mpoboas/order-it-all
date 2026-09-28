'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import {
  buildPostAuthPath,
  completeGoogleOAuth,
  needsProfileSetup,
  saveOAuthProfileHints,
} from '@/lib/googleAuth';
import { AuthBackdrop, AuthLogo } from '@/components/auth/AuthShell';
import { navStart } from '@/lib/navProgress';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      showToast('Login Google incompleto', 'error');
      router.replace('/auth/login');
      return;
    }

    (async () => {
      try {
        const { record, meta, redirectPath } = await completeGoogleOAuth(
          code,
          state
        );
        saveOAuthProfileHints(meta);

        const setup = needsProfileSetup(
          record as { name?: string },
          meta
        );
        const path = buildPostAuthPath(
          setup,
          redirectPath ?? null,
          (record as { onboarded?: boolean }).onboarded
        );

        if (setup) {
          showToast('Completa o teu perfil para continuar', 'info');
        }

        navStart();
        router.replace(path);
      } catch (error) {
        console.error('Google OAuth callback:', error);
        showToast(
          error instanceof Error ? error.message : 'Erro ao entrar com Google',
          'error'
        );
        router.replace('/auth/login');
      }
    })();
  }, [searchParams, router, showToast]);

  return (
    <AuthBackdrop>
      <div className="flex-1 flex flex-col items-center justify-center p-4 on-brand">
        <AuthLogo className="mb-6" />
        <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-sm text-ink-soft">A entrar com o Google…</p>
      </div>
    </AuthBackdrop>
  );
}
