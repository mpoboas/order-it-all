'use client';

import { useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { SplitParticipantItemsView } from '@/components/features/SplitParticipantItemsView';
import { SplitMemberItemAllocationSheet } from '@/components/features/SplitMemberItemAllocationSheet';
import { useGroup } from '@/context/GroupContext';
import { getAllowedMemberModes, getSplitItemMode } from '@/lib/splitItemAllocation';
import {
  findSuggestedParticipant,
  getParticipantAvatarUrl,
  toggleItemParticipant,
} from '@/lib/splitShare';
import { reconcileSplitItems } from '@/lib/splitItems';
import { canMembersEditSplit } from '@/lib/splitStatus';
import { splitsApi } from '@/lib/pocketbase';
import type { Split, SplitItem, User } from '@/lib/types';
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
  const { currentGroup } = useGroup();
  const [togglingIdx, setTogglingIdx] = useState<number | null>(null);
  const [allocationSheetIdx, setAllocationSheetIdx] = useState<number | null>(
    null
  );

  const participantAvatar = useMemo(
    () => (name: string) => getParticipantAvatarUrl(name, currentGroup),
    [currentGroup]
  );

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
    const nextItems = reconcileSplitItems(items, split.participants);
    onSplitUpdate({ ...split, items: nextItems });
    try {
      await splitsApi.update(split.id, { items: nextItems });
    } catch {
      onSplitUpdate(rollback);
      showToast('Erro ao guardar', 'error');
    } finally {
      setTogglingIdx(null);
    }
  };

  const membersCanEdit = canMembersEditSplit(split);

  const handleToggle = async (itemIndex: number, include: boolean) => {
    if (!myName) return;
    if (!membersCanEdit) {
      showToast('Esta divisão está fechada', 'error');
      return;
    }
    if (getSplitItemMode(split.items[itemIndex]) !== 'equal') {
      setAllocationSheetIdx(itemIndex);
      return;
    }
    const result = toggleItemParticipant(
      split.items,
      itemIndex,
      myName,
      include
    );
    if (!result.ok) {
      if (result.reason === 'locked') {
        showToast('Este item está bloqueado — não podes remover-te', 'error');
      }
      return;
    }
    await saveItems(result.items, split, itemIndex);
  };

  const handleConfirmAllocation = async (updatedItem: SplitItem) => {
    if (!myName || allocationSheetIdx === null) return;
    const items = split.items.map((item, index) =>
      index === allocationSheetIdx ? updatedItem : item
    );
    await saveItems(items, split, allocationSheetIdx);
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
        {!membersCanEdit && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 max-w-lg mx-auto font-medium">
            Esta divisão está fechada.
          </p>
        )}
      </div>

      <main className="container mx-auto px-4 py-4 max-w-lg w-full">
        <SplitParticipantItemsView
          items={split.items}
          allParticipants={split.participants}
          participantName={myName}
          togglingIdx={togglingIdx}
          onToggle={handleToggle}
          onOpenAllocationSheet={setAllocationSheetIdx}
          readOnly={!membersCanEdit}
          showFooter
          footerOffset="safe"
          participantAvatarUrl={participantAvatar}
        />
      </main>

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
        myName={myName}
        group={currentGroup}
        readOnly={!membersCanEdit}
        allowedModes={getAllowedMemberModes(split)}
        onConfirm={(item) => void handleConfirmAllocation(item)}
      />
    </div>
  );
}
