'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { groupsApi, placeholdersApi } from '@/lib/pocketbase';
import { navStart } from '@/lib/navProgress';
import type { Group, Placeholder } from '@/lib/types';
import {
  GROUP_EMOJIS,
  getGroupAvatarUrl,
  guessGroupEmoji,
  isGroupImageAvatar,
} from '@/lib/groupAvatars';
import { groupMembersFromExpand, canonicalPartyId } from '@/lib/parties';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { usePlaceholders, useExpenses, useGroupLedger } from '@/lib/db/hooks';
import { db } from '@/lib/db/schema';
import { optimisticEdit, mutationErrorMessage } from '@/lib/db/mutations';
import { cn, emojiToImageBlob } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Sheet } from '@/components/ui/Sheet';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { GroupNetBalance } from '@/components/features/BalanceRows';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Icon } from '@/components/ui/Icon';
import { ClaimPlaceholderSheet } from '@/components/features/ClaimPlaceholderSheet';

interface GroupSettingsTabProps {
  group: Group;
  groupId: string;
  isCreator: boolean;
  currentUserId?: string;
  onGroupUpdated: () => void;
}

export function GroupSettingsTab({
  group,
  groupId,
  isCreator,
  currentUserId,
  onGroupUpdated,
}: GroupSettingsTabProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const members = groupMembersFromExpand(group);
  const placeholders = usePlaceholders(groupId) ?? [];
  const unclaimedPlaceholders = placeholders.filter((p) => !p.claimed_by);
  const expenses = useExpenses(groupId) ?? [];
  const placeholderHasExpenses = (id: string) =>
    expenses.some((e) => e.payers.some((p) => p.party === id) || e.shares.some((s) => s.party === id));

  const ledger = useGroupLedger(groupId);

  const editGroupMembers = async (
    patch: Partial<Group>,
    commit: () => Promise<unknown>,
    errMsg: string,
  ) => {
    try {
      await optimisticEdit({ table: db.groups, id: groupId, patch, commit });
      onGroupUpdated();
    } catch (error) {
      showToast(mutationErrorMessage(error, errMsg), 'error');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!(await confirmAction({
      title: 'Remover este membro do grupo?',
      tone: 'danger',
      confirmLabel: 'Remover',
    }))) return;
    await editGroupMembers(
      {
        members: group.members.filter((id) => id !== memberId),
        admins: group.admins.filter((id) => id !== memberId),
      },
      () => groupsApi.removeMember(groupId, memberId),
      'Erro ao remover membro',
    );
  };

  const handlePromoteMember = async (memberId: string) => {
    if (!(await confirmAction({
      title: 'Promover a administrador?',
      confirmLabel: 'Promover',
    }))) return;
    await editGroupMembers(
      { admins: [...group.admins, memberId] },
      () => groupsApi.promoteToAdmin(groupId, memberId),
      'Erro ao promover',
    );
  };

  const handleDemoteMember = async (memberId: string) => {
    if (!(await confirmAction({
      title: 'Remover privilégios de administrador?',
      tone: 'warning',
      confirmLabel: 'Remover privilégios',
    }))) return;
    await editGroupMembers(
      { admins: group.admins.filter((id) => id !== memberId) },
      () => groupsApi.demoteFromAdmin(groupId, memberId),
      'Erro ao despromover',
    );
  };

  const [claimTarget, setClaimTarget] = useState<Placeholder | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyPlaceholderId, setBusyPlaceholderId] = useState<string | null>(null);

  const startRename = (p: Placeholder) => {
    setRenamingId(p.id);
    setRenameValue(p.name);
  };

  const saveRename = async (p: Placeholder) => {
    const name = renameValue.trim();
    if (!name || name === p.name) {
      setRenamingId(null);
      return;
    }
    setBusyPlaceholderId(p.id);
    try {
      const updated = await placeholdersApi.rename(p.id, name);
      await db.placeholders.put(updated);
      setRenamingId(null);
    } catch {
      showToast('Erro ao renomear', 'error');
    } finally {
      setBusyPlaceholderId(null);
    }
  };

  const handleRemovePlaceholder = async (p: Placeholder) => {
    if (placeholderHasExpenses(p.id)) {
      showToast('Não é possível remover — tem despesas associadas', 'error');
      return;
    }
    if (!(await confirmAction({
      title: `Remover "${p.name}"?`,
      tone: 'danger',
      confirmLabel: 'Remover',
    }))) return;
    setBusyPlaceholderId(p.id);
    try {
      await placeholdersApi.delete(p.id);
      await db.placeholders.delete(p.id);
      showToast('Removido', 'success');
    } catch {
      showToast('Erro ao remover', 'error');
    } finally {
      setBusyPlaceholderId(null);
    }
  };

  const [editName, setEditName] = useState(group.name);
  const [selectedEmoji, setSelectedEmoji] = useState(() => guessGroupEmoji(group.avatar));
  const [galleryFile, setGalleryFile] = useState<File | null>(null);
  const [galleryPreview, setGalleryPreview] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const [deleteStep, setDeleteStep] = useState<'none' | 'name' | 'confirm'>('none');
  const [deleteNameInput, setDeleteNameInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const resetProfileDraft = () => {
    setEditName(group.name);
    setSelectedEmoji(guessGroupEmoji(group.avatar));
    setGalleryFile(null);
    if (galleryPreview) URL.revokeObjectURL(galleryPreview);
    setGalleryPreview(null);
  };

  useEffect(() => {
    resetProfileDraft();
    setIsEditingProfile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when server group changes
  }, [group.id, group.name, group.avatar]);

  useEffect(() => {
    return () => {
      if (galleryPreview) URL.revokeObjectURL(galleryPreview);
    };
  }, [galleryPreview]);

  const storedImageUrl = isGroupImageAvatar(group.avatar)
    ? getGroupAvatarUrl(group.id, group.avatar)
    : null;

  const displayEmoji = guessGroupEmoji(group.avatar);
  const viewImageUrl = storedImageUrl;

  const emojiChanged = selectedEmoji !== guessGroupEmoji(group.avatar);
  const editImagePreviewUrl =
    galleryPreview ||
    (storedImageUrl && !galleryFile && !emojiChanged ? storedImageUrl : null);

  const nameMatches = deleteNameInput.trim() === group.name.trim();
  const profileDirty =
    editName.trim() !== group.name.trim() ||
    galleryFile !== null ||
    (!galleryFile && selectedEmoji !== guessGroupEmoji(group.avatar));

  const handlePickGallery = () => fileInputRef.current?.click();

  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Escolhe uma imagem válida', 'error');
      return;
    }
    if (galleryPreview) URL.revokeObjectURL(galleryPreview);
    setGalleryFile(file);
    setGalleryPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleSelectEmoji = (emoji: string) => {
    setSelectedEmoji(emoji);
    setGalleryFile(null);
    if (galleryPreview) {
      URL.revokeObjectURL(galleryPreview);
      setGalleryPreview(null);
    }
  };

  const handleSaveProfile = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      showToast('O nome do grupo é obrigatório', 'error');
      return;
    }

    setSavingProfile(true);
    try {
      let avatarBlob: Blob | undefined;
      if (galleryFile) {
        avatarBlob = galleryFile;
      } else if (selectedEmoji !== guessGroupEmoji(group.avatar)) {
        avatarBlob = await emojiToImageBlob(selectedEmoji);
      }

      await groupsApi.update(groupId, {
        name: trimmed,
        ...(avatarBlob ? { avatar: avatarBlob } : {}),
      });
      setIsEditingProfile(false);
      onGroupUpdated();
    } catch (error) {
      console.error('Error updating group:', error);
      showToast('Erro ao guardar grupo', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleInvite = async (active: boolean) => {
    try {
      await groupsApi.toggleInvite(groupId, active);
      showToast(active ? 'Convites ativados' : 'Convites desativados', 'success');
      onGroupUpdated();
    } catch {
      showToast('Erro ao alterar estado', 'error');
    }
  };

  const handleToggleShowAllOrders = async (active: boolean) => {
    try {
      await groupsApi.toggleShowAllOrders(groupId, active);
      showToast(active ? 'Pedidos de todos visíveis' : 'Pedidos de todos ocultados', 'success');
      onGroupUpdated();
    } catch {
      showToast('Erro ao alterar estado', 'error');
    }
  };

  const handleToggleSimplifyDebts = async (active: boolean) => {
    if (!active) {
      if (!(await confirmAction({
        title: 'Desligar "Simplificar dívidas"?',
        description: 'Os saldos passam a mostrar os pares originais — quem pagou o quê a quem, sem os reorganizar.',
        tone: 'warning',
        confirmLabel: 'Desligar',
      }))) return;
    }
    try {
      await groupsApi.toggleSimplifyDebts(groupId, active);
      showToast(active ? 'Dívidas simplificadas' : 'Dívidas por simplificar', 'success');
      onGroupUpdated();
    } catch {
      showToast('Erro ao alterar estado', 'error');
    }
  };

  const handleRegenerateInvite = async () => {
    if (!(await confirmAction({
      title: 'Gerar novo código de convite?',
      description: 'O anterior deixa de funcionar.',
      tone: 'warning',
      confirmLabel: 'Gerar novo código',
    }))) return;
    try {
      await groupsApi.regenerateInviteCode(groupId);
      showToast('Novo código gerado', 'success');
      onGroupUpdated();
    } catch {
      showToast('Erro ao gerar código', 'error');
    }
  };

  const handleDeleteGroup = async () => {
    setDeleting(true);
    try {
      await groupsApi.delete(groupId);
      showToast('Grupo eliminado', 'success');
      navStart();
      router.push('/groups');
    } catch (error) {
      console.error('Error deleting group:', error);
      showToast('Erro ao eliminar grupo', 'error');
    } finally {
      setDeleting(false);
      setDeleteStep('none');
      setDeleteNameInput('');
    }
  };

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/invite/${group.invite_code}`
      : `/invite/${group.invite_code}`;

  const buildInviteShareMessage = () =>
    `Estás mais que convidado para entrar no grupo ${group.name}. Aceita o convite e começa a fazer os teus pedidos: ${inviteUrl}`;

  const handleShareInvite = async () => {
    const message = buildInviteShareMessage();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Convite — ${group.name}`,
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

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* Group profile */}
      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Grupo</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              Nome e imagem visíveis para todos os membros
            </p>
          </div>
          {!isEditingProfile && (
            <button
              type="button"
              onClick={() => {
                resetProfileDraft();
                setIsEditingProfile(true);
              }}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
            >
              <Icon name="edit" className="text-[18px]" />
              Editar
            </button>
          )}
        </div>

        {!isEditingProfile ? (
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'w-20 h-20 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center border-2',
                viewImageUrl
                  ? 'bg-[var(--bg-tertiary)] border-[var(--border)]'
                  : 'bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800'
              )}
            >
              {viewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={viewImageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl">{displayEmoji}</span>
              )}
            </div>
            <p className="text-xl font-bold text-[var(--text-primary)] break-words min-w-0">
              {group.name}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
              <div className="relative shrink-0">
                <div
                  className={cn(
                    'w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center border-2',
                    editImagePreviewUrl
                      ? 'bg-[var(--bg-tertiary)] border-[var(--border)]'
                      : 'bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800'
                  )}
                >
                  {editImagePreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editImagePreviewUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-5xl">{selectedEmoji}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handlePickGallery}
                  className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-primary-600 text-white shadow-md flex items-center justify-center hover:bg-primary-700 transition-colors border-2 border-surface"
                  title="Escolher da galeria"
                >
                  <Icon name="photo_library" className="text-[18px]" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleGalleryChange}
                />
              </div>

              <div className="flex-1 w-full">
                <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                  Nome
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-secondary)] focus:border-primary-500 focus:ring-0 outline-none text-[var(--text-primary)]"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                Emojis
              </p>
              <div className="flex flex-wrap gap-2">
                {GROUP_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleSelectEmoji(emoji)}
                    className={cn(
                      'w-12 h-12 rounded-xl text-2xl flex items-center justify-center transition border',
                      selectedEmoji === emoji && !galleryFile
                        ? 'bg-primary-100 dark:bg-primary-900/40 border-primary-500 ring-2 ring-primary-500/20 scale-105'
                        : 'bg-[var(--bg-secondary)] border-[var(--border)] hover:bg-[var(--bg-tertiary)]'
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={savingProfile || !profileDirty || !editName.trim()}
                className="btn btn-primary px-5 py-2.5 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingProfile ? (
                  <>
                    <LoadingSpinner size="sm" />
                    A guardar...
                  </>
                ) : (
                  'Guardar'
                )}
              </button>
              <button
                type="button"
                disabled={savingProfile}
                onClick={() => {
                  resetProfileDraft();
                  setIsEditingProfile(false);
                }}
                className="px-5 py-2.5 rounded-xl border border-[var(--border)] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </section>

      {/* Membros — combinação das antigas abas "Membros" e "Definições" */}
      <section className="card p-5 space-y-4">
        <h2 className="text-lg font-bold text-ink">Membros ({members.length})</h2>
        <div className="space-y-3">
          {members.map((member) => {
            const isMemberAdmin = group.admins.includes(member.id);
            const isMemberCreator = group.creator === member.id;
            const netCents = ledger ? ledger.net[canonicalPartyId(member.id, ledger.parties)] ?? 0 : 0;

            return (
              <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface p-3">
                <Avatar name={member.name} src={getUserAvatarUrl(member.id, member.avatar)} />
                {/* Saldo por baixo do nome, não numa coluna à parte: nome +
                    papel + saldo + botões de admin não cabiam numa linha de
                    telemóvel — o nome ficava "H…" e o badge sobrepunha-se ao
                    valor (Fase 15). */}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink flex items-center gap-2 min-w-0">
                    <span className="truncate min-w-0">{member.name}</span>
                    {isMemberCreator && <Badge variant="warning" className="shrink-0">Dono</Badge>}
                    {isMemberAdmin && !isMemberCreator && <Badge variant="info" className="shrink-0">Admin</Badge>}
                  </p>
                  {ledger && <GroupNetBalance netCents={netCents} inline />}
                  {member.email && <p className="text-xs text-ink-faint truncate">{member.email}</p>}
                </div>

                {currentUserId !== member.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    {isCreator && (
                      isMemberAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleDemoteMember(member.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-surface-sunken text-ink-soft hover:text-ink transition-colors"
                          title="Remover privilégios de admin"
                        >
                          <Icon name="keyboard_arrow_down" className="text-sm" /> Admin
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePromoteMember(member.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900 transition-colors"
                          title="Promover a admin"
                        >
                          <Icon name="keyboard_arrow_up" className="text-sm" /> Admin
                        </button>
                      )
                    )}
                    {(!isMemberCreator && (isCreator || !isMemberAdmin)) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.id)}
                        className="p-1.5 rounded-lg text-danger hover:bg-danger-bg transition-colors"
                        title="Remover do grupo"
                      >
                        <Icon name="close" className="text-base" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Invite */}
      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Icon name="link" className="text-primary-600 text-xl" />
              Convites
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Partilha o link para novos membros entrarem no grupo
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleInvite(!group.invite_active)}
            className={cn(
              'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
              group.invite_active ? 'bg-primary-600' : 'bg-hairline-strong'
            )}
            role="switch"
            aria-checked={group.invite_active}
            aria-label="Link de convite ativo"
          >
            <span
              className={cn(
                'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ml-1',
                group.invite_active && 'translate-x-5'
              )}
            />
          </button>
        </div>

        {group.invite_active ? (
          <>
            <code className="block w-full px-3 py-2.5 rounded-xl text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-secondary)] truncate">
              {inviteUrl}
            </code>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteUrl);
                  showToast('Link copiado!', 'success');
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <Icon name="content_copy" className="text-[18px]" />
                Copiar link
              </button>
              <button
                type="button"
                onClick={() => void handleShareInvite()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
              >
                <Icon name="share" className="text-[18px]" />
                Partilhar
              </button>
            </div>
            <button
              type="button"
              onClick={handleRegenerateInvite}
              className="text-sm text-warning-fg hover:underline font-medium"
            >
              Gerar novo código
            </button>
          </>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Convites desativados — ativa para partilhar o link.
          </p>
        )}
      </section>

      {/* Order visibility */}
      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Icon name="visibility" className="text-primary-600 text-xl" />
              Pedidos de todos
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Permite que os membros vejam os pedidos uns dos outros nas viagens
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleShowAllOrders(!group.show_all_orders)}
            className={cn(
              'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
              group.show_all_orders ? 'bg-primary-600' : 'bg-hairline-strong'
            )}
            role="switch"
            aria-checked={!!group.show_all_orders}
            aria-label="Pedidos de todos"
          >
            <span
              className={cn(
                'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ml-1',
                group.show_all_orders && 'translate-x-5'
              )}
            />
          </button>
        </div>
      </section>

      {/* Simplify debts */}
      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Icon name="calculate" className="text-primary-600 text-xl" />
              Simplificar dívidas
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Reduz o número de pagamentos necessários — nunca muda quanto cada pessoa deve no total.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleSimplifyDebts(!(group.simplify_debts ?? true))}
            className={cn(
              'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
              (group.simplify_debts ?? true) ? 'bg-primary-600' : 'bg-hairline-strong'
            )}
            role="switch"
            aria-checked={group.simplify_debts ?? true}
            aria-label="Simplificar dívidas"
          >
            <span
              className={cn(
                'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ml-1',
                (group.simplify_debts ?? true) && 'translate-x-5'
              )}
            />
          </button>
        </div>
      </section>

      {/* Membros sem conta — reclamar/renomear/remover placeholders */}
      {unclaimedPlaceholders.length > 0 && (
        <section className="card p-5 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Icon name="person" className="text-primary-600 text-xl" />
              Membros sem conta
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Nomes de despesas antigas ou importadas — associa-os a um membro real quando a pessoa entrar na app.
            </p>
          </div>
          <ul className="divide-y divide-hairline">
            {unclaimedPlaceholders.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={p.name} size="sm" />
                {renamingId === p.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => saveRename(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(p);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-hairline-strong bg-surface text-sm"
                  />
                ) : (
                  <span className="flex-1 min-w-0 font-medium text-ink truncate">{p.name}</span>
                )}
                <Badge variant="neutral">Sem conta</Badge>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startRename(p)}
                    disabled={busyPlaceholderId === p.id}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-sunken text-ink-faint"
                    aria-label="Renomear"
                  >
                    <Icon name="edit" className="text-base" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setClaimTarget(p)}
                    disabled={busyPlaceholderId === p.id || members.length === 0}
                    className="px-2.5 h-8 flex items-center rounded-lg text-xs font-semibold bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300 disabled:opacity-40"
                  >
                    Associar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemovePlaceholder(p)}
                    disabled={busyPlaceholderId === p.id}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-danger-bg text-ink-faint hover:text-danger-fg"
                    aria-label="Remover"
                  >
                    <Icon name="delete_outline" className="text-base" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ClaimPlaceholderSheet
        isOpen={!!claimTarget}
        onClose={() => setClaimTarget(null)}
        placeholder={claimTarget}
        members={members}
        onClaimed={() => {}}
      />

      {/* Delete — owner only */}
      {isCreator && (
        <section className="card p-5 border-danger-fg/25 bg-danger-bg/30 space-y-3">
          <div>
            <h2 className="text-lg font-bold text-danger-fg flex items-center gap-2">
              <Icon name="warning" className="text-xl" />
              Zona de perigo
            </h2>
            <p className="text-sm text-danger-fg/90 mt-1">
              Eliminar o grupo apaga viagens, pedidos e divisões. Só o dono pode
              fazer isto.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDeleteNameInput('');
              setDeleteStep('name');
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-danger text-white hover:brightness-110 text-sm font-semibold transition-colors"
          >
            Eliminar grupo
          </button>
        </section>
      )}

      {/* Delete step 1: type name */}
      <Sheet
        isOpen={deleteStep === 'name'}
        onClose={() => setDeleteStep('none')}
        title="Eliminar grupo"
        subtitle="Esta ação é irreversível"
        size="medium"
        footer={
          <button
            type="button"
            disabled={!nameMatches}
            onClick={() => setDeleteStep('confirm')}
            className="w-full py-3.5 btn bg-danger text-white hover:brightness-110 font-semibold disabled:opacity-50"
          >
            Continuar
          </button>
        }
      >
        <div className="space-y-4 pb-2">
          <p className="text-sm text-[var(--text-secondary)]">
            Para confirmar, escreve o nome do grupo exatamente como aparece:
          </p>
          <p className="font-bold text-[var(--text-primary)] px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]">
            {group.name}
          </p>
          <input
            type="text"
            value={deleteNameInput}
            onChange={(e) => setDeleteNameInput(e.target.value)}
            placeholder="Nome do grupo"
            className="w-full px-4 py-3 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-secondary)] focus:border-danger focus:ring-0 outline-none"
            autoFocus
          />
        </div>
      </Sheet>

      {/* Delete step 2: a sheet dedicada já É a confirmação final — sem diálogo
          extra por cima (era um `confirm()` nativo redundante). */}
      <Sheet
        isOpen={deleteStep === 'confirm'}
        onClose={() => setDeleteStep('none')}
        title="Última confirmação"
        size="medium"
        footer={
          <div className="flex gap-3 w-full">
            <button
              type="button"
              onClick={() => setDeleteStep('name')}
              className="flex-1 py-3.5 rounded-xl border border-[var(--border)] font-semibold text-[var(--text-primary)]"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleDeleteGroup()}
              className="flex-1 py-3.5 rounded-full bg-danger text-white hover:brightness-110 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {deleting ? (
                <>
                  <LoadingSpinner size="sm" />
                  A eliminar...
                </>
              ) : (
                'Eliminar definitivamente'
              )}
            </button>
          </div>
        }
      >
        <p className="text-sm text-[var(--text-secondary)] pb-4">
          Vais eliminar <strong className="text-[var(--text-primary)]">{group.name}</strong> e
          todos os dados associados. Esta ação não pode ser desfeita.
        </p>
      </Sheet>
    </div>
  );
}
