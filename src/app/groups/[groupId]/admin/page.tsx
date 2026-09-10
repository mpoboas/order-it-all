'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { tripsApi, groupsApi, ordersApi, itemsApi, splitsApi } from '@/lib/pocketbase';
import type { Trip, Group } from '@/lib/types';
import { useTrips } from '@/lib/db/hooks';
import { catchUp } from '@/lib/db/sync';
import { db } from '@/lib/db/schema';
import {
    assertOnline,
    optimisticEdit,
    optimisticDelete,
    mutationErrorMessage,
} from '@/lib/db/mutations';
import { useSyncStatus } from '@/context/SyncProvider';
import { useOnline } from '@/hooks/useOnline';
import { usePrefetchRoutes } from '@/hooks/usePrefetch';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { EntityCardSkeletonGrid, PageHeaderSkeleton } from '@/components/ui/EntityCardSkeleton';
import { useToast } from '@/context/ToastContext';
import { useGroup } from '@/context/GroupContext';
import { Sheet } from '@/components/ui/Sheet';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { Input, Textarea } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import {
    getSplitParticipantNames,
    participantIdsToNames,
    isGroupDisplayLabel,
    isAggregatedOrderLabel,
} from '@/lib/orderParticipants';
import { reconcileItemLock } from '@/lib/splitItems';
import { useUser } from '@/context/UserContext';
import { TripCard } from '@/components/features/TripCard';
import { GroupSettingsTab } from '@/components/features/GroupSettingsTab';

