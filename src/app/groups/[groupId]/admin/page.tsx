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
import { Avatar } from '@/components/ui/Avatar';
import { cn, getRelativeTime } from '@/lib/utils';
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

    const handleCreateTrip = async (e: React.FormEvent) => {
        e.preventDefault();
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

    const handleUpdateTrip = async (e: React.FormEvent) => {
        e.preventDefault();

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
            <div className="min-h-screen bg-[var(--bg-primary)] has-bottom-nav">
                <PageHeaderSkeleton />
                <main className="container mx-auto px-4 py-6 max-w-4xl">
                    <div className="h-10 w-full mb-6 rounded-xl bg-[var(--bg-tertiary)] animate-pulse" />
                    <EntityCardSkeletonGrid count={2} className="md:grid-cols-2 lg:grid-cols-2" />
                </main>
            </div>
        );
    }

    const isCreator = currentGroup.creator === user?.id;

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] has-bottom-nav">
            <Header title={currentGroup.name} subtitle="Gestão de grupo" showBack groupId={groupId} />

            <main className="container mx-auto px-4 py-6 max-w-4xl">
                {/* Tabs */}
                <div className="flex p-1 mb-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)]">
                    <button
                        onClick={() => setActiveTab('trips')}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                            activeTab === 'trips' ? "bg-white dark:bg-slate-700 text-violet-600 dark:text-white shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                    >
                        Viagens
                    </button>
                    <button
                        onClick={() => setActiveTab('members')}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                            activeTab === 'members' ? "bg-white dark:bg-slate-700 text-violet-600 dark:text-white shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                    >
                        Membros
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                            activeTab === 'settings' ? "bg-white dark:bg-slate-700 text-violet-600 dark:text-white shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                    >
                        Definições
                    </button>
                </div>

                {/* TRIP MANAGEMENT */}
                {activeTab === 'trips' && (
                    <div className="animate-fade-in-up">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-[var(--text-primary)]">Viagens</h2>
                            <Button onClick={() => setShowCreateModal(true)} className="btn-primary py-2 text-sm">
                                + Nova Viagem
                            </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            {trips.length === 0 ? (
                                <div className="col-span-full py-12 text-center text-[var(--text-muted)]">
                                    <span className="text-4xl block mb-2">📋</span>
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
                        <h2 className="text-xl font-bold text-[var(--text-primary)]">Membros ({currentGroup.members.length})</h2>

                        <div className="space-y-3">
                            {currentGroup.expand?.members?.map((member: any) => { // Using any for expand as types might not be perfectly inferred
                                const isMemberAdmin = currentGroup.admins.includes(member.id);
                                const isMemberCreator = currentGroup.creator === member.id;

                                return (
                                    <div key={member.id} className="card p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Avatar name={member.name} src={member.avatar ? `https://pb-orderit.povoas.top/api/files/users/${member.id}/${member.avatar}` : undefined} />
                                            <div>
                                                <p className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                                    {member.name}
                                                    {isMemberCreator && <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded ml-1">Dono</span>}
                                                    {isMemberAdmin && !isMemberCreator && <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded ml-1">Admin</span>}
                                                </p>
                                                <p className="text-xs text-[var(--text-muted)]">{member.email}</p>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        {user?.id !== member.id && ( // Cannot manage self
                                            <div className="flex items-center gap-2">
                                                {/* Promote/Demote - only Creator can do this */}
                                                {isCreator && (
                                                    isMemberAdmin ? (
                                                        <button
                                                            onClick={() => handleDemoteMember(member.id)}
                                                            className="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded text-gray-700 dark:text-gray-300"
                                                            title="Remover Admin"
                                                        >
                                                            ⬇️ Admin
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handlePromoteMember(member.id)}
                                                            className="text-xs px-2 py-1 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded text-violet-700 dark:text-violet-300"
                                                            title="Promover a Admin"
                                                        >
                                                            ⬆️ Admin
                                                        </button>
                                                    )
                                                )}

                                                {/* Remove Member - Admins can remove non-admins (except creator) */}
                                                {(!isMemberCreator && (isCreator || !isMemberAdmin)) && (
                                                    <button
                                                        onClick={() => handleRemoveMember(member.id)}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                        title="Remover do grupo"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
                        <button
                            onClick={handleCreateTrip}
                            disabled={creating || !newTripName.trim() || !online}
                            className={cn(
                                "w-full py-4 text-lg font-semibold btn btn-primary flex items-center justify-center gap-2",
                                creating && "btn-loading",
                            )}
                        >
                            Criar Viagem
                        </button>
                        {!online && (
                            <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
                                Sem ligação — precisas de rede para criar uma viagem.
                            </p>
                        )}
                    </div>
                }
            >
                <div className="space-y-6 pb-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Nome da Viagem</label>
                        <input
                            type="text"
                            value={newTripName}
                            onChange={e => setNewTripName(e.target.value)}
                            placeholder="ex. Compras de Verão"
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-lg dark:text-white dark:placeholder:text-gray-500"
                            autoFocus
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Descrição (opcional)</label>
                        <textarea
                            value={newTripDescription}
                            onChange={e => setNewTripDescription(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 dark:text-white resize-none"
                            rows={3}
                        />
                    </div>
                </div>
            </Sheet>

            {/* Edit Trip Sheet */}
            <Sheet
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                size="large"
                title="Editar Viagem"
                footer={
                    <button
                        onClick={handleUpdateTrip}
                        className="w-full py-4 text-lg font-semibold btn btn-primary"
                    >
                        Guardar Alterações
                    </button>
                }
            >
                <div className="space-y-6 pb-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Nome da Viagem</label>
                        <input
                            type="text"
                            value={editTripName}
                            onChange={e => setEditTripName(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-lg dark:text-white"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Descrição (opcional)</label>
                        <textarea
                            value={editTripDescription}
                            onChange={e => setEditTripDescription(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 focus:border-violet-500 focus:ring-0 transition-colors bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 dark:text-white resize-none"
                            rows={3}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">Estado</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setEditTripStatus('open')}
                                className={cn(
                                    "p-3 rounded-xl border-2 font-medium transition text-center text-sm",
                                    editTripStatus === 'open'
                                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                                        : "border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-slate-600"
                                )}
                            >
                                🟢 Aberta
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditTripStatus('in_progress')}
                                className={cn(
                                    "p-3 rounded-xl border-2 font-medium transition text-center text-sm",
                                    editTripStatus === 'in_progress'
                                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                                        : "border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-slate-600"
                                )}
                            >
                                🔵 Em Progresso
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditTripStatus('closed')}
                                className={cn(
                                    "p-3 rounded-xl border-2 font-medium transition text-center text-sm",
                                    editTripStatus === 'closed'
                                        ? "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                                        : "border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-slate-600"
                                )}
                            >
                                🔴 Terminada
                            </button>
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
