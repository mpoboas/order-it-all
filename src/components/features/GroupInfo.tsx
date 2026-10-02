'use client';

import { useMemo, useState } from 'react';
import type { Group, Placeholder } from '@/lib/types';
import { groupsApi, placeholdersApi } from '@/lib/pocketbase';
import { db } from '@/lib/db/schema';
import { optimisticEdit, mutationErrorMessage } from '@/lib/db/mutations';
import { useExpenses, usePlaceholders, useSplits, useTrips } from '@/lib/db/hooks';
import { groupMembersFromExpand } from '@/lib/parties';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { getGroupAvatarUrl, guessGroupEmoji, isGroupImageAvatar } from '@/lib/groupAvatars';
import { placeholderRemovalBlock, removalBlockMessage, userRemovalBlock, type RemovalBlock } from '@/lib/memberGuards';
import { formatEUR } from '@/lib/money';
import { fromCents } from '@/lib/ledger/money';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { BrandBand } from '@/components/layout/BrandBand';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Switch } from '@/components/ui/Switch';
import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { SettingsRow, SettingsSection } from '@/components/ui/SettingsList';
import { ClaimPlaceholderSheet } from '@/components/features/ClaimPlaceholderSheet';
import { GroupEditSheet } from '@/components/features/group-info/GroupEditSheet';
import { InviteSheet, inviteUrlFor, shareInvite } from '@/components/features/group-info/InviteSheet';
import { NameSheet } from '@/components/features/group-info/NameSheet';

type Entry =
    | { kind: 'user'; id: string; name: string; avatar?: string; role: 'creator' | 'admin' | 'member'; isSelf: boolean }
    | { kind: 'placeholder'; id: string; name: string; placeholder: Placeholder };

const ROLE_ORDER = { creator: 0, admin: 1, member: 2 } as const;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt');
const eur = (cents: number) => formatEUR(fromCents(cents));

/**
 * Definições do grupo (Fase A do redesign) — antes só para
 * admins e feita de uma torre de cartões. Agora é uma lista agrupada estilo
 * Definições do iOS / "Info do grupo" do WhatsApp, aberta a TODOS os membros:
 *  - identidade do grupo numa faixa da marca (editar: admins);
 *  - UMA lista de membros — com conta e sem conta juntos, nomes inteiros; as
 *    ações de cada um ficam atrás de um toque (folha de ações), em vez dos
 *    botões "Admin"/"✕" repetidos em cada linha;
 *  - "Convidar pessoas" e "Adicionar pessoa sem conta" (só o nome — padrão
 *    Splitwise) no topo da lista;
 *  - preferências (admins) e, no fim, sair / eliminar.
 * Proteção: ninguém sai nem é removido sem as contas fechadas (saldo zero,
 * sem pedidos em viagens abertas) — `src/lib/memberGuards.ts`, imposta também
 * no servidor (`/api/groups/[groupId]/members/[userId]`).
 */
