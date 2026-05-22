'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import {
  calculateParticipantTotal,
  clearStoredParticipant,
  findSuggestedParticipant,
  getStoredParticipant,
  setStoredParticipant,
  type PublicSplitPayload,
} from '@/lib/splitShare';
import { formatCurrency, cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Avatar } from '@/components/ui/Avatar';

const POLL_MS = 4000;

type Step = 'identity' | 'items';

async function fetchPublicSplit(
  shareCode: string
): Promise<PublicSplitPayload | null> {
  const res = await fetch(`/api/splits/share/${encodeURIComponent(shareCode)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('fetch_failed');
  return res.json();
}

async function patchParticipantToggle(
  shareCode: string,
  participantName: string,
  itemIndex: number,
  include: boolean
): Promise<PublicSplitPayload> {
  const res = await fetch(
    `/api/splits/share/${encodeURIComponent(shareCode)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantName, itemIndex, include }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'patch_failed');
  }
  return res.json();
}

export default function PublicSplitPage() {
  const params = useParams();
  const shareCode = params.shareCode as string;
  const { user, isLoggedIn } = useUser();
  const { showToast } = useToast();

  const [split, setSplit] = useState<PublicSplitPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<Step>('identity');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [togglingIdx, setTogglingIdx] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchPublicSplit(shareCode);
      if (!data) {
        setNotFound(true);
        setLoadError(false);
        setSplit(null);
      } else {
        setNotFound(false);
        setLoadError(false);
        setSplit(data);
      }
    } catch {
      setLoadError(true);
      setNotFound(false);
      showToast('Erro ao carregar divisão', 'error');
    } finally {
      setLoading(false);
    }
  }, [shareCode, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const stored = getStoredParticipant(shareCode);
    if (stored && split?.participants.includes(stored)) {
      setSelectedName(stored);
      setStep('items');
    }
  }, [shareCode, split?.participants]);

  useEffect(() => {
    if (step !== 'items' || notFound || !split) return;
    const id = setInterval(async () => {
      try {
        const data = await fetchPublicSplit(shareCode);
        if (data) setSplit(data);
      } catch {
        /* ignore poll errors */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [step, notFound, split, shareCode]);

  const suggested = split
    ? findSuggestedParticipant(split.participants, user)
    : null;

  useEffect(() => {
    if (step !== 'identity' || !suggested || selectedName) return;
    setSelectedName(suggested);
  }, [step, suggested, selectedName]);

  const handleConfirmIdentity = () => {
    if (!selectedName) return;
    setStoredParticipant(shareCode, selectedName);
    setStep('items');
  };

  const handleChangePerson = () => {
    clearStoredParticipant(shareCode);
    setStep('identity');
  };

  const handleToggle = async (itemIndex: number, include: boolean) => {
    if (!split || !selectedName) return;
    setTogglingIdx(itemIndex);
    const prev = split;
    const optimistic = {
      ...split,
      items: split.items.map((item, i) => {
        if (i !== itemIndex) return { ...item, participants: [...item.participants] };
        const parts = [...item.participants];
        if (include && !parts.includes(selectedName)) parts.push(selectedName);
        if (!include) {
          return {
            ...item,
            participants: parts.filter((p) => p !== selectedName),
          };
        }
        return { ...item, participants: parts };
      }),
    };
    setSplit(optimistic);
    try {
      const updated = await patchParticipantToggle(
        shareCode,
        selectedName,
        itemIndex,
        include
      );
      setSplit(updated);
    } catch {
      setSplit(prev);
      showToast('Erro ao guardar', 'error');
    } finally {
      setTogglingIdx(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] px-4 py-16 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          Erro ao carregar
        </h1>
        <p className="text-[var(--text-secondary)] text-sm max-w-sm mx-auto mb-6">
          Não foi possível ligar ao servidor. Tenta outra vez.
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setLoadError(false);
            load();
          }}
          className="btn btn-primary px-6 py-2"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (notFound || !split) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] px-4 py-16 text-center">
        <div className="text-5xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          Link inválido ou desativado
        </h1>
        <p className="text-[var(--text-secondary)] text-sm max-w-sm mx-auto">
          Pede ao organizador um novo link ou para reativar a partilha na divisão.
        </p>
      </div>
    );
  }

  if (step === 'identity') {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
        <header className="bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-6">
          <h1 className="text-xl font-bold text-white">{split.name}</h1>
          {split.description && (
            <p className="text-sm text-white/80 mt-1">{split.description}</p>
          )}
        </header>

        <main className="flex-1 container mx-auto px-4 py-6 max-w-lg w-full">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Quem és?
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Escolhe o teu nome na lista.
          </p>

          {suggested && selectedName !== suggested && (
            <div className="mb-4 p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
              <p className="text-sm text-[var(--text-secondary)]">
                Parece que és{' '}
                <button
                  type="button"
                  onClick={() => setSelectedName(suggested)}
                  className="font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                >
                  {suggested}
                </button>
              </p>
            </div>
          )}

          {split.participants.length === 0 ? (
            <p className="text-[var(--text-secondary)] text-sm">
              Ainda não há participantes nesta divisão. Pede ao organizador para
              adicionar nomes.
            </p>
          ) : (
            <ul className="space-y-2">
              {split.participants.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => setSelectedName(name)}
                    className={cn(
                      'w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left',
                      selectedName === name
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 ring-2 ring-violet-500/30'
                        : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-violet-300'
                    )}
                  >
                    <Avatar name={name} size="md" />
                    <span className="font-medium text-[var(--text-primary)]">
                      {name}
                    </span>
                    {selectedName === name && (
                      <svg
                        className="w-5 h-5 text-violet-600 ml-auto shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>

        <footer className="sticky bottom-0 p-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] safe-bottom">
          <button
            type="button"
            disabled={!selectedName}
            onClick={handleConfirmIdentity}
            className="btn btn-primary w-full py-3 disabled:opacity-50"
          >
            Continuar
          </button>
        </footer>
      </div>
    );
  }

  const myTotal = selectedName
    ? calculateParticipantTotal(split.items, selectedName)
    : 0;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-24">
      <header className="bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-5">
        <h1 className="text-lg font-bold text-white break-words">{split.name}</h1>
        <p className="text-sm text-white/90 mt-1">
          A marcar como: <strong>{selectedName}</strong>
        </p>
        <button
          type="button"
          onClick={handleChangePerson}
          className="text-xs text-white/80 underline mt-2"
        >
          Mudar pessoa
        </button>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-lg">
        {isLoggedIn && split.group_id && (
          <Link
            href={`/groups/${split.group_id}/splits/${split.id}`}
            className="block mb-4 text-sm text-violet-600 dark:text-violet-400 hover:underline"
          >
            Abrir divisão completa (membros)
          </Link>
        )}

        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Marca os itens em que participaste.
        </p>

        <ul className="space-y-3">
          {split.items.map((item, idx) => {
            const checked =
              selectedName != null && item.participants.includes(selectedName);
            const busy = togglingIdx === idx;
            return (
              <li
                key={idx}
                className="card p-4 flex items-start gap-3"
              >
                <button
                  type="button"
                  disabled={busy || !selectedName}
                  onClick={() => handleToggle(idx, !checked)}
                  className={cn(
                    'w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 transition-colors',
                    checked
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'border-[var(--border)] bg-[var(--bg-primary)]'
                  )}
                  aria-pressed={checked}
                >
                  {checked && (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--text-primary)] break-words leading-snug">
                    {item.name || 'Item sem nome'}
                  </p>
                  <p className="text-sm text-violet-600 dark:text-violet-400 font-semibold">
                    {formatCurrency(item.price)}
                  </p>
                </div>
                {busy && (
                  <div className="shrink-0 pt-2">
                    <LoadingSpinner size="sm" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {split.items.length === 0 && (
          <p className="text-center text-[var(--text-muted)] py-8 text-sm">
            Ainda não há itens nesta divisão.
          </p>
        )}
      </main>

      <div className="fixed left-0 right-0 bottom-0 p-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] safe-bottom">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <span className="text-sm text-[var(--text-secondary)]">O teu total</span>
          <span className="text-xl font-bold text-violet-600 dark:text-violet-400">
            {formatCurrency(myTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
