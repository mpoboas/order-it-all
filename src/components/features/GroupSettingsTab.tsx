'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { groupsApi } from '@/lib/pocketbase';
import { navStart } from '@/lib/navProgress';
import type { Group } from '@/lib/types';
import {
  GROUP_EMOJIS,
  getGroupAvatarUrl,
  guessGroupEmoji,
  isGroupImageAvatar,
} from '@/lib/groupAvatars';
import { cn, emojiToImageBlob } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import { Sheet } from '@/components/ui/Sheet';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';

interface GroupSettingsTabProps {
  group: Group;
  groupId: string;
  isCreator: boolean;
  onGroupUpdated: () => void;
}

export function GroupSettingsTab({
  group,
  groupId,
  isCreator,
  onGroupUpdated,
}: GroupSettingsTabProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleRegenerateInvite = async () => {
    if (!confirm('Gerar novo código? O anterior deixará de funcionar.')) return;
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
              <span className="material-icons text-[18px]" aria-hidden>
                edit
              </span>
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
                  className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-primary-600 text-white shadow-md flex items-center justify-center hover:bg-primary-700 transition-colors border-2 border-white dark:border-slate-900"
                  title="Escolher da galeria"
                >
                  <span className="material-icons text-[18px]" aria-hidden>
                    photo_library
                  </span>
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

      {/* Invite */}
      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span className="material-icons text-primary-600 text-xl" aria-hidden>
                link
              </span>
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
              group.invite_active ? 'bg-primary-600' : 'bg-gray-200 dark:bg-slate-700'
            )}
            aria-pressed={group.invite_active}
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
                <span className="material-icons text-[18px]" aria-hidden>
                  content_copy
                </span>
                Copiar link
              </button>
              <button
                type="button"
                onClick={() => void handleShareInvite()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
              >
                <span className="material-icons text-[18px]" aria-hidden>
                  share
                </span>
                Partilhar
              </button>
            </div>
            <button
              type="button"
              onClick={handleRegenerateInvite}
              className="text-sm text-amber-600 dark:text-amber-400 hover:underline font-medium"
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
              <span className="material-icons text-primary-600 text-xl" aria-hidden>
                visibility
              </span>
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
              group.show_all_orders ? 'bg-primary-600' : 'bg-gray-200 dark:bg-slate-700'
            )}
            aria-pressed={group.show_all_orders}
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

      {/* Delete — owner only */}
      {isCreator && (
        <section className="card p-5 border-red-200/80 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 space-y-3">
          <div>
            <h2 className="text-lg font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
              <span className="material-icons text-xl" aria-hidden>
                warning
              </span>
              Zona de perigo
            </h2>
            <p className="text-sm text-red-600/90 dark:text-red-300/90 mt-1">
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
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
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
            className="w-full py-3.5 btn bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
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
            className="w-full px-4 py-3 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-secondary)] focus:border-red-500 focus:ring-0 outline-none"
            autoFocus
          />
        </div>
      </Sheet>

      {/* Delete step 2: final confirm via native dialog triggered from sheet */}
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
              onClick={() => {
                if (!confirm('Tem mesmo a certeza?')) return;
                void handleDeleteGroup();
              }}
              className="flex-1 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
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
