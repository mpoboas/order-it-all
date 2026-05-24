'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import {
  getGoogleOAuthInAppBrowserMessage,
  startGoogleOAuth,
} from '@/lib/googleAuth';

interface GoogleSignInButtonProps {
  redirect?: string | null;
  label?: string;
}

export function GoogleSignInButton({
  redirect,
  label = 'Continuar com Google',
}: GoogleSignInButtonProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    if (loading) return;
    setLoading(true);
    startGoogleOAuth(redirect ?? null)
      .then((result) => {
        if (result === 'external') {
          showToast(getGoogleOAuthInAppBrowserMessage(), 'info');
          // Intent / window.open may fail silently; allow retry after a moment.
          window.setTimeout(() => setLoading(false), 2500);
          return;
        }
      })
      .catch((error) => {
        console.error('Google OAuth start:', error);
        showToast(
          error instanceof Error ? error.message : 'Erro ao iniciar login Google',
          'error'
        );
        setLoading(false);
      });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white/90 hover:bg-white text-gray-800 rounded-xl font-semibold text-base shadow-lg border border-white/40 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
    >
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
      {loading ? 'A redirecionar...' : label}
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="relative flex items-center py-1">
      <div className="flex-grow border-t border-white/30" />
      <span className="flex-shrink mx-3 text-white/70 text-xs font-medium uppercase tracking-wide">
        ou
      </span>
      <div className="flex-grow border-t border-white/30" />
    </div>
  );
}
