'use client';

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { placeholdersApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { useToast } from '@/context/ToastContext';
import type { Placeholder, User } from '@/lib/types';

interface ClaimPlaceholderSheetProps {
  isOpen: boolean;
  onClose: () => void;
  placeholder: Placeholder | null;
  members: User[];
  onClaimed: () => void;
}

/** Associa um "membro sem conta" (placeholder) a um membro real do grupo —
 *  o histórico não é reescrito, só passa a mapear `placeholder → utilizador`
 *  a partir daqui (ver `canonicalPartyId` em `src/lib/parties.ts`). */
export function ClaimPlaceholderSheet({ isOpen, onClose, placeholder, members, onClaimed }: ClaimPlaceholderSheetProps) {
  const { showToast } = useToast();
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const handleClaim = async (userId: string) => {
    if (!placeholder) return;
    setClaimingId(userId);
    try {
      const updated = await placeholdersApi.claim(placeholder.id, userId);
      await db.placeholders.put(updated);
      showToast(`${placeholder.name} associado`, 'success');
      onClaimed();
      onClose();
    } catch {
      showToast('Erro ao associar', 'error');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={`Quem é ${placeholder?.name ?? ''}?`}
      subtitle="As despesas e saldos passam para a conta escolhida"
      size="medium"
    >
      {members.length === 0 ? (
        <p className="text-center text-sm text-ink-faint py-8">Sem membros com conta neste grupo.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => handleClaim(member.id)}
                disabled={claimingId !== null}
                className="w-full flex items-center gap-3 py-3 text-left hover:bg-surface-sunken rounded-lg px-1 -mx-1 transition-colors disabled:opacity-50"
              >
                <Avatar name={member.name} src={getUserAvatarUrl(member.id, member.avatar)} size="sm" />
                <span className="flex-1 font-medium text-ink truncate">{member.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
