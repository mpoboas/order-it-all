'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { tripsApi, subscriptions } from '@/lib/pocketbase';
import type { Trip } from '@/lib/types';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { useToast } from '@/context/ToastContext';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn, getRelativeTime } from '@/lib/utils';

export default function AdminDashboardPage() {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const { showToast } = useToast();

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
    const [editTripStatus, setEditTripStatus] = useState<'open' | 'closed'>('open');

    const loadTrips = async () => {
        try {
            const data = await tripsApi.getAll();
            setTrips(data);
        } catch (error) {
            console.error('Error loading trips:', error);
            showToast('Falha ao carregar viagens', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTrips();
        const unsub = subscriptions.subscribeToTrips(() => loadTrips());
        return () => {
            subscriptions.unsubscribeAll();
        };
    }, []);

    const handleCreateTrip = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTripName.trim()) return;
        setCreating(true);
        try {
            await tripsApi.create({
                name: newTripName.trim(),
                description: newTripDescription.trim(),
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

    const handleUpdateTrip = async (e: React.FormEvent) => {
        e.preventDefault();
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
        if (!confirm('Tem a certeza de que quer terminar esta viagem? Esta acção não pode ser desfeita.')) return;
        try {
            await tripsApi.close(id);
            showToast('Viagem terminada com sucesso!', 'success');
            loadTrips();
        } catch (error) {
            showToast('Falha ao terminar viagem', 'error');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] has-bottom-nav">
            <Header title="Admin Panel" subtitle="Gerir viagens e produtos" />

            <main className="container mx-auto px-4 py-8 max-w-6xl">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)]">
                            Gestão de Viagens
                        </h2>
                        <p className="text-[var(--text-secondary)]">
                            Criar, editar e gerir todas as viagens
                        </p>
                    </div>
                    <Button
                        onClick={() => setShowCreateModal(true)}
                        className="w-full md:w-auto btn-primary"
                    >
                        Criar Viagem
                    </Button>
                </div>

                {/* Content */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {trips.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
                            <div className="w-24 h-24 mb-6 rounded-full bg-violet-100 flex items-center justify-center text-5xl">
                                📋
                            </div>
                            <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                                Nenhuma Viagem Encontrada
                            </h3>
                            <p className="text-[var(--text-secondary)] max-w-sm">
                                Crie a sua primeira viagem de compras para começar a gerir os pedidos!
                            </p>
                            <Button
                                onClick={() => setShowCreateModal(true)}
                                className="mt-6 btn-primary"
                            >
                                Criar Primeira Viagem
                            </Button>
                        </div>
                    ) : (
                        trips.map((trip, index) => (
                            <Link
                                key={trip.id}
                                href={`/admin/trips/${trip.id}`}
                                className={cn(
                                    "card card-hover p-5 flex flex-col h-full bg-white group animate-fade-in-up",
                                    "border border-transparent hover:border-violet-100 transition-all duration-300"
                                )}
                                style={{ animationDelay: `${index * 0.05}s` }}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-lg font-bold text-[var(--text-primary)] group-hover:text-violet-600 transition-colors line-clamp-1">
                                        {trip.name}
                                    </h3>
                                    <Badge variant={trip.status === 'open' ? "open" : "closed"}>
                                        {trip.status === 'open' ? 'A Decorrer' : 'Terminada'}
                                    </Badge>
                                </div>

                                <p className="text-[var(--text-secondary)] text-sm mb-6 flex-grow line-clamp-3">
                                    {trip.description || 'Sem descrição'}
                                </p>

                                <div className="mt-auto pt-4 border-t border-gray-100">
                                    <div className="flex items-center justify-between mb-4 text-xs text-[var(--text-muted)] font-medium">
                                        <span>Criada {getRelativeTime(trip.created)}</span>
                                    </div>

                                    <div className="flex gap-2 justify-end" onClick={(e) => e.preventDefault()}>
                                        <button
                                            onClick={(e) => handleOpenEditModal(e, trip)}
                                            className="w-8 h-8 rounded-lg bg-gray-50 text-gray-600 hover:bg-violet-50 hover:text-violet-600 flex items-center justify-center transition-colors"
                                            title="Editar"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </button>

                                        {trip.status === 'open' ? (
                                            <button
                                                onClick={(e) => handleCloseTrip(e, trip.id)}
                                                className="w-8 h-8 rounded-lg bg-gray-50 text-amber-600 hover:bg-amber-50 flex items-center justify-center transition-colors"
                                                title="Terminar"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                            </button>
                                        ) : (
                                            <Link
                                                href={`/splitter?trip=${trip.id}`}
                                                className="w-8 h-8 rounded-lg bg-gray-50 text-emerald-600 hover:bg-emerald-50 flex items-center justify-center transition-colors"
                                                title="Dividir"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                            </Link>
                                        )}

                                        <button
                                            onClick={(e) => handleDeleteTrip(e, trip.id)}
                                            className="w-8 h-8 rounded-lg bg-gray-50 text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
                                            title="Eliminar"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </main>

            {/* Create Trip Modal */}
            <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
                <ModalHeader>
                    <div className="flex items-center gap-3 text-violet-600">
                        <div className="p-2 bg-violet-100 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">Nova Viagem</h2>
                    </div>
                </ModalHeader>
                <form onSubmit={handleCreateTrip}>
                    <ModalBody className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nome da Viagem</label>
                            <input
                                type="text"
                                value={newTripName}
                                onChange={e => setNewTripName(e.target.value)}
                                className="input"
                                placeholder="ex. Compras de Verão 2024"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Descrição (opcional)</label>
                            <textarea
                                value={newTripDescription}
                                onChange={e => setNewTripDescription(e.target.value)}
                                className="input min-h-[100px]"
                                placeholder="Breve descrição da viagem..."
                            />
                        </div>
                    </ModalBody>
                    <ModalFooter className="flex gap-3 justify-end">
                        <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
                        <Button type="submit" disabled={creating} className="btn-primary">
                            {creating ? 'A criar...' : 'Criar Viagem'}
                        </Button>
                    </ModalFooter>
                </form>
            </Modal>

            {/* Edit Trip Modal */}
            <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)}>
                <ModalHeader>
                    <div className="flex items-center gap-3 text-violet-600">
                        <div className="p-2 bg-violet-100 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">Editar Viagem</h2>
                    </div>
                </ModalHeader>
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
                        <Button type="button" variant="ghost" onClick={() => setShowEditModal(false)}>Cancelar</Button>
                        <Button type="submit" className="btn-primary">
                            Guardar Alterações
                        </Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}
