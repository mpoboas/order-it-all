'use client';

import { useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { SplitParticipantItemsView } from '@/components/features/SplitParticipantItemsView';
import {
  findSuggestedParticipant,
  toggleItemParticipant,
} from '@/lib/splitShare';
import { splitsApi } from '@/lib/pocketbase';
import type { Split, User } from '@/lib/types';
import { useToast } from '@/context/ToastContext';

interface SplitMemberDetailViewProps {
  split: Split;
  groupId: string;
  user: User | null;
  onSplitUpdate: (split: Split) => void;
}

export function SplitMemberDetailView({
  split,
  groupId,
  user,
  onSplitUpdate,
}: SplitMemberDetailViewProps) {
  const { showToast } = useToast();
  const [togglingIdx, setTogglingIdx] = useState<number | null>(null);

  const myName = useMemo(
    () => findSuggestedParticipant(split.participants, user),
    [split.participants, user]
  );

  const saveItems = async (
    items: Split['items'],
    rollback: Split,
    itemIndex?: number
  ) => {
    if (itemIndex !== undefined) setTogglingIdx(itemIndex);
    onSplitUpdate({ ...split, items });
    try {
      await splitsApi.update(split.id, { items });
    } catch {
      onSplitUpdate(rollback);
      showToast('Erro ao guardar', 'error');
    } finally {
      setTogglingIdx(null);
    }
  };

  const handleToggle = async (itemIndex: number, include: boolean) => {
    if (!myName) return;
    const items = toggleItemParticipant(
      split.items,
      itemIndex,
      myName,
      include
    );
    await saveItems(items, split, itemIndex);
  };

  if (!myName) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)]">
        <Header
          showBack
          title={split.name}
          subtitle={split.description || 'Divisão'}
          groupId={groupId}
        />
        <main className="container mx-auto px-4 py-16 max-w-lg text-center">
          <div className="text-5xl mb-4">👤</div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">
            Não participas nesta divisão
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            O teu nome não está na lista de participantes. Pede a um administrador
            do grupo para te adicionar.
          </p>
          {split.participants.length > 0 && (
            <p className="text-xs text-[var(--text-muted)] mt-4 break-words">
              Participantes: {split.participants.join(', ')}
            </p>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-24">
      <Header
        showBack
        title={split.name}
        subtitle={split.description || 'Divisão'}
        groupId={groupId}
      />
      <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <p className="text-sm text-[var(--text-secondary)] max-w-lg mx-auto">
          A marcar como:{' '}
          <strong className="text-[var(--text-primary)]">{myName}</strong>
        </p>
      </div>

      <main className="container mx-auto px-4 py-4 max-w-lg w-full">
        <SplitParticipantItemsView
          items={split.items}
          allParticipants={split.participants}
          participantName={myName}
          togglingIdx={togglingIdx}
          onToggle={handleToggle}
          showFooter
          footerOffset="safe"
        />
      </main>
    </div>
  );
}
