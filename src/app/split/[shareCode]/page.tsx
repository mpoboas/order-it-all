'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import {
  clearStoredParticipant,
  findSuggestedParticipant,
  getStoredParticipant,
  setStoredParticipant,
  type PublicSplitPayload,
} from '@/lib/splitShare';
import { canMembersEditSplit, normalizeSplitStatus } from '@/lib/splitStatus';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Avatar } from '@/components/ui/Avatar';
import { SplitParticipantItemsView } from '@/components/features/SplitParticipantItemsView';
import { SplitMemberItemAllocationSheet } from '@/components/features/SplitMemberItemAllocationSheet';
import { getAllowedMemberModes, getSplitItemMode } from '@/lib/splitItemAllocation';
import type { SplitItem, SplitItemMode } from '@/lib/types';
import { useRefreshHandler } from '@/context/RefreshContext';

/**
 * Poll adaptativo: a página pública não tem realtime do PocketBase (é aberta por
 * gente não autenticada), por isso sincroniza por poll. Em repouso é lento; a
 * seguir a uma interação local, ou ao voltar ao separador, acelera durante uns
 * segundos — é aí que as marcações do organizador / de outros participantes
 * costumam chegar. Ver `PLANONATIVEFEEL.md` › Fase 6.
 */
const POLL_IDLE_MS = 4000;
const POLL_ACTIVE_MS = 1200;
const ACTIVE_WINDOW_MS = 10_000;

type Step = 'identity' | 'items';

async function fetchPublicSplit(
  shareCode: string
): Promise<PublicSplitPayload | null> {
  const res = await fetch(`/api/splits/share/${encodeURIComponent(shareCode)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('fetch_failed');
  return res.json();
}

/**
 * PATCH à rota partilhada. O servidor já reserializa e repete em conflito de
 * versão; se mesmo assim vier 409 (contenção pesada) repetimos aqui algumas
 * vezes antes de desistir.
 */
async function patchSplitShare(
  shareCode: string,
  body: Record<string, unknown>,
  attempt = 0
): Promise<PublicSplitPayload> {
  const res = await fetch(`/api/splits/share/${encodeURIComponent(shareCode)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1) + Math.random() * 120));
    return patchSplitShare(shareCode, body, attempt + 1);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'patch_failed');
  }
  return res.json();
}

async function patchParticipantToggle(
  shareCode: string,
  participantName: string,
  itemIndex: number,
  include: boolean
): Promise<PublicSplitPayload> {
  return patchSplitShare(shareCode, { participantName, itemIndex, include });
}

