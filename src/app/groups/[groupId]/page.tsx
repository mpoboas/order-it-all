'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { groupsApi, tripsApi, splitsApi, subscriptions } from '@/lib/pocketbase';
import type { Group, Trip, Split } from '@/lib/types';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Avatar } from '@/components/ui/Avatar';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { formatCurrency, getRelativeTime, cn } from '@/lib/utils';
import { useToast } from '@/context/ToastContext';

export default function GroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
    const { groupId } = use(params);
    const { user, isLoggedIn } = useUser();
    const router = useRouter();
    const { showToast } = useToast();

    const [group, setGroup] = useState<Group | null>(null);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [splits, setSplits] = useState<Split[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'trips' | 'splits' | 'members'>('trips');

    // Modals
    const [showNewTripModal, setShowNewTripModal] = useState(false);
    const [newTripName, setNewTripName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [groupData, openTrips, closedTrips, splitsData] = await Promise.all([
                    groupsApi.getById(groupId),
                    tripsApi.getOpen(groupId),
                    tripsApi.getClosed(groupId),
                    splitsApi.getAll(groupId)
                ]);

                setGroup(groupData);
                setTrips([...openTrips, ...closedTrips]);
                setSplits(splitsData);
            } catch (error) {
                console.error('Error loading group data:', error);
                router.push('/groups');
            } finally {
                setLoading(false);
            }
        };

        if (isLoggedIn) {
            loadData();

            // Subscriptions
            let unsubTrips: (() => void) | undefined;
            let unsubSplits: (() => void) | undefined;

            subscriptions.subscribeToTrips(groupId, (e: any) => {
                if (e.action === 'create' || e.action === 'update' || e.action === 'delete') {
                    // Refresh trips
                    Promise.all([tripsApi.getOpen(groupId), tripsApi.getClosed(groupId)])
                        .then(([open, closed]) => setTrips([...open, ...closed]));
                }
            }).then(unsub => unsubTrips = unsub);

            subscriptions.subscribeToSplits(groupId, (e: any) => {
                splitsApi.getAll(groupId).then(setSplits);
            }).then(unsub => unsubSplits = unsub);

            return () => {
                if (unsubTrips) unsubTrips();
                if (unsubSplits) unsubSplits();
                subscriptions.unsubscribeAll();
            };
        }
    }, [groupId, isLoggedIn, router]);

    const handleCreateTrip = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTripName.trim()) return;
        setSubmitting(true);

        try {
            const trip = await tripsApi.create({
                name: newTripName.trim(),
                group_id: groupId
            });
            showToast('Viagem criada!', 'success');
            setShowNewTripModal(false);
            setNewTripName('');
            router.push(`/groups/${groupId}/trips/${trip.id}`);
        } catch (error) {
            console.error(error);
            showToast('Erro ao criar viagem', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const copyInviteCode = () => {
        if (group?.invite_code) {
            navigator.clipboard.writeText(group.invite_code);
            showToast('Código copiado!', 'success');
        }
    };

    if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
    if (!group) return null;

    return (
        <div className="container mx-auto px-4 py-6 max-w-2xl pb-24">
            {/* Header */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Avatar name={group.name} src={group.avatar} size="lg" className="rounded-2xl" />
                    <div>
                        <h1 className="text-xl font-bold text-[var(--text-primary)] leading-tight">{group.name}</h1>
                        <p className="text-sm text-[var(--text-muted)]">{group.members.length} membros</p>
                    </div>
                </div>
                <button onClick={copyInviteCode} className="flex flex-col items-center justify-center w-12 h-12 bg-[var(--bg-tertiary)] rounded-2xl hover:bg-violet-50 hover:text-violet-600 transition-colors">
                    <span className="material-icons text-xl mb-0.5">qr_code</span>
                </button>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
                {(['trips', 'splits', 'members'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            "flex-1 py-2 text-sm font-bold rounded-lg transition-all capitalize",
                            activeTab === tab
                                ? "bg-white text-[var(--text-primary)] shadow-sm"
                                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        )}
                    >
                        {tab === 'trips' ? 'Viagens' : tab === 'splits' ? 'Contas' : 'Membros'}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="space-y-4">
                {activeTab === 'trips' && (
                    <>
                        <div className="flex justify-between items-center mb-2 px-1">
                            <h2 className="font-bold text-lg">Viagens Recentes</h2>
                            <Button onClick={() => setShowNewTripModal(true)} className="btn-primary py-2 px-4 text-xs h-auto">
                                + Nova Viagem
                            </Button>
                        </div>

                        {trips.length === 0 ? (
                            <div className="text-center py-12 text-[var(--text-muted)]">
                                <span className="text-4xl block mb-2">🌍</span>
                                <p>Nenhuma viagem ainda.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {trips.map(trip => (
                                    <div
                                        key={trip.id}
                                        onClick={() => router.push(`/groups/${groupId}/trips/${trip.id}`)}
                                        className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm active:scale-[0.99] transition-transform cursor-pointer relative overflow-hidden group"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full",
                                                    trip.status === 'open' ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                                                )} />
                                                <span className={cn(
                                                    "text-xs font-bold uppercase tracking-wider",
                                                    trip.status === 'open' ? "text-emerald-600" : "text-gray-400"
                                                )}>
                                                    {trip.status === 'open' ? 'A decorrer' : 'Terminada'}
                                                </span>
                                            </div>
                                            <span className="text-xs text-[var(--text-muted)]">{getRelativeTime(trip.created)}</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">{trip.name}</h3>
                                        <div className="flex items-center gap-2 mt-3">
                                            <Avatar
                                                name={trip.expand?.created_by?.name || 'User'}
                                                src={trip.expand?.created_by?.avatar ? `https://pb-orderit.povoas.top/api/files/users/${trip.expand.created_by.id}/${trip.expand.created_by.avatar}` : undefined}
                                                size="sm"
                                            />
                                            <span className="text-xs text-[var(--text-muted)]">
                                                Criado por <span className="font-semibold text-[var(--text-secondary)]">{trip.expand?.created_by?.name || 'Alguém'}</span>
                                            </span>
                                        </div>

                                        {/* Chevron */}
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-violet-500 transition-colors">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'splits' && (
                    <div className="text-center py-12">
                        <span className="text-4xl block mb-2">🚧</span>
                        <h3 className="font-bold">Em construção</h3>
                        <p className="text-sm text-[var(--text-muted)]">Funcionalidade de dividir contas em breve.</p>
                    </div>
                )}

                {activeTab === 'members' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {group.expand?.members?.map((member, i) => (
                            <div key={member.id} className={cn("p-4 flex items-center gap-3", i !== 0 && "border-t border-gray-100")}>
                                <Avatar
                                    name={member.name}
                                    src={member.avatar ? `https://pb-orderit.povoas.top/api/files/users/${member.id}/${member.avatar}` : undefined}
                                    size="md"
                                />
                                <div>
                                    <h4 className="font-bold text-[var(--text-primary)]">{member.name}</h4>
                                    <p className="text-xs text-[var(--text-muted)]">{member.email}</p>
                                </div>
                                {group.admins.includes(member.id) && (
                                    <span className="ml-auto text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-1 rounded-full uppercase tracking-wider">
                                        Admin
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* New Trip Modal */}
            <Modal isOpen={showNewTripModal} onClose={() => setShowNewTripModal(false)}>
                <ModalHeader>
                    <h2 className="text-xl font-bold">Nova Viagem</h2>
                </ModalHeader>
                <form onSubmit={handleCreateTrip}>
                    <ModalBody className="pt-4">
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Nome da Viagem</label>
                        <input
                            type="text"
                            value={newTripName}
                            onChange={e => setNewTripName(e.target.value)}
                            className="input"
                            placeholder="ex: Compras de Natal"
                            required
                            autoFocus
                        />
                    </ModalBody>
                    <ModalFooter className="flex gap-3 justify-end mt-4">
                        <Button type="button" variant="ghost" onClick={() => setShowNewTripModal(false)}>Cancelar</Button>
                        <Button type="submit" disabled={submitting} className="btn-primary">Criar</Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}
