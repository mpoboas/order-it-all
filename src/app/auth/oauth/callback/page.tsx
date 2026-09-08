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
import { LoadingSpinner } from '@/components/layout/LoadingScreen';

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
        const path = buildPostAuthPath(setup, redirectPath ?? null);

        if (setup) {
          showToast('Completa o teu perfil', 'success');
        } else {
          showToast('Bem-vindo!', 'success');
        }

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
    <div className="min-h-screen gradient-mesh flex flex-col items-center justify-center p-4 safe-screen">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-white/90 text-sm">A concluir login com Google...</p>
    </div>
  );
}
