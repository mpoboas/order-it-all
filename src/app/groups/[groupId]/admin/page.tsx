'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { tripsApi, subscriptions, groupsApi, ordersApi, itemsApi, splitsApi } from '@/lib/pocketbase';
import type { Trip, Group } from '@/lib/types';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { useToast } from '@/context/ToastContext';
import { useGroup } from '@/context/GroupContext';
import { Sheet } from '@/components/ui/Sheet';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { cn, getRelativeTime } from '@/lib/utils';
import { useUser } from '@/context/UserContext';
import { TripCard } from '@/components/features/TripCard';

export default function GroupAdminDashboardPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const { currentGroup, isAdmin, refreshGroup } = useGroup();
    const { user } = useUser();
    const router = useRouter();
    const { showToast } = useToast();

    // Data
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);

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

    // Tab State
    const [activeTab, setActiveTab] = useState<'trips' | 'members' | 'settings'>('trips');

    useEffect(() => {
        if (!isAdmin) {
            router.push(`/groups/${groupId}/trips`);
        }
    }, [isAdmin, groupId, router]);

    const loadTrips = useCallback(async () => {
        if (!groupId) return;
        try {
            // Admins see all trips
            const allTrips = await tripsApi.getAllByGroup(groupId);
            setTrips(allTrips);
        } catch (error) {
            console.error('Error loading trips:', error);
            showToast('Falha ao carregar viagens', 'error');
        } finally {
            setLoading(false);
        }
    }, [groupId, showToast]);

    useEffect(() => {
        loadTrips();
        const unsub = subscriptions.subscribeToTrips(() => loadTrips());
        return () => {
            subscriptions.unsubscribeAll();
        };
    }, [loadTrips]);

    const handleCreateTrip = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTripName.trim()) return;
        setCreating(true);
        try {
            await tripsApi.create({
                name: newTripName.trim(),
                description: newTripDescription.trim(),
                group_id: groupId,
            });
            showToast('Viagem criada com sucesso!', 'success');
            setNewTripName('');
            setNewTripDescription('');
            setShowCreateModal(false);
            loadTrips();
        } catch (error) {
            console.error('Error creating trip:', error);
            showToast('Falha ao criar viagem', 'error');
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

        try {
            await tripsApi.update(editTripId, {
                name: editTripName.trim(),
                description: editTripDescription.trim(),
                status: editTripStatus,
            });
            showToast('Viagem atualizada com sucesso!', 'success');
            setShowEditModal(false);
            loadTrips();
        } catch (error) {
            console.error('Error updating trip:', error);
            showToast('Falha ao atualizar viagem', 'error');
        }
    };

    const handleDeleteTrip = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Tem a certeza de que quer eliminar esta viagem? Esta acção não pode ser desfeita e irá eliminar todos os pedidos e produtos associados.')) return;
        try {
            await tripsApi.delete(id);
            showToast('Viagem eliminada com sucesso!', 'success');
            loadTrips();
        } catch (error) {
            showToast('Falha ao eliminar viagem', 'error');
        }
    };

    const handleCloseTrip = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();

        const canClose = await validateTripClosure(id);
        if (!canClose) return;

        if (!confirm('Tem a certeza de que quer terminar esta viagem? Esta acção não pode ser desfeita.')) return;
        try {
            await tripsApi.close(id);
            showToast('Viagem terminada com sucesso!', 'success');
            loadTrips();
        } catch (error) {
            showToast('Falha ao terminar viagem', 'error');
        }
    };

    const handleCreateSplitFromTrip = async (e: React.MouseEvent, trip: Trip) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm('Gerar uma divisão de contas a partir desta viagem?')) return;

        try {
            showToast('A gerar divisão...', 'info');

            // 1. Fetch Orders and Items
            const orders = await ordersApi.getByTrip(trip.id);

            // 2. Prepare Data Structures
            // We need a complete set of ALL participants first (Group Members + Ad-hoc names on orders)
            // This is crucial so that 'Geral' orders can be split among EVERYONE.
            const allParticipantsSet = new Set<string>();
            const memberMap = new Map<string, string>(); // ID -> Name

            // 2a. Add all registered group members
            if (currentGroup?.expand?.members) {
                currentGroup.expand.members.forEach((m: any) => {
                    memberMap.set(m.id, m.name);
                    allParticipantsSet.add(m.name);
                });
            }

            // 2b. Scan orders to find any "extra" people (ad-hoc names like "Manelll") 
            // who aren't group members but made orders.
            for (const order of orders) {
                let displayName = order.user_name;
                const orderUserId = order.user || order.expand?.user?.id;

                // If it's a registered user, use their verified name
                if (orderUserId && memberMap.has(orderUserId)) {
                    displayName = memberMap.get(orderUserId)!;
                }

                // If it's a real person (not 'Geral'), add them to the universe of participants
                if (displayName !== 'Geral') {
                    allParticipantsSet.add(displayName);
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

                const isGeral = displayName === 'Geral';
                const items = await itemsApi.getByOrder(order.id);

                for (const item of items) {
                    if (item.found_status === 'found') {
                        splitItems.push({
                            name: item.name,
                            price: item.price,
                            // If Geral, split with EVERYONE found in the trip context. 
                            // Else, assign to the specific person.
                            participants: isGeral ? allParticipantsList : [displayName],
                        });
                    }
                }
            }

            // 4. Create Split
            const split = await splitsApi.create({
                name: `Divisão: ${trip.name}`,
                description: `Gerado automaticamente a partir da viagem "${trip.name}"`,
                group_id: groupId,
                created_by: user!.id,
                participants: allParticipantsList,
                items: splitItems,
            });

            showToast('Divisão gerada com sucesso!', 'success');
            router.push(`/groups/${groupId}/splits/${split.id}`);

        } catch (error) {
            console.error('Error generating split:', error);
            showToast('Erro ao gerar divisão', 'error');
        }
    };

    // Member Management
    const handleRemoveMember = async (memberId: string) => {
        if (!confirm('Remover este membro do grupo?')) return;
        try {
            await groupsApi.removeMember(groupId, memberId);
            showToast('Membro removido', 'success');
            refreshGroup();
        } catch (error: any) {
            showToast(error.message || 'Erro ao remover membro', 'error');
        }
    };

    const handlePromoteMember = async (memberId: string) => {
        if (!confirm('Promover a administrador?')) return;
        try {
            await groupsApi.promoteToAdmin(groupId, memberId);
            showToast('Membro promovido', 'success');
            refreshGroup();
        } catch (error: any) {
            showToast(error.message || 'Erro ao promover', 'error');
        }
    };

    const handleDemoteMember = async (memberId: string) => {
        if (!confirm('Remover privilégios de administrador?')) return;
        try {
            await groupsApi.demoteFromAdmin(groupId, memberId);
            showToast('Administrador despromovido', 'success');
            refreshGroup();
        } catch (error: any) {
            showToast(error.message || 'Erro ao despromover', 'error');
        }
    };

    const handleRegenerateInvite = async () => {
        if (!confirm('Gerar novo código? O anterior deixará de funcionar.')) return;
        try {
            await groupsApi.regenerateInviteCode(groupId);
            showToast('Novo código gerado', 'success');
            refreshGroup();
        } catch (error) {
            showToast('Erro ao gerar código', 'error');
        }
    };

    const handleToggleInvite = async (active: boolean) => {
        try {
            await groupsApi.toggleInvite(groupId, active);
            showToast(active ? 'Convites ativados' : 'Convites desativados', 'success');
            refreshGroup();
        } catch (error) {
            showToast('Erro ao alterar estado', 'error');
        }
    };

    if (loading || !currentGroup) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
                <LoadingSpinner size="lg" />
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
                            activeTab === 'trips' ? "bg-white dark:bg-slate-700 text-violet-600 dark:text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        )}
                    >
                        Viagens
                    </button>
                    <button
                        onClick={() => setActiveTab('members')}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                            activeTab === 'members' ? "bg-white dark:bg-slate-700 text-violet-600 dark:text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        )}
                    >
                        Membros
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                            activeTab === 'settings' ? "bg-white dark:bg-slate-700 text-violet-600 dark:text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
                                        onClick={() => router.push(`/groups/${groupId}/admin/trips/${trip.id}`)}
                                        isAdmin={true}
                                        onEdit={handleOpenEditModal}
                                        onClose={handleCloseTrip}
                                        onDelete={handleDeleteTrip}
                                        onSplit={handleCreateSplitFromTrip}
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
                    <div className="animate-fade-in-up space-y-6">
                        <section>
                            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">Link de Convite</h2>
                            <div className="card p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-medium text-[var(--text-secondary)]">Estado do convite</span>
                                    <button
                                        onClick={() => handleToggleInvite(!currentGroup.invite_active)}
                                        className={cn(
                                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                            currentGroup.invite_active ? "bg-violet-600" : "bg-gray-200"
                                        )}
                                    >
                                        <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition transition-transform ml-1", currentGroup.invite_active ? "translate-x-5" : "")} />
                                    </button>
                                </div>

                                {currentGroup.invite_active && (
                                    <>
                                        <div className="flex gap-2 mb-4">
                                            <code className="flex-1 bg-gray-100 dark:bg-slate-800 p-3 rounded-lg text-sm block overflow-hidden text-ellipsis dark:text-gray-200 border dark:border-slate-700">
                                                {typeof window !== 'undefined' ? `${window.location.origin}/invite/${currentGroup.invite_code}` : `.../invite/${currentGroup.invite_code}`}
                                            </code>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`${window.location.origin}/invite/${currentGroup.invite_code}`);
                                                    showToast('Link copiado!', 'success');
                                                }}
                                                className="px-4 py-2 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 font-medium"
                                            >
                                                Copiar
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleRegenerateInvite}
                                            className="text-sm text-amber-600 dark:text-amber-500 hover:underline"
                                        >
                                            Gerar novo código de convite
                                        </button>
                                    </>
                                )}
                            </div>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-red-600 dark:text-red-500 mb-4">Perigo</h2>
                            <div className="card p-4 border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-semibold text-red-900 dark:text-red-200">Eliminar Grupo</h3>
                                        <p className="text-sm text-red-700 dark:text-red-300">Esta acção é irreversível e eliminará todas as viagens e dados.</p>
                                    </div>
                                    <Button disabled className="bg-red-200 dark:bg-red-900/20 text-red-400 dark:text-red-700 cursor-not-allowed">
                                        Eliminar
                                    </Button>
                                </div>
                            </div>
                        </section>
                    </div>
                )}
            </main>


            {/* Create Trip Sheet */}
            <Sheet
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Nova Viagem"
                footer={
                    <button
                        onClick={handleCreateTrip}
                        disabled={creating || !newTripName.trim()}
                        className="w-full py-4 text-lg font-semibold btn btn-primary flex items-center justify-center gap-2"
                    >
                        {creating ? 'A criar...' : 'Criar Viagem'}
                    </button>
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
                                    "p-3 rounded-xl border-2 font-medium transition-all text-center text-sm",
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
                                    "p-3 rounded-xl border-2 font-medium transition-all text-center text-sm",
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
                                    "p-3 rounded-xl border-2 font-medium transition-all text-center text-sm",
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
