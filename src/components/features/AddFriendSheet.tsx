'use client';

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { friendshipsApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { notify } from '@/lib/notify';
import { useToast } from '@/context/ToastContext';
import type { User } from '@/lib/types';

interface AddFriendSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
  /** Já amigo, pedido pendente com esta pessoa, ou o próprio utilizador. */
  isAlreadyRelated: (userId: string) => boolean;
  onRequested: () => void;
}

type FoundUser = Pick<User, 'id' | 'name' | 'avatar'>;

/** Sheet "Adicionar amigo" (Fase 8) — procura por email via `/api/friend-lookup`
 *  (a coleção `users` tem list rule restrita, não dá para pesquisar do
 *  cliente) e envia um pedido de amizade. Sem convite a quem não tem conta
 *  ainda — corte de âmbito explícito do plano. */
export function AddFriendSheet({ isOpen, onClose, currentUserId, currentUserName, isAlreadyRelated, onRequested }: AddFriendSheetProps) {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [found, setFound] = useState<FoundUser | null>(null);
  const [requesting, setRequesting] = useState(false);

  const reset = () => {
    setEmail('');
    setSearching(false);
    setSearched(false);
    setFound(null);
    setRequesting(false);
  };

  const handleSearch = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSearching(true);
    setSearched(false);
    setFound(null);
    try {
      const res = await fetch('/api/friend-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      setFound(data.user ?? null);
    } catch {
      showToast('Erro ao procurar', 'error');
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const handleRequest = async () => {
    if (!found) return;
    setRequesting(true);
    try {
      const friendship = await friendshipsApi.request(currentUserId, found.id);
      await db.friendships.put(friendship);
      showToast('Pedido de amizade enviado', 'success');
      void notify({
        targetUserIds: [found.id],
        title: '👋 Pedido de amizade',
        message: `${currentUserName} quer ser teu amigo.`,
        url: '/people',
      });
      onRequested();
      onClose();
      reset();
    } catch {
      showToast('Erro ao enviar pedido', 'error');
    } finally {
      setRequesting(false);
    }
  };

  const alreadyRelated = found ? isAlreadyRelated(found.id) || found.id === currentUserId : false;

  return (
    <Sheet isOpen={isOpen} onClose={() => { onClose(); reset(); }} title="Adicionar amigo" size="medium">
      <div className="space-y-4 px-1 pb-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="nome@email.com"
              autoFocus
            />
          </div>
          <Button variant="secondary" loading={searching} disabled={!email.trim()} onClick={handleSearch}>
            Procurar
          </Button>
        </div>

        {searched && !found && (
          <p className="text-sm text-ink-faint text-center py-4">
            Não encontrámos ninguém com este email.
          </p>
        )}

        {found && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-sunken">
            <Avatar name={found.name} src={getUserAvatarUrl(found.id, found.avatar)} size="sm" />
            <span className="flex-1 min-w-0 font-medium text-ink truncate">{found.name}</span>
            {found.id === currentUserId ? (
              <span className="text-xs text-ink-faint shrink-0">és tu</span>
            ) : alreadyRelated ? (
              <span className="text-xs text-ink-faint shrink-0 flex items-center gap-1">
                <Icon name="check" className="text-sm" /> já relacionados
              </span>
            ) : (
              <Button loading={requesting} onClick={handleRequest}>
                Pedir amizade
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
