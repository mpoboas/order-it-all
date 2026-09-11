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

  /**
   * `apply` recebe o split fresco e devolve os novos `items`. Corre optimista já,
   * e em conflito de versão (outro participante marcou ao mesmo tempo) relê e
   * re-aplica a intenção — `items_version` (OCC) impede o *lost update*.
   */
  const saveItems = async (
    apply: (current: Split) => Split['items'],
    rollback: Split,
    itemIndex?: number
  ) => {
    if (itemIndex !== undefined) setTogglingIdx(itemIndex);
    onSplitUpdate({
      ...split,
      items: reconcileSplitItems(apply(split), split.participants),
    });
    try {
      let base = split;
      for (let attempt = 0; attempt < 5; attempt++) {
        const items = reconcileSplitItems(apply(base), base.participants);
        try {
          const saved = await splitsApi.updateItems(
            split.id,
            { items },
            base.items_version ?? 0
          );
          onSplitUpdate(saved);
          return;
        } catch (err) {
          const status = (err as { status?: number })?.status;
          if (
            (status === 404 || status === 403 || status === 400) &&
            attempt < 4
          ) {
            // Conflito de versão — relê e tenta outra vez com a base fresca.
            base = await splitsApi.getById(split.id);
            await new Promise((r) => setTimeout(r, 60 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
      throw new Error('split_conflict');
    } catch {
      try {
        onSplitUpdate(await splitsApi.getById(split.id));
      } catch {
        onSplitUpdate(rollback);
      }
      showToast('Não consegui guardar — tenta outra vez.', 'error');
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
    const precheck = toggleItemParticipant(
      split.items,
      itemIndex,
      myName,
      include
    );
    if (!precheck.ok) {
      if (precheck.reason === 'locked') {
        showToast('Este item está bloqueado — quem participa está fixo', 'error');
      }
      return;
    }
    await saveItems(
      (current) => {
        const r = toggleItemParticipant(current.items, itemIndex, myName, include);
        return r.ok ? r.items : current.items;
      },
      split,
      itemIndex
    );
  };

  const handleConfirmAllocation = async (updatedItem: SplitItem) => {
    if (!myName || allocationSheetIdx === null) return;
    await saveItems(
      (current) =>
        current.items.map((item, index) =>
          index === allocationSheetIdx ? updatedItem : item
        ),
      split,
      allocationSheetIdx
    );
  };

  if (!myName) {
    return (
      <div className="min-h-screen bg-app">
        <Header
          showBack
          title={split.name}
          subtitle={split.description || 'Divisão'}
          groupId={groupId}
        />
        <main className="container mx-auto px-4 py-16 max-w-lg text-center">
          <div className="text-5xl mb-4">👤</div>
          <h2 className="text-lg font-bold text-ink mb-2">
            Não participas nesta divisão
          </h2>
          <p className="text-sm text-ink-soft">
            O teu nome não está na lista de participantes. Pede a um administrador
            do grupo para te adicionar.
          </p>
          {split.participants.length > 0 && (
            <p className="text-xs text-ink-faint mt-4 break-words">
              Participantes: {split.participants.join(', ')}
            </p>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app pb-24">
      <Header
        showBack
        title={split.name}
        subtitle={split.description || 'Divisão'}
        groupId={groupId}
      />
      <div className="px-4 py-2.5 border-b border-hairline bg-surface">
        <p className="text-sm text-ink-soft max-w-lg mx-auto">
          A marcar como:{' '}
          <strong className="text-ink">{myName}</strong>
        </p>
        {!membersCanEdit && (
          <p className="text-xs text-warning-fg mt-1 max-w-lg mx-auto font-medium">
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
