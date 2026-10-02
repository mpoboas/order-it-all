'use client';

import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/components/ui/Icon';
import { groupsApi } from '@/lib/pocketbase';
import { GROUP_EMOJIS, getGroupAvatarUrl, guessGroupEmoji, isGroupImageAvatar } from '@/lib/groupAvatars';
import { cn, emojiToImageBlob } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';
import type { Group } from '@/lib/types';

/** Editar nome e imagem do grupo (só admins) — numa folha, em vez do antigo
 *  "modo de edição" inline que empurrava o resto da página. */
export function GroupEditSheet({
    isOpen,
    onClose,
    group,
    onSaved,
}: {
    isOpen: boolean;
    onClose: () => void;
    group: Group;
    onSaved: () => void;
}) {
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(group.name);
    const [emoji, setEmoji] = useState(() => guessGroupEmoji(group.avatar));
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Rascunho novo sempre que a folha abre (ou o grupo muda por baixo).
    useEffect(() => {
        if (!isOpen) return;
        setName(group.name);
        setEmoji(guessGroupEmoji(group.avatar));
        setFile(null);
        setPreview(null);
    }, [isOpen, group.name, group.avatar]);

    useEffect(() => () => {
        if (preview) URL.revokeObjectURL(preview);
    }, [preview]);

    const storedImage = isGroupImageAvatar(group.avatar) ? getGroupAvatarUrl(group.id, group.avatar) : null;
    const emojiChanged = emoji !== guessGroupEmoji(group.avatar);
    const imageUrl = preview || (storedImage && !file && !emojiChanged ? storedImage : null);
    const dirty = name.trim() !== group.name.trim() || !!file || emojiChanged;

    const pickEmoji = (e: string) => {
        setEmoji(e);
        setFile(null);
        setPreview(null);
    };

    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (!f.type.startsWith('image/')) {
            showToast('Escolhe uma imagem válida', 'error');
            return;
        }
        setFile(f);
        setPreview(URL.createObjectURL(f));
    };

    const save = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setSaving(true);
        try {
            const avatar = file ?? (emojiChanged ? await emojiToImageBlob(emoji) : undefined);
            await groupsApi.update(group.id, { name: trimmed, ...(avatar ? { avatar } : {}) });
            onSaved();
            onClose();
        } catch (error) {
            console.error('Error updating group:', error);
            showToast('Erro ao guardar o grupo', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet
            isOpen={isOpen}
            onClose={onClose}
            title="Editar grupo"
            size="large"
            footer={
                <Button size="lg" block loading={saving} disabled={!dirty || !name.trim()} onClick={save}>
                    Guardar
                </Button>
            }
        >
            <div className="space-y-6">
                <div className="flex flex-col items-center gap-3">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="relative w-24 h-24 rounded-3xl overflow-hidden bg-primary-50 dark:bg-primary-950 border border-hairline shadow-sm flex items-center justify-center"
                        aria-label="Escolher foto da galeria"
                    >
                        {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- pré-visualização local/ficheiro do PB
                            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-5xl">{emoji}</span>
                        )}
                        <span className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full btn-brand text-white flex items-center justify-center">
                            <Icon name="photo_camera" className="text-base" />
                        </span>
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                </div>

                <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />

                <div className="space-y-2">
                    <p className="text-sm font-bold text-ink">Ou um emoji</p>
                    <div className="grid grid-cols-6 gap-2">
                        {GROUP_EMOJIS.map((e) => (
                            <button
                                key={e}
                                type="button"
                                onClick={() => pickEmoji(e)}
                                className={cn(
                                    'aspect-square rounded-xl text-2xl flex items-center justify-center border transition',
                                    emoji === e && !file
                                        ? 'bg-primary-50 dark:bg-primary-950 border-primary-500 ring-2 ring-primary-500/25'
                                        : 'bg-surface-sunken border-transparent hover:border-hairline-strong',
                                )}
                                aria-pressed={emoji === e && !file}
                            >
                                {e}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </Sheet>
    );
}