function AdminDashboardContent() {
    const params = useParams();
    const groupId = params.groupId as string;
    const { currentGroup, isAdmin, refreshGroup } = useGroup();
    const { user } = useUser();
    const online = useOnline();
    const router = useRouter();
    const nav = useAppNavigate();
    const searchParams = useSearchParams();
    const { showToast } = useToast();

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'settings' || tab === 'members' || tab === 'trips') {
            setActiveTab(tab);
        }
    }, [searchParams]);

    // Data (local-first: cache do Dexie via SyncProvider)
    const tripsQuery = useTrips(groupId);
    const trips = tripsQuery ?? [];
    usePrefetchRoutes(trips.map((t) => `/groups/${groupId}/admin/trips/${t.id}`));
    const { groupSyncing } = useSyncStatus();
    const loading = tripsQuery === undefined || (trips.length === 0 && groupSyncing);

    // Create New Trip State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTripName, setNewTripName] = useState('');
    const [newTripDescription, setNewTripDescription] = useState('');
    const [creating, setCreating] = useState(false);

    // Edit Trip State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editTripId, setEditTripId] = useState('');
    const [editTripName, setEditTripName] = useState('');
    const [editTripDescription, setEditTripDescription] = useState('');
    const [editTripStatus, setEditTripStatus] = useState<'open' | 'in_progress' | 'closed'>('open');

    // Gerar divisão a partir de uma viagem (operação de vários segundos).
    const [splittingTripId, setSplittingTripId] = useState<string | null>(null);

    // Tab State
    const [activeTab, setActiveTab] = useState<'trips' | 'members' | 'settings'>('trips');

    useEffect(() => {
        if (!isAdmin) {
            router.push(`/groups/${groupId}/trips`);
        }
    }, [isAdmin, groupId, router]);

    const handleCreateTrip = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newTripName.trim()) return;
        setCreating(true);
        try {
            assertOnline();
            await tripsApi.create({
                name: newTripName.trim(),
                description: newTripDescription.trim(),
                group_id: groupId,
            });
            setNewTripName('');
            setNewTripDescription('');
            setShowCreateModal(false);
            void catchUp();

            // Notify Users
            await fetch('/api/notify', {
                method: 'POST',
                body: JSON.stringify({
                    groupId,
                    title: '🛍️ Está na hora de encomendar!',
                    message: `${newTripName.trim()} está disponível. Faz os teus pedidos!`,
                    url: `/groups/${groupId}/trips`
                })
            }).catch(console.error);

        } catch (error) {
            console.error('Error creating trip:', error);
            showToast(mutationErrorMessage(error, 'Falha ao criar viagem'), 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleOpenEditModal = (e: React.MouseEvent, trip: Trip) => {
        e.preventDefault();
        e.stopPropagation();
        setEditTripId(trip.id);
        setEditTripName(trip.name);
        setEditTripDescription(trip.description || '');
        setEditTripStatus(trip.status);
        setShowEditModal(true);
    };

    const validateTripClosure = async (tripId: string): Promise<boolean> => {
        try {
            const orders = await ordersApi.getByTrip(tripId);
            const promises = orders.map(o => itemsApi.getByOrder(o.id));
            const results = await Promise.all(promises);
            const allItems = results.flat();

            if (allItems.length === 0) return true; // Empty trip can be closed? User implied "items por comprar". If empty, maybe ok. Assume ok.

            const hasPending = allItems.some(i => i.found_status === 'pending');
            if (hasPending) {
                showToast('Não podes terminar a viagem com itens por comprar!', 'error');
                return false;
            }

            const hasNoPrice = allItems.filter(i => i.found_status === 'found').some(i => !i.price || i.price === 0);
            if (hasNoPrice) {
                showToast('Há itens comprados sem preço definido!', 'error');
                return false;
            }

            return true;

        } catch (error) {
            console.error("Validation error", error);
            showToast('Erro ao validar items da viagem', 'error');
            return false;
        }
    };

    const handleUpdateTrip = async (e?: React.FormEvent) => {
        e?.preventDefault();

        // Validation for Closing via Edit
        if (editTripStatus === 'closed') {
            const canClose = await validateTripClosure(editTripId);
            if (!canClose) return;
        }

        const patch = {
            name: editTripName.trim(),
            description: editTripDescription.trim(),
            status: editTripStatus,
        };
        try {
            await optimisticEdit({
                table: db.trips,
                id: editTripId,
                patch,
                commit: () => tripsApi.update(editTripId, patch),
            });
            setShowEditModal(false);
        } catch (error) {
            console.error('Error updating trip:', error);
            showToast(mutationErrorMessage(error, 'Falha ao atualizar viagem'), 'error');
        }
    };

    const handleDeleteTrip = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Tem a certeza de que quer eliminar esta viagem? Esta acção não pode ser desfeita e irá eliminar todos os pedidos e produtos associados.')) return;
        try {
            await optimisticDelete({
                table: db.trips,
                id,
                commit: () => tripsApi.delete(id),
            });
            showToast('Viagem eliminada', 'success');
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Falha ao eliminar viagem'), 'error');
        }
    };

    const handleCloseTrip = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();

        const canClose = await validateTripClosure(id);
        if (!canClose) return;

        if (!confirm('Tem a certeza de que quer terminar esta viagem? Esta acção não pode ser desfeita.')) return;
        try {
            await optimisticEdit({
                table: db.trips,
                id,
                patch: { status: 'closed' },
                commit: () => tripsApi.close(id),
            });
            showToast('Viagem terminada', 'success');
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Falha ao terminar viagem'), 'error');
        }
    };

    const handleCreateSplitFromTrip = async (e: React.MouseEvent, trip: Trip) => {
        e.preventDefault();
        e.stopPropagation();

        if (splittingTripId) return;
        if (!confirm('Gerar uma divisão de contas a partir desta viagem?')) return;

        setSplittingTripId(trip.id);
        try {
            assertOnline();

            // 1. Fetch Orders and Items
            const orders = await ordersApi.getByTrip(trip.id);

            // 2. Prepare Data Structures
            // We need a complete set of ALL participants first (Group Members + Ad-hoc names on orders)
            // This is crucial so that 'Geral' orders can be split among EVERYONE.
            const allParticipantsSet = new Set<string>();
            const memberMap = new Map<string, string>(); // ID -> Name

            // 2a. Add all registered group members (creator, admins, members)
            const groupPeople: { id: string; name: string }[] = [];
            if (currentGroup?.expand?.creator) groupPeople.push(currentGroup.expand.creator);
            if (currentGroup?.expand?.admins) groupPeople.push(...currentGroup.expand.admins);
            if (currentGroup?.expand?.members) groupPeople.push(...currentGroup.expand.members);
            const seenIds = new Set<string>();
            for (const m of groupPeople) {
                if (!m?.id || seenIds.has(m.id)) continue;
                seenIds.add(m.id);
                memberMap.set(m.id, m.name);
                allParticipantsSet.add(m.name);
            }

            // 2b. Include order participant IDs and legacy single-name orders (not aggregate labels)
            for (const order of orders) {
                if (order.participants?.length) {
                    participantIdsToNames(
                        order.participants,
                        memberMap,
                        order.expand?.participants
                    ).forEach((name) => allParticipantsSet.add(name));
                }

                const orderUserId = order.user || order.expand?.user?.id;
                if (orderUserId && memberMap.has(orderUserId)) {
                    allParticipantsSet.add(memberMap.get(orderUserId)!);
                } else if (
                    order.user_name?.trim() &&
                    !isGroupDisplayLabel(order.user_name) &&
                    !isAggregatedOrderLabel(order.user_name)
                ) {
                    allParticipantsSet.add(order.user_name.trim());
                }
            }

            // Always add creator if missing
            const creatorName = memberMap.get(user?.id || '') || user?.name || 'Eu';
            allParticipantsSet.add(creatorName);

            // Convert to array for 'Geral' usage
            const allParticipantsList = Array.from(allParticipantsSet);
            const splitItems: any[] = [];

            // 3. Process Orders and Items
            for (const order of orders) {
                let displayName = order.user_name;
                const orderUserId = order.user || order.expand?.user?.id;

                if (orderUserId && memberMap.has(orderUserId)) {
                    displayName = memberMap.get(orderUserId)!;
                }

                const items = await itemsApi.getByOrder(order.id);
                const splitNames = getSplitParticipantNames(order, memberMap, allParticipantsList);

                for (const item of items) {
                    if (item.found_status === 'found') {
                        splitItems.push(
                            reconcileItemLock(
                                {
                                    name: item.name,
                                    price: item.price,
                                    participants: splitNames,
                                },
                                allParticipantsList
                            )
                        );
                    }
                }
            }

            // 4. Create Split
            const split = await splitsApi.create({
                name: trip.name,
                description: `Gerado automaticamente a partir da viagem "${trip.name}"`,
                group_id: groupId,
                created_by: user!.id,
                participants: allParticipantsList,
                items: splitItems,
            });

            nav.push(`/groups/${groupId}/splits/${split.id}`, { haptic: false });

        } catch (error) {
            console.error('Error generating split:', error);
            showToast(mutationErrorMessage(error, 'Erro ao gerar divisão'), 'error');
        } finally {
            setSplittingTripId(null);
        }
    };

    // Member Management — patch optimista no grupo em cache; `refreshGroup`
    // confirma com o servidor.
    const editGroupMembers = async (
        patch: Partial<Group>,
        commit: () => Promise<unknown>,
        errMsg: string,
    ) => {
        try {
            await optimisticEdit({ table: db.groups, id: groupId, patch, commit });
            refreshGroup();
        } catch (error) {
            showToast(mutationErrorMessage(error, errMsg), 'error');
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        if (!confirm('Remover este membro do grupo?')) return;
        if (!currentGroup) return;
        await editGroupMembers(
            {
                members: currentGroup.members.filter((id) => id !== memberId),
                admins: currentGroup.admins.filter((id) => id !== memberId),
            },
            () => groupsApi.removeMember(groupId, memberId),
            'Erro ao remover membro',
        );
    };

    const handlePromoteMember = async (memberId: string) => {
        if (!confirm('Promover a administrador?')) return;
        if (!currentGroup) return;
        await editGroupMembers(
            { admins: [...currentGroup.admins, memberId] },
            () => groupsApi.promoteToAdmin(groupId, memberId),
            'Erro ao promover',
        );
    };

    const handleDemoteMember = async (memberId: string) => {
        if (!confirm('Remover privilégios de administrador?')) return;
        if (!currentGroup) return;
        await editGroupMembers(
            { admins: currentGroup.admins.filter((id) => id !== memberId) },
            () => groupsApi.demoteFromAdmin(groupId, memberId),
            'Erro ao despromover',
        );
    };

    if (loading || !currentGroup) {
        return (
            <div className="min-h-screen bg-app has-bottom-nav">
                <PageHeaderSkeleton />
                <main className="container mx-auto px-4 py-6 max-w-4xl">
                    <div className="h-10 w-full mb-6 rounded-xl bg-surface-sunken animate-pulse" />
                    <EntityCardSkeletonGrid count={2} className="md:grid-cols-2 lg:grid-cols-2" />
                </main>
            </div>
        );
    }

    const isCreator = currentGroup.creator === user?.id;

    return (
        <div className="min-h-screen bg-app has-bottom-nav">
            <Header title="Admin" subtitle={currentGroup.name} showBack groupId={groupId} />

            <main className="container mx-auto px-4 py-6 max-w-4xl">
                {/* Tabs */}
                <div className="flex p-1 mb-6 bg-surface-sunken rounded-xl">
                    {(['trips', 'members', 'settings'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                'flex-1 py-2 text-sm font-semibold rounded-lg transition-colors',
                                activeTab === tab
                                    ? 'bg-surface text-primary-600 dark:text-primary-400 shadow-sm'
                                    : 'text-ink-soft hover:text-ink',
                            )}
                        >
                            {tab === 'trips' ? 'Viagens' : tab === 'members' ? 'Membros' : 'Definições'}
                        </button>
                    ))}
                </div>

                {/* TRIP MANAGEMENT */}
                {activeTab === 'trips' && (
                    <div className="animate-fade-in-up">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-ink">Viagens</h2>
                            <Button size="sm" onClick={() => setShowCreateModal(true)}>
                                + Nova Viagem
                            </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            {trips.length === 0 ? (
                                <div className="col-span-full py-12 text-center text-ink-faint">
                                    <Icon name="receipt_long" className="text-4xl block mx-auto mb-2 opacity-60" />
                                    <p>Nenhuma viagem encontrada.</p>
                                </div>
                            ) : (
                                trips.map(trip => (
                                    <TripCard
                                        key={trip.id}
                                        trip={trip}
                                        href={`/groups/${groupId}/admin/trips/${trip.id}`}
                                        onClick={() => nav.push(`/groups/${groupId}/admin/trips/${trip.id}`, { haptic: false })}
                                        isAdmin={true}
                                        onEdit={handleOpenEditModal}
                                        onClose={handleCloseTrip}
                                        onDelete={handleDeleteTrip}
                                        onSplit={handleCreateSplitFromTrip}
                                        isSplitting={splittingTripId === trip.id}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* MEMBERS MANAGEMENT */}
                {activeTab === 'members' && (
                    <div className="animate-fade-in-up space-y-4">
                        <h2 className="text-xl font-bold text-ink">Membros ({currentGroup.members.length})</h2>

                        <div className="space-y-3">
                            {currentGroup.expand?.members?.map((member: { id: string; name: string; email?: string; avatar?: string }) => {
                                const isMemberAdmin = currentGroup.admins.includes(member.id);
                                const isMemberCreator = currentGroup.creator === member.id;

                                return (
                                    <div key={member.id} className="card p-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Avatar name={member.name} src={member.avatar ? `https://pb-orderit.povoas.top/api/files/users/${member.id}/${member.avatar}` : undefined} />
                                            <div className="min-w-0">
                                                <p className="font-semibold text-ink flex items-center gap-2">
                                                    <span className="truncate">{member.name}</span>
                                                    {isMemberCreator && <Badge variant="warning">Dono</Badge>}
                                                    {isMemberAdmin && !isMemberCreator && <Badge variant="info">Admin</Badge>}
                                                </p>
                                                <p className="text-xs text-ink-faint truncate">{member.email}</p>
                                            </div>
                                        </div>

                                        {user?.id !== member.id && (
                                            <div className="flex items-center gap-2 shrink-0">
                                                {isCreator && (
                                                    isMemberAdmin ? (
                                                        <button
                                                            onClick={() => handleDemoteMember(member.id)}
                                                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-surface-sunken text-ink-soft hover:text-ink transition-colors"
                                                            title="Remover privilégios de admin"
                                                        >
                                                            <Icon name="keyboard_arrow_down" className="text-sm" /> Admin
                                                        </button>
                                                    ) : (
                                                        <button
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
                    </div>
                )}

                {/* SETTINGS */}
                {activeTab === 'settings' && (
                    <GroupSettingsTab
                        group={currentGroup}
                        groupId={groupId}
                        isCreator={isCreator}
                        onGroupUpdated={refreshGroup}
                    />
                )}
            </main>


            {/* Create Trip Sheet */}
            <Sheet
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                size="medium"
                title="Nova Viagem"
                footer={
                    <div>
                        <Button
                            block
                            size="lg"
                            loading={creating}
                            disabled={!newTripName.trim() || !online}
                            onClick={() => handleCreateTrip()}
                        >
                            Criar Viagem
                        </Button>
                        {!online && (
                            <p className="mt-2 text-center text-xs text-ink-faint">
                                Sem ligação — precisas de rede para criar uma viagem.
                            </p>
                        )}
                    </div>
                }
            >
                <div className="space-y-6 pb-4">
                    <Input
                        label="Nome da Viagem"
                        value={newTripName}
                        onChange={e => setNewTripName(e.target.value)}
                        placeholder="ex. Compras de Verão"
                        autoFocus
                        required
                    />
                    <Textarea
                        label="Descrição (opcional)"
                        value={newTripDescription}
                        onChange={e => setNewTripDescription(e.target.value)}
                        rows={3}
                    />
                </div>
            </Sheet>

            {/* Edit Trip Sheet */}
            <Sheet
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                size="large"
                title="Editar Viagem"
                footer={
                    <Button block size="lg" onClick={() => handleUpdateTrip()}>
                        Guardar Alterações
                    </Button>
                }
            >
                <div className="space-y-6 pb-4">
                    <Input
                        label="Nome da Viagem"
                        value={editTripName}
                        onChange={e => setEditTripName(e.target.value)}
                        required
                    />
                    <Textarea
                        label="Descrição (opcional)"
                        value={editTripDescription}
                        onChange={e => setEditTripDescription(e.target.value)}
                        rows={3}
                    />
                    <div>
                        <label className="block text-sm font-bold text-ink mb-2">Estado</label>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { v: 'open', label: 'Aberta', on: 'border-success-fg bg-success-bg text-success-fg' },
                                { v: 'in_progress', label: 'Em compras', on: 'border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300' },
                                { v: 'closed', label: 'Terminada', on: 'border-danger bg-danger-bg text-danger-fg' },
                            ] as const).map(({ v, label, on }) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setEditTripStatus(v)}
                                    className={cn(
                                        'p-3 rounded-xl border-2 font-semibold transition text-center text-sm',
                                        editTripStatus === v
                                            ? on
                                            : 'border-hairline bg-surface text-ink-faint hover:border-hairline-strong',
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Sheet>
        </div>
    );
}

export default function GroupAdminDashboardPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <LoadingSpinner size="lg" />
            </div>
        }>
            <AdminDashboardContent />
        </Suspense>
    );
}