export function GroupInfo({
    group,
    isAdmin,
    isCreator,
    currentUserId,
    onGroupUpdated,
}: {
    group: Group;
    isAdmin: boolean;
    isCreator: boolean;
    currentUserId?: string;
    onGroupUpdated: () => void;
}) {
    const groupId = group.id;
    const nav = useAppNavigate();
    const { showToast } = useToast();
    const confirmAction = useConfirm();

    const placeholders = usePlaceholders(groupId);
    const expenses = useExpenses(groupId);
    const trips = useTrips(groupId);
    const splits = useSplits(groupId);

    const [editOpen, setEditOpen] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<Placeholder | null>(null);
    const [claimTarget, setClaimTarget] = useState<Placeholder | null>(null);
    const [actionTarget, setActionTarget] = useState<Entry | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteName, setDeleteName] = useState('');
    const [deleting, setDeleting] = useState(false);

    const users = groupMembersFromExpand(group);
    const unclaimed = useMemo(() => (placeholders ?? []).filter((p) => !p.claimed_by), [placeholders]);

    const entries: Entry[] = useMemo(() => {
        const people: Entry[] = users
            .map((u): Entry => ({
                kind: 'user',
                id: u.id,
                name: u.name || u.username || 'Sem nome',
                avatar: getUserAvatarUrl(u.id, u.avatar),
                role: u.id === group.creator ? 'creator' : group.admins.includes(u.id) ? 'admin' : 'member',
                isSelf: u.id === currentUserId,
            }))
            .sort((a, b) => {
                if (a.kind !== 'user' || b.kind !== 'user') return 0;
                return ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || byName(a, b);
            });
        const guests: Entry[] = [...unclaimed]
            .sort(byName)
            .map((p) => ({ kind: 'placeholder', id: p.id, name: p.name, placeholder: p }));
        return [...people, ...guests];
    }, [users, unclaimed, group.creator, group.admins, currentUserId]);

    const takenNames = useMemo(
        () => new Set(entries.map((e) => e.name.trim().toLowerCase())),
        [entries],
    );

    // --- Proteções ----------------------------------------------------------

    /** Porque é que este utilizador não pode sair / ser removido — com os
     *  pedidos das viagens abertas lidos da cache local na hora. */
    const userBlock = async (userId: string): Promise<RemovalBlock | null> => {
        const openTripIds = (trips ?? []).filter((t) => t.status !== 'closed').map((t) => t.id);
        const orders = openTripIds.length ? await db.orders.where('trip_id').anyOf(openTripIds).toArray() : [];
        return userRemovalBlock({
            userId,
            expenses: expenses ?? [],
            placeholders: placeholders ?? [],
            trips: trips ?? [],
            orders,
        });
    };

    /** Explica o bloqueio e leva ao sítio onde se resolve (Saldos/Viagens). */
    const explainBlock = async (block: RemovalBlock, name: string, self: boolean) => {
        const goTo = block.reason === 'balance' ? 'balances' : block.reason === 'orders' ? 'trips' : null;
        const go = await confirmAction({
            title: self ? 'Ainda não podes sair' : `Não dá para remover ${name}`,
            description: removalBlockMessage(block, name, self, eur),
            tone: 'warning',
            confirmLabel: goTo === 'balances' ? 'Ver saldos' : goTo === 'trips' ? 'Ver viagens' : 'Percebi',
            cancelLabel: 'Fechar',
        });
        if (go && goTo) {
            nav.push(goTo === 'balances' ? `/groups/${groupId}/expenses?abrir=saldos` : `/groups/${groupId}/trips`, {
                haptic: false,
            });
        }
    };

    const isBlockError = (error: unknown): RemovalBlock | null =>
        (error as { status?: number; block?: RemovalBlock })?.status === 409
            ? ((error as { block?: RemovalBlock }).block ?? null)
            : null;

    // --- Ações sobre membros com conta -----------------------------------------

    const editMembers = async (patch: Partial<Group>, commit: () => Promise<unknown>, errMsg: string) => {
        try {
            await optimisticEdit({ table: db.groups, id: groupId, patch, commit });
            onGroupUpdated();
        } catch (error) {
            showToast(mutationErrorMessage(error, errMsg), 'error');
        }
    };

    const setAdmin = async (entry: Extract<Entry, { kind: 'user' }>, admin: boolean) => {
        if (
            !(await confirmAction(
                admin
                    ? {
                          title: `Tornar ${entry.name} admin?`,
                          description: 'Pode convidar pessoas, gerir membros e mudar as preferências do grupo.',
                          confirmLabel: 'Tornar admin',
                      }
                    : { title: `Retirar admin a ${entry.name}?`, tone: 'warning', confirmLabel: 'Retirar admin' },
            ))
        )
            return;
        await editMembers(
            { admins: admin ? [...group.admins, entry.id] : group.admins.filter((id) => id !== entry.id) },
            () => (admin ? groupsApi.promoteToAdmin(groupId, entry.id) : groupsApi.demoteFromAdmin(groupId, entry.id)),
            admin ? 'Erro ao tornar admin' : 'Erro ao retirar admin',
        );
    };

    const removeUser = async (entry: Extract<Entry, { kind: 'user' }>) => {
        const block = await userBlock(entry.id);
        if (block) return explainBlock(block, entry.name, false);
        if (
            !(await confirmAction({
                title: `Remover ${entry.name} do grupo?`,
                description: 'Deixa de ver as despesas e viagens do grupo. Pode voltar a entrar com um convite.',
                tone: 'danger',
                confirmLabel: 'Remover',
            }))
        )
            return;
        try {
            await optimisticEdit({
                table: db.groups,
                id: groupId,
                patch: {
                    members: group.members.filter((id) => id !== entry.id),
                    admins: group.admins.filter((id) => id !== entry.id),
                },
                commit: () => groupsApi.removeMember(groupId, entry.id),
            });
            showToast(`${entry.name} saiu do grupo`, 'success');
            onGroupUpdated();
        } catch (error) {
            const serverBlock = isBlockError(error);
            if (serverBlock) return explainBlock(serverBlock, entry.name, false);
            showToast(mutationErrorMessage(error, 'Erro ao remover'), 'error');
        }
    };

    const leaveGroup = async () => {
        if (!currentUserId) return;
        const block = await userBlock(currentUserId);
        if (block) return explainBlock(block, '', true);
        if (
            !(await confirmAction({
                title: `Sair de ${group.name}?`,
                description: 'Deixas de ver as despesas e viagens do grupo. Podes voltar a entrar com um convite.',
                tone: 'danger',
                confirmLabel: 'Sair do grupo',
            }))
        )
            return;
        try {
            await groupsApi.removeMember(groupId, currentUserId);
            await db.groups.delete(groupId);
            showToast(`Saíste de ${group.name}`, 'success');
            nav.replace('/groups', { haptic: false });
        } catch (error) {
            const serverBlock = isBlockError(error);
            if (serverBlock) return explainBlock(serverBlock, '', true);
            showToast(mutationErrorMessage(error, 'Erro ao sair do grupo'), 'error');
        }
    };

    // --- Ações sobre pessoas sem conta ------------------------------------------

    const addPlaceholder = async (name: string) => {
        if (!currentUserId) return;
        try {
            const created = await placeholdersApi.create({ group_id: groupId, name, created_by: currentUserId });
            await db.placeholders.put(created);
            showToast(`${name} adicionado ao grupo`, 'success');
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao adicionar'), 'error');
            throw error;
        }
    };

    const renamePlaceholder = async (p: Placeholder, name: string) => {
        try {
            const updated = await placeholdersApi.rename(p.id, name);
            await db.placeholders.put(updated);
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao mudar o nome'), 'error');
            throw error;
        }
    };

    const removePlaceholder = async (p: Placeholder) => {
        const block = placeholderRemovalBlock({ placeholderId: p.id, expenses: expenses ?? [], splits: splits ?? [] });
        if (block) {
            const associate = await confirmAction({
                title: `Não dá para remover ${p.name}`,
                description: removalBlockMessage(block, p.name, false, eur),
                tone: 'warning',
                confirmLabel: users.length > 0 ? 'Associar a uma conta' : 'Percebi',
                cancelLabel: 'Fechar',
            });
            if (associate && users.length > 0) setClaimTarget(p);
            return;
        }
        if (!(await confirmAction({ title: `Remover ${p.name}?`, tone: 'danger', confirmLabel: 'Remover' }))) return;
        try {
            await placeholdersApi.delete(p.id);
            await db.placeholders.delete(p.id);
            showToast(`${p.name} removido`, 'success');
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Erro ao remover'), 'error');
        }
    };

    const sendPersonalInvite = async (p: Placeholder) => {
        if (!group.invite_active) {
            showToast('Liga o link de convite primeiro (Convidar pessoas)', 'error');
            return;
        }
        await shareInvite(
            {
                title: `Convite para ${group.name}`,
                text: `Olá ${p.name}! Já estás nas contas do grupo ${group.name} no Order It. Entra por aqui para veres as tuas despesas: ${inviteUrlFor(group, p.id)}`,
            },
            showToast,
        );
    };

    // --- Folha de ações ------------------------------------------------------------

    const actionsFor = (entry: Entry): SheetAction[] => {
        if (!isAdmin) return [];
        if (entry.kind === 'placeholder') {
            const p = entry.placeholder;
            return [
                { icon: 'send', label: 'Enviar convite pessoal', onSelect: () => void sendPersonalInvite(p) },
                { icon: 'edit', label: 'Mudar nome', onSelect: () => setRenameTarget(p) },
                {
                    icon: 'link',
                    label: 'Associar a uma conta',
                    onSelect: () => setClaimTarget(p),
                    hidden: users.length === 0,
                },
                { icon: 'delete_outline', label: 'Remover', tone: 'danger', onSelect: () => void removePlaceholder(p) },
            ];
        }
        if (entry.isSelf || entry.role === 'creator') return [];
        return [
            {
                icon: 'admin_panel_settings',
                label: entry.role === 'admin' ? 'Retirar admin' : 'Tornar admin',
                onSelect: () => void setAdmin(entry, entry.role !== 'admin'),
                hidden: !isCreator,
            },
            {
                icon: 'logout',
                label: 'Remover do grupo',
                tone: 'danger',
                onSelect: () => void removeUser(entry),
                hidden: entry.role === 'admin' && !isCreator,
            },
        ];
    };

    const sublabelFor = (entry: Entry): string | undefined => {
        if (entry.kind === 'placeholder') return 'Sem conta';
        const parts = [entry.isSelf && 'Tu', entry.role === 'creator' ? 'Dono' : entry.role === 'admin' ? 'Admin' : null];
        return parts.filter(Boolean).join(' · ') || undefined;
    };

    // --- Preferências ----------------------------------------------------------------

    const toggle = async (fn: () => Promise<unknown>, errMsg: string) => {
        try {
            await fn();
            onGroupUpdated();
        } catch {
            showToast(errMsg, 'error');
        }
    };

    const setSimplify = async (on: boolean) => {
        if (
            !on &&
            !(await confirmAction({
                title: 'Desligar "Simplificar dívidas"?',
                description: 'Os saldos passam a mostrar quem deve a quem em cada despesa, sem os juntar.',
                tone: 'warning',
                confirmLabel: 'Desligar',
            }))
        )
            return;
        await toggle(() => groupsApi.toggleSimplifyDebts(groupId, on), 'Erro ao alterar a preferência');
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await groupsApi.delete(groupId);
            showToast('Grupo eliminado', 'success');
            nav.replace('/groups', { haptic: false });
        } catch (error) {
            console.error('Error deleting group:', error);
            showToast('Erro ao eliminar o grupo', 'error');
            setDeleting(false);
        }
    };

    // --- Ecrã ---------------------------------------------------------------------------

    const imageUrl = isGroupImageAvatar(group.avatar) ? getGroupAvatarUrl(groupId, group.avatar) : null;
    const memberCount = users.length;

    return (
        <>
            <BrandBand>
                <div className="flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-3xl overflow-hidden bg-white/20 border border-white/30 shadow-lg flex items-center justify-center">
                        {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- ficheiro do PocketBase
                            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-4xl">{guessGroupEmoji(group.avatar)}</span>
                        )}
                    </div>
                    <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink text-balance">{group.name}</h1>
                    <p className="text-sm text-ink-soft">
                        {memberCount} {memberCount === 1 ? 'membro' : 'membros'}
                        {unclaimed.length > 0 && ` · ${unclaimed.length} sem conta`}
                    </p>
                    {isAdmin && (
                        <Button variant="inverse" size="sm" className="mt-3" onClick={() => setEditOpen(true)}>
                            <Icon name="edit" className="text-base" />
                            Editar
                        </Button>
                    )}
                </div>
            </BrandBand>

            <main className="container mx-auto max-w-lg px-4 pt-6 pb-16 space-y-7">
                <SettingsSection title={`Membros · ${entries.length}`}>
                    {(isAdmin || group.invite_active) && (
                        <SettingsRow icon="person_add" label="Convidar pessoas" tone="brand" onClick={() => setInviteOpen(true)} />
                    )}
                    {isAdmin && (
                        <SettingsRow
                            icon="add"
                            label="Adicionar pessoa sem conta"
                            sublabel="Para dividir despesas com quem não usa a app"
                            tone="brand"
                            onClick={() => setAddOpen(true)}
                        />
                    )}
                    {entries.map((entry) => {
                        const hasActions = actionsFor(entry).some((a) => !a.hidden);
                        return (
                            <SettingsRow
                                key={`${entry.kind}-${entry.id}`}
                                leading={
                                    <Avatar
                                        name={entry.name}
                                        src={entry.kind === 'user' ? entry.avatar : undefined}
                                        size="md"
                                        className={entry.kind === 'placeholder' ? 'opacity-80' : undefined}
                                    />
                                }
                                label={entry.name}
                                sublabel={sublabelFor(entry)}
                                trailing={hasActions ? <Icon name="more_horiz" className="text-xl text-ink-faint shrink-0" /> : <span />}
                                onClick={hasActions ? () => setActionTarget(entry) : undefined}
                            />
                        );
                    })}
                </SettingsSection>

                {isAdmin && (
                    <SettingsSection title="Preferências">
                        <SettingsRow
                            icon="calculate"
                            label="Simplificar dívidas"
                            sublabel="Menos pagamentos para acertar. O total de cada um não muda."
                            trailing={
                                <Switch checked={group.simplify_debts ?? true} onChange={setSimplify} label="Simplificar dívidas" />
                            }
                        />
                        <SettingsRow
                            icon="visibility"
                            label="Ver os pedidos de todos"
                            sublabel="Nas viagens, cada um vê o que os outros pediram"
                            trailing={
                                <Switch
                                    checked={!!group.show_all_orders}
                                    onChange={(on) => toggle(() => groupsApi.toggleShowAllOrders(groupId, on), 'Erro ao alterar a preferência')}
                                    label="Ver os pedidos de todos"
                                />
                            }
                        />
                    </SettingsSection>
                )}

                <SettingsSection
                    footer={
                        isCreator
                            ? 'Eliminar apaga todas as despesas, viagens e pedidos do grupo, para todos.'
                            : 'Para sair, o teu saldo neste grupo tem de estar a zero.'
                    }
                >
                    {!isCreator && <SettingsRow icon="logout" label="Sair do grupo" tone="danger" onClick={() => void leaveGroup()} />}
                    {isCreator && (
                        <SettingsRow
                            icon="delete_outline"
                            label="Eliminar grupo"
                            tone="danger"
                            onClick={() => {
                                setDeleteName('');
                                setDeleteOpen(true);
                            }}
                        />
                    )}
                </SettingsSection>
            </main>

            <ActionSheet
                isOpen={!!actionTarget}
                onClose={() => setActionTarget(null)}
                title={actionTarget?.name ?? ''}
                actions={actionTarget ? actionsFor(actionTarget) : []}
            />

            <GroupEditSheet isOpen={editOpen} onClose={() => setEditOpen(false)} group={group} onSaved={onGroupUpdated} />

            <InviteSheet
                isOpen={inviteOpen}
                onClose={() => setInviteOpen(false)}
                group={group}
                isAdmin={isAdmin}
                onChanged={onGroupUpdated}
            />

            <NameSheet
                isOpen={addOpen}
                onClose={() => setAddOpen(false)}
                title="Adicionar pessoa sem conta"
                description="Aparece nas despesas e nos saldos como qualquer membro. Quando entrar na app, liga-se à conta dela."
                confirmLabel="Adicionar"
                validate={(name) => (takenNames.has(name.toLowerCase()) ? 'Já há alguém com este nome no grupo' : undefined)}
                onSubmit={addPlaceholder}
            />

            <NameSheet
                isOpen={!!renameTarget}
                onClose={() => setRenameTarget(null)}
                title="Mudar nome"
                initialValue={renameTarget?.name ?? ''}
                confirmLabel="Guardar"
                validate={(name) =>
                    name.toLowerCase() !== renameTarget?.name.trim().toLowerCase() && takenNames.has(name.toLowerCase())
                        ? 'Já há alguém com este nome no grupo'
                        : undefined
                }
                onSubmit={(name) => (renameTarget ? renamePlaceholder(renameTarget, name) : Promise.resolve())}
            />

            <ClaimPlaceholderSheet
                isOpen={!!claimTarget}
                onClose={() => setClaimTarget(null)}
                placeholder={claimTarget}
                members={users}
                onClaimed={() => {}}
            />

            <Sheet
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                title="Eliminar grupo"
                subtitle="Esta ação não pode ser desfeita"
                size="auto"
                footer={
                    <Button
                        variant="danger"
                        size="lg"
                        block
                        loading={deleting}
                        disabled={deleteName.trim() !== group.name.trim()}
                        onClick={() => void handleDelete()}
                    >
                        Eliminar definitivamente
                    </Button>
                }
            >
                <div className="space-y-3">
                    <p className="text-sm text-ink-soft">
                        Apaga <strong className="text-ink">{group.name}</strong> e todas as despesas, viagens e pedidos, para todos os
                        membros. Para confirmar, escreve o nome do grupo:
                    </p>
                    <Input value={deleteName} onChange={(e) => setDeleteName(e.target.value)} placeholder={group.name} autoFocus />
                </div>
            </Sheet>
        </>
    );
}
