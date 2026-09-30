'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { tripsApi, ordersApi, itemsApi, authHeaders } from '@/lib/pocketbase';
import type { Trip } from '@/lib/types';
import { useExpenses, useParties, useTrips } from '@/lib/db/hooks';
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
import { useConfirm } from '@/context/ConfirmContext';
import { useGroup } from '@/context/GroupContext';
import { Sheet } from '@/components/ui/Sheet';
import { HeroHeader } from '@/components/features/HeroHeader';
import { getGroupHeroBackground } from '@/lib/groupAvatars';
import { useGroupHeroPeople } from '@/hooks/useGroupHeroPeople';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Input, Textarea } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { useUser } from '@/context/UserContext';
import { TripList } from '@/components/features/TripList';
import { GroupTabs } from '@/components/features/GroupTabs';
import { GroupOverviewBar } from '@/components/features/GroupOverviewBar';
import { ExpandableFab } from '@/components/features/ExpandableFab';
import { TripToExpenseSheet } from '@/components/features/TripToExpenseSheet';
import { GroupSetupChecklist } from '@/components/features/GroupSetupChecklist';
import { markInstallValueMoment } from '@/lib/installValueMoment';

function AdminDashboardContent() {
    const params = useParams();
    const groupId = params.groupId as string;
    const { currentGroup, isAdmin } = useGroup();
    const heroPeople = useGroupHeroPeople(currentGroup);
    const { user } = useUser();
    const online = useOnline();
    const router = useRouter();
    const nav = useAppNavigate();
    const { showToast } = useToast();
    const confirmAction = useConfirm();

    // Data (local-first: cache do Dexie via SyncProvider)
    const tripsQuery = useTrips(groupId);
    const trips = tripsQuery ?? [];
    const expensesForChecklist = useExpenses(groupId) ?? [];
    const tripIdsWithExpense = new Set(
        expensesForChecklist.flatMap((e) => (!e.deleted_at && e.trip_id ? [e.trip_id] : [])),
    );
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

    // Viagem → Despesa: sheet de pré-visualização, aberto ao fechar uma
    // viagem ou manualmente numa já fechada.
    const [tripToExpense, setTripToExpense] = useState<Trip | null>(null);
    const parties = useParties(groupId) ?? new Map();

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
            markInstallValueMoment();
            void catchUp();

            // Notify Users (menos quem acabou de criar — já vê a viagem no ecrã)
            const notifyRes = await fetch('/api/notify', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    groupId,
                    excludeUserId: user?.id,
                    title: '🛍️ Está na hora de encomendar!',
                    message: `${newTripName.trim()} está disponível. Faz os teus pedidos!`,
                    url: `/groups/${groupId}/trips`
                })
            }).catch(console.error);
            if (notifyRes?.ok) showToast('Grupo notificado', 'info');

        } catch (error) {
            console.error('Error creating trip:', error);
            showToast(mutationErrorMessage(error, 'Falha ao criar viagem'), 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleOpenEditModal = (trip: Trip) => {
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

    const handleDeleteTrip = async (id: string) => {
        if (!(await confirmAction({
            title: 'Eliminar esta viagem?',
            description: 'Apaga todos os pedidos e produtos associados. Não pode ser desfeito.',
            tone: 'danger',
            confirmLabel: 'Eliminar viagem',
        }))) return;
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

    const handleCloseTrip = async (id: string) => {

        const canClose = await validateTripClosure(id);
        if (!canClose) return;

        if (!(await confirmAction({
            title: 'Terminar esta viagem?',
            description: 'Não pode ser desfeito.',
            tone: 'warning',
            confirmLabel: 'Terminar viagem',
        }))) return;
        try {
            await optimisticEdit({
                table: db.trips,
                id,
                patch: { status: 'closed' },
                commit: () => tripsApi.close(id),
            });
            showToast('Viagem terminada', 'success');
            const closedTrip = trips.find((t) => t.id === id);
            if (closedTrip) setTripToExpense({ ...closedTrip, status: 'closed' });
        } catch (error) {
            showToast(mutationErrorMessage(error, 'Falha ao terminar viagem'), 'error');
        }
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
            <HeroHeader
                variant="compact"
                title={currentGroup.name}
                background={getGroupHeroBackground(currentGroup)}
                avatars={heroPeople.avatars}
                avatarOverflowCount={heroPeople.overflow}
                onBack={() => nav.up()}
                topRightAction={{
                    icon: 'settings',
                    label: 'Definições do grupo',
                    onClick: () => nav.push(`/groups/${currentGroup.id}/settings`, { haptic: false }),
                }}
            />
            <GroupOverviewBar groupId={groupId} />
            <GroupTabs groupId={groupId} isAdmin={isAdmin} />

            <main className="container mx-auto px-2 sm:px-4 py-4 max-w-2xl pb-24">
                {/* Onboarding: só para quem criou o grupo de raiz — uma vez na
                    vida (qualquer grupo), não uma vez por grupo. */}
                {isCreator && (
                    <GroupSetupChecklist
                        memberCount={currentGroup.members.length}
                        tripCount={trips.length}
                        expenseCount={expensesForChecklist.length}
                        onInvite={() => nav.push(`/groups/${groupId}/settings`)}
                        onCreateTrip={() => setShowCreateModal(true)}
                        onCreateExpense={() => nav.push(`/groups/${groupId}/expenses`)}
                    />
                )}

                {trips.length === 0 ? (
                    /* Onboarding: sem viagem aberta, ninguém no grupo consegue fazer
                       pedidos — é o desbloqueio inicial para o admin. */
                    <div className="py-12 text-center">
                        <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary-50 dark:bg-primary-950 text-primary-500 flex items-center justify-center">
                            <Icon name="receipt_long" className="text-3xl" />
                        </div>
                        <h3 className="font-bold text-ink mb-1">Cria a tua primeira viagem</h3>
                        <p className="text-sm text-ink-faint mb-4 max-w-xs mx-auto">
                            Os membros só conseguem fazer pedidos depois de teres uma viagem aberta.
                        </p>
                        <Button size="sm" onClick={() => setShowCreateModal(true)}>
                            + Nova Viagem
                        </Button>
                    </div>
                ) : (
                    <TripList
                        trips={trips}
                        hrefFor={(trip) => `/groups/${groupId}/admin/trips/${trip.id}`}
                        onOpen={(trip) => nav.push(`/groups/${groupId}/admin/trips/${trip.id}`, { haptic: false })}
                        tripIdsWithExpense={tripIdsWithExpense}
                        admin={{
                            onEdit: handleOpenEditModal,
                            onFinish: (trip) => void handleCloseTrip(trip.id),
                            onLaunchExpense: setTripToExpense,
                            onDelete: (trip) => void handleDeleteTrip(trip.id),
                        }}
                    />
                )}
            </main>

            <ExpandableFab icon="add" label="Nova Viagem" onClick={() => setShowCreateModal(true)} />

            {/* Create Trip Sheet */}
            <Sheet
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                size="full"
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
                                Sem ligação. Precisas de rede para criar uma viagem.
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
                size="full"
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

            <TripToExpenseSheet
                isOpen={!!tripToExpense}
                onClose={() => setTripToExpense(null)}
                trip={tripToExpense}
                groupId={groupId}
                group={currentGroup}
                parties={parties}
                onCreated={(expenseId) => {
                    setTripToExpense(null);
                    nav.push(`/groups/${groupId}/expenses/${expenseId}/items`, { haptic: false });
                }}
            />
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
