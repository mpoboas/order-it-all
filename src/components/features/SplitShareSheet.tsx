'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { Sheet } from '@/components/ui/Sheet';
import { splitsApi } from '@/lib/pocketbase';
import { buildSplitShareMessage, buildSplitShareUrl } from '@/lib/splitShare';
import { isSplitClosed } from '@/lib/splitStatus';
import type { Split } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Icon } from '@/components/ui/Icon';

interface SplitShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  split: Split;
  onSplitUpdate: (split: Split) => void;
}

export function SplitShareSheet({
  isOpen,
  onClose,
  split,
  onSplitUpdate,
}: SplitShareSheetProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [shareCode, setShareCode] = useState(split.share_code ?? '');
  const [shareActive, setShareActive] = useState(split.share_active ?? false);

  useEffect(() => {
    if (!isOpen) return;
    setShareCode(split.share_code ?? '');
    setShareActive(split.share_active ?? false);
  }, [isOpen, split.share_code, split.share_active]);

  const refreshShareState = useCallback(async () => {
    setLoading(true);
    try {
      const updated = await splitsApi.ensureShareCode(split.id);
      setShareCode(updated.share_code ?? '');
      setShareActive(updated.share_active ?? false);
      onSplitUpdate(updated);
    } catch {
      showToast('Erro ao preparar link', 'error');
    } finally {
      setLoading(false);
    }
  }, [split.id, onSplitUpdate, showToast]);

  useEffect(() => {
    if (isOpen && !split.share_code) {
      refreshShareState();
    }
  }, [isOpen, split.share_code, refreshShareState]);

  const shareUrl = shareCode ? buildSplitShareUrl(shareCode) : '';

  const splitClosed = isSplitClosed(split);

  const handleToggle = async () => {
    if (splitClosed) {
      showToast('Divisão fechada — reabre para ativar o link', 'error');
      return;
    }
    setLoading(true);
    try {
      const updated = await splitsApi.toggleShare(split.id, !shareActive);
      setShareActive(updated.share_active ?? false);
      setShareCode(updated.share_code ?? shareCode);
      onSplitUpdate(updated);
      showToast(
        updated.share_active ? 'Link público ativo' : 'Link público desativado',
        'success'
      );
    } catch {
      showToast('Erro ao alterar partilha', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copiado!', 'success');
    } catch {
      showToast('Não foi possível copiar', 'error');
    }
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    const message = buildSplitShareMessage(split.name, shareUrl);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Divisão — ${split.name}`,
          text: message,
        });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      showToast('Mensagem copiada — cola no WhatsApp ou Instagram', 'success');
    } catch {
      showToast('Não foi possível partilhar', 'error');
    }
  };

  const handleRegenerate = async () => {
    if (
      !confirm(
        'Gerar um novo código? O link e QR antigos deixam de funcionar.'
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const updated = await splitsApi.regenerateShareCode(split.id);
      setShareCode(updated.share_code ?? '');
      onSplitUpdate(updated);
      showToast('Novo código gerado', 'success');
    } catch {
      showToast('Erro ao gerar código', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Convidar a marcar"
      subtitle="Link para cada pessoa indicar em que itens participou"
      size="medium"
    >
      <div className="space-y-5 px-1">
        <p className="text-sm text-[var(--text-secondary)]">
          Cada pessoa escolhe o seu nome na lista e marca os itens que participou.
        </p>

        {splitClosed && (
          <p className="text-sm text-amber-700 dark:text-amber-400 font-medium rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 border border-amber-200 dark:border-amber-800">
            Divisão fechada. Reabre a divisão para voltar a permitir alterações pelo link.
          </p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            Link público ativo
          </span>
          <button
            type="button"
            disabled={loading || splitClosed}
            onClick={handleToggle}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              shareActive ? 'bg-primary-600' : 'bg-gray-200 dark:bg-slate-700'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform ml-1',
                shareActive && 'translate-x-5'
              )}
            />
          </button>
        </div>

        {loading && !shareCode ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        ) : shareCode ? (
          <>
            {shareActive && (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="p-4 bg-white rounded-xl shadow-sm border border-[var(--border)]">
                  <QRCode value={shareUrl} size={160} />
                </div>
              </div>
            )}

            <code className="block w-full px-3 py-2.5 rounded-xl text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-secondary)] truncate">
              {shareUrl || '…'}
            </code>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!shareUrl || !shareActive}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
              >
                <Icon name="content_copy" className="text-[18px]" />
                Copiar link
              </button>
              <button
                type="button"
                onClick={() => void handleShare()}
                disabled={!shareUrl || !shareActive}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                <Icon name="share" className="text-[18px]" />
                Partilhar
              </button>
            </div>

            {!shareActive && (
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Ativa o link para o QR e o URL funcionarem.
              </p>
            )}

            <button
              type="button"
              onClick={handleRegenerate}
              disabled={loading}
              className="text-sm text-amber-600 dark:text-amber-500 hover:underline"
            >
              Gerar novo código
            </button>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
