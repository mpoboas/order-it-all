'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { groupsApi, tripsApi, subscriptions } from '@/lib/pocketbase';
import type { Group, Trip } from '@/lib/types';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { Avatar } from '@/components/ui/Avatar';
import { cn, getRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

export default function GroupAdminPage({ params }: { params: Promise<{ groupId: string }> }) {
    const { groupId } = use(params);
    const { user, isLoggedIn } = useUser();
    const router = useRouter();
    const { showToast } = useToast();

    const [group, setGroup] = useState<Group | null>(null);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit Group State
    const [showEditGroupModal, setShowEditGroupModal] = useState(false);
    const [editGroupName, setEditGroupName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Trip Actions State (same as legacy admin)
    const [showEditTripModal, setShowEditTripModal] = useState(false);
    const [editTripId, setEditTripId] = useState('');
    const [editTripName, setEditTripName] = useState('');
    const [editTripDescription, setEditTripDescription] = useState('');
    const [editTripStatus, setEditTripStatus] = useState<'open' | 'closed'>('open');


    useEffect(() => {
        const loadData = async () => {
            try {
                // Determine if user is admin of group
                const groupData = await groupsApi.getById(groupId);
                if (!groupData.admins.includes(user?.id)) {
                    showToast('Apenas administradores podem aceder a esta página', 'error');
                    router.push(`/groups/${groupId}`);
                    return;
                }

                const [openTrips, closedTrips] = await Promise.all([
                    tripsApi.getOpen(groupId),
                    tripsApi.getClosed(groupId)
                ]);

                setGroup(groupData);
                setTrips([...openTrips, ...closedTrips]);
                setEditGroupName(groupData.name);
            } catch (error) {
                console.error('Error loading admin data:', error);
                router.push(`/groups/${groupId}`);
            } finally {
                setLoading(false);
            }
        };

        if (isLoggedIn && user) {
            loadData();
        }
    }, [groupId, isLoggedIn, user, router, showToast]);

    const handleUpdateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const updated = await groupsApi.update(groupId, { name: editGroupName });
            setGroup(updated);
            showToast('Grupo atualizado!', 'success');
            setShowEditGroupModal(false);
        } catch (error) {
            showToast('Erro ao atualizar grupo', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRegenerateCode = async () => {
        if (!confirm('Gerar novo código irá invalidar o anterior. Continuar?')) return;
        try {
            // Logic to regenerate code - usually backend would handle this, 
            // but we can simulate by updating with a random string if backend allows, 
            // or if create method logic is moved to backend (PB hook).
            // For now, client-side generation as per create method.
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            const updated = await groupsApi.update(groupId, { invite_code: code });
            setGroup(updated);
            showToast('Novo código gerado!', 'success');
        } catch (error) {
            showToast('Erro ao gerar código', 'error');
        }
    };

    // Trip Management (Migrated)

    const handleOpenEditTripModal = (e: React.MouseEvent, trip: Trip) => {
        e.preventDefault();
        setEditTripId(trip.id);
        setEditTripName(trip.name);
        setEditTripDescription(trip.description || '');
        setEditTripStatus(trip.status);
        setShowEditTripModal(true);
    };

    const handleUpdateTrip = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await tripsApi.update(editTripId, {
                name: editTripName.trim(),
                description: editTripDescription.trim(),
                status: editTripStatus,
            });
            showToast('Viagem atualizada!', 'success');
            setShowEditTripModal(false);
            // Refresh trips
            const [open, closed] = await Promise.all([tripsApi.getOpen(groupId), tripsApi.getClosed(groupId)]);
            setTrips([...open, ...closed]);
        } catch (error) {
            console.error('Error updating trip:', error);
            showToast('Falha ao atualizar viagem', 'error');
        }
    };

    const handleDeleteTrip = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        if (!confirm('Tem a certeza? Vai eliminar TODOS os dados desta viagem.')) return;
        try {
            await tripsApi.delete(id);
            showToast('Viagem eliminada!', 'success');
            setTrips(trips.filter(t => t.id !== id));
        } catch (error) {
            showToast('Erro ao eliminar viagem', 'error');
        }
    };


    if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>;
    if (!group) return null;

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-24">
            <Header title="Admin do Grupo" subtitle={group.name} showBack backUrl={`/groups/${groupId}`} />

            <main className="container mx-auto px-4 py-6 max-w-2xl space-y-8">

                {/* Group Settings */}
                <section className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-lg font-bold text-gray-900">Definições do Grupo</h2>
                        <button onClick={() => setShowEditGroupModal(true)} className="text-violet-600 hover:text-violet-700 text-sm font-bold">
                            Editar
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <Avatar name={group.name} src={group.avatar} size="lg" />
                            <div>
                                <h3 className="font-bold text-xl">{group.name}</h3>
                                <p className="text-sm text-gray-500">Criado por {group.expand?.creator?.name || 'Admin'}</p>
                            </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Código de Convite</p>
                                <p className="text-2xl font-mono font-bold tracking-widest text-gray-900">{group.invite_code}</p>
                            </div>
                            <button onClick={handleRegenerateCode} className="p-2 text-gray-400 hover:text-violet-600 transition-colors" title="Gerar novo código">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </button>
                        </div>
                    </div>
                </section>

                {/* Members Management (Simple List for now) */}
                <section className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Membros ({group.members.length})</h2>
                    <div className="space-y-3">
                        {group.expand?.members?.map(member => (
                            <div key={member.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Avatar name={member.name} src={member.avatar ? `https://pb-orderit.povoas.top/api/files/users/${member.id}/${member.avatar}` : undefined} size="sm" />
                                    <span className="font-medium text-gray-900">{member.name}</span>
                                </div>
                                {group.admins.includes(member.id) ? (
                                    <span className="text-xs bg-violet-100 text-violet-600 px-2 py-1 rounded-full font-bold">Admin</span>
                                ) : (
                                    <button
                                        onClick={() => {
                                            // Kick logic would go here (need API support)
                                            showToast('Funcionalidade em desenvolvimento', 'info');
                                        }}
                                        className="text-red-500 hover:text-red-600 text-xs font-bold"
                                    >
                                        Remover
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Trips Management */}
                <section>
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Gerir Viagens</h2>
                    <div className="space-y-3">
                        {trips.map(trip => (
                            <div key={trip.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-gray-900">{trip.name}</h3>
                                        <Badge variant={trip.status === 'open' ? 'open' : 'closed'}>
                                            {trip.status === 'open' ? 'A Decorrer' : 'Terminada'}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-gray-500">{getRelativeTime(trip.created)} • {trip.expand?.created_by?.name}</p>
                                </div>
                                <div className="flex gap-2 self-end sm:self-center">
                                    <button
                                        onClick={(e) => handleOpenEditTripModal(e, trip)}
                                        className="p-2 text-gray-400 hover:text-violet-600 bg-gray-50 hover:bg-violet-50 rounded-lg transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteTrip(e, trip.id)}
                                        className="p-2 text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            {/* Modals */}
            <Modal isOpen={showEditGroupModal} onClose={() => setShowEditGroupModal(false)}>
                <ModalHeader>Editar Grupo</ModalHeader>
                <form onSubmit={handleUpdateGroup}>
                    <ModalBody>
                        <label className="label">Nome do Grupo</label>
                        <input type="text" value={editGroupName} onChange={e => setEditGroupName(e.target.value)} className="input" required />
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" type="button" onClick={() => setShowEditGroupModal(false)}>Cancelar</Button>
                        <Button type="submit" disabled={submitting} className="btn-primary">Guardar</Button>
                    </ModalFooter>
                </form>
            </Modal>

            {/* Edit Trip Modal (Reused) */}
            <Modal isOpen={showEditTripModal} onClose={() => setShowEditTripModal(false)}>
                <ModalHeader>Editar Viagem</ModalHeader>
                <form onSubmit={handleUpdateTrip}>
                    <ModalBody className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nome da Viagem</label>
                            <input
                                type="text"
                                value={editTripName}
                                onChange={e => setEditTripName(e.target.value)}
                                className="input"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Descrição (opcional)</label>
                            <textarea
                                value={editTripDescription}
                                onChange={e => setEditTripDescription(e.target.value)}
                                className="input min-h-[100px]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Estado</label>
                            <select
                                value={editTripStatus}
                                onChange={e => setEditTripStatus(e.target.value as any)}
                                className="input"
                            >
                                <option value="open">🟢 A Decorrer</option>
                                <option value="closed">🔴 Terminada</option>
                            </select>
                        </div>
                    </ModalBody>
                    <ModalFooter className="flex gap-3 justify-end">
                        <Button type="button" variant="ghost" onClick={() => setShowEditTripModal(false)}>Cancelar</Button>
                        <Button type="submit" className="btn-primary">
                            Guardar
                        </Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}