async function patchMemberAllocation(
  shareCode: string,
  participantName: string,
  itemIndex: number,
  updatedItem: SplitItem
): Promise<PublicSplitPayload> {
  const mode = getSplitItemMode(updatedItem);
  const equalParticipating = updatedItem.participants.includes(participantName);
  const myValue = updatedItem.allocations?.[participantName] ?? 0;
  // Exact-amount and share-count splits let a member set everyone's value,
  // so send the full map.
  const allocations =
    mode === 'unequal' || mode === 'shares'
      ? updatedItem.allocations ?? {}
      : undefined;
  // Equal splits let a member toggle anyone's participation, so send the
  // full desired participant list rather than just the caller's own flag.
  const participants = mode === 'equal' ? updatedItem.participants : undefined;

  return patchSplitShare(shareCode, {
    participantName,
    itemIndex,
    memberAllocation: {
      mode: mode as SplitItemMode,
      equalParticipating,
      myValue,
      allocations,
      participants,
    },
  });
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
  const [allocationSheetIdx, setAllocationSheetIdx] = useState<number | null>(
    null
  );
  const [loadError, setLoadError] = useState(false);

  // Poll adaptativo (ver constantes no topo).
  const activeUntilRef = useRef(0);
  const togglingRef = useRef(false);
  const bumpPolling = useCallback(() => {
    activeUntilRef.current = Date.now() + ACTIVE_WINDOW_MS;
  }, []);
  useEffect(() => {
    togglingRef.current = togglingIdx !== null;
  }, [togglingIdx]);

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
        setSplit({ ...data, status: normalizeSplitStatus(data) });
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

  useRefreshHandler(load);

  const suggested = split
    ? findSuggestedParticipant(split.participants, user)
    : null;

  useEffect(() => {
    const stored = getStoredParticipant(shareCode);
    if (stored && split?.participants.includes(stored)) {
      setSelectedName(stored);
      setStep('items');
      return;
    }
    if (isLoggedIn && suggested && split?.participants.includes(suggested)) {
      setSelectedName(suggested);
      setStoredParticipant(shareCode, suggested);
      setStep('items');
    }
  }, [shareCode, split?.participants, isLoggedIn, suggested]);

  useEffect(() => {
    if (step !== 'items' || notFound) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      // Não faz poll enquanto há uma escrita local a decorrer (evita reverter o
      // optimista) nem com o separador em segundo plano.
      if (!togglingRef.current && document.visibilityState === 'visible') {
        try {
          const data = await fetchPublicSplit(shareCode);
          if (!cancelled && data) {
            setSplit({ ...data, status: normalizeSplitStatus(data) });
          }
        } catch {
          /* ignore poll errors */
        }
      }
      if (cancelled) return;
      const fast = Date.now() < activeUntilRef.current;
      timer = setTimeout(tick, fast ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    };

    // Entrar no ecrã conta como atividade — arranca em modo rápido.
    bumpPolling();
    timer = setTimeout(tick, POLL_ACTIVE_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        bumpPolling();
        clearTimeout(timer);
        timer = setTimeout(tick, 0);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', bumpPolling);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', bumpPolling);
    };
  }, [step, notFound, shareCode, bumpPolling]);

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
    if (!canMembersEditSplit(split)) {
      showToast('Esta divisão está fechada', 'error');
      return;
    }
    if (getSplitItemMode(split.items[itemIndex]) !== 'equal') {
      setAllocationSheetIdx(itemIndex);
      return;
    }
    const item = split.items[itemIndex];
    if (!include && item?.locked) {
      showToast('Este item está bloqueado — não podes remover-te', 'error');
      return;
    }
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
    } catch (err) {
      setSplit(prev);
      const message = err instanceof Error ? err.message : '';
      if (
        message.includes('fechada') ||
        message.includes('Fechada') ||
        message.includes('alterar')
      ) {
        showToast('Esta divisão está fechada', 'error');
      } else if (message.includes('bloqueado') || message.includes('locked')) {
        showToast('Este item está bloqueado — não podes remover-te', 'error');
      } else {
        showToast('Erro ao guardar', 'error');
      }
    } finally {
      setTogglingIdx(null);
      bumpPolling();
    }
  };

  const handleConfirmAllocation = async (updatedItem: SplitItem) => {
    if (!split || !selectedName || allocationSheetIdx === null) return;
    setTogglingIdx(allocationSheetIdx);
    const prev = split;
    try {
      const updated = await patchMemberAllocation(
        shareCode,
        selectedName,
        allocationSheetIdx,
        updatedItem
      );
      setSplit(updated);
    } catch (err) {
      setSplit(prev);
      const message = err instanceof Error ? err.message : '';
      if (
        message.includes('fechada') ||
        message.includes('Fechada') ||
        message.includes('alterar')
      ) {
        showToast('Esta divisão está fechada', 'error');
      } else if (message.includes('bloqueado') || message.includes('locked')) {
        showToast('Este item está bloqueado — não podes remover-te', 'error');
      } else {
        showToast('Erro ao guardar', 'error');
      }
    } finally {
      setTogglingIdx(null);
      bumpPolling();
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
        <header className="bg-gradient-to-r from-primary-600 to-primary-600 px-4 py-6 safe-top">
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
            <div className="mb-4 p-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
              <p className="text-sm text-[var(--text-secondary)]">
                Parece que és{' '}
                <button
                  type="button"
                  onClick={() => setSelectedName(suggested)}
                  className="font-semibold text-primary-600 dark:text-primary-400 hover:underline"
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
                      'w-full flex items-center gap-3 p-4 rounded-xl border transition text-left',
                      selectedName === name
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-2 ring-primary-500/30'
                        : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-primary-300'
                    )}
                  >
                    <Avatar name={name} size="md" />
                    <span className="font-medium text-[var(--text-primary)]">
                      {name}
                    </span>
                    {selectedName === name && (
                      <svg
                        className="w-5 h-5 text-primary-600 ml-auto shrink-0"
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

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-24">
      <header className="bg-gradient-to-r from-primary-600 to-primary-600 px-4 py-5 safe-top">
        <h1 className="text-lg font-bold text-white break-words">{split.name}</h1>
        <p className="text-sm text-white/90 mt-1">
          A marcar como: <strong>{selectedName}</strong>
        </p>
        {split && !canMembersEditSplit(split) && (
          <p className="text-xs text-amber-200 mt-2 font-medium">
            Esta divisão está fechada.
          </p>
        )}
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
            className="block mb-4 text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            Abrir no grupo
          </Link>
        )}

        {selectedName && (
          <SplitParticipantItemsView
            items={split.items}
            allParticipants={split.participants}
            participantName={selectedName}
            togglingIdx={togglingIdx}
            onToggle={handleToggle}
            onOpenAllocationSheet={setAllocationSheetIdx}
            readOnly={!canMembersEditSplit(split)}
            footerOffset="safe"
          />
        )}
      </main>

      {selectedName && (
        <SplitMemberItemAllocationSheet
          isOpen={allocationSheetIdx !== null}
          onClose={() => setAllocationSheetIdx(null)}
          itemIndex={allocationSheetIdx}
          item={
            allocationSheetIdx !== null
              ? (split.items[allocationSheetIdx] ?? null)
              : null
          }
          allParticipants={split.participants}
          myName={selectedName}
          group={null}
          readOnly={!canMembersEditSplit(split)}
          allowedModes={getAllowedMemberModes(split)}
          onConfirm={(item) => void handleConfirmAllocation(item)}
        />
      )}
    </div>
  );
}
