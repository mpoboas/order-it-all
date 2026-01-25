'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { groupsApi, pb } from '@/lib/pocketbase';
import type { Group } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/context/ToastContext';
import { Header } from '@/components/layout/Header';

export default function GroupsPage() {
    const { user } = useUser();
    const router = useRouter();
    const { showToast } = useToast();

    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Create Form
    const [newGroupName, setNewGroupName] = useState('');
    const [creating, setCreating] = useState(false);

    // Join Form (Manual Code)
    const [joinCode, setJoinCode] = useState('');
    const [joining, setJoining] = useState(false);

    useEffect(() => {
        if (user) {
            loadGroups();
        }
    }, [user]);

    const loadGroups = async () => {
        try {
            const list = await groupsApi.list();
            setGroups(list);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGroupName.trim()) return;

        setCreating(true);
        try {
            const group = await groupsApi.create({ name: newGroupName.trim() });
            setGroups([group, ...groups]);
            setShowCreateModal(false);
            setNewGroupName('');
            showToast('Grupo criado!', 'success');
            router.push(`/groups/${group.id}`);
        } catch (error) {
            console.error(error);
            showToast('Erro ao criar grupo', 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleJoinGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinCode.trim()) return;

        setJoining(true);
        try {
            const group = await groupsApi.getByInviteCode(joinCode.trim().toUpperCase());
            if (!group) throw new Error('Grupo não encontrado');

            await groupsApi.join(group.id, user!.id);
            showToast('Entraste no grupo!', 'success');
            router.push(`/groups/${group.id}`);
        } catch (error) {
            console.error(error);
            showToast('Código inválido ou erro ao entrar', 'error');
        } finally {
            setJoining(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
            <Header title="Meus Grupos" />

            <main className="max-w-2xl mx-auto p-4 space-y-6">

                {/* Join via Code */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-2">Tens um código de convite?</h3>
                    <form onSubmit={handleJoinGroup} className="flex gap-2">
                        <input
                            type="text"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder="Ex: AB12CD"
                            className="input flex-1 uppercase font-mono tracking-wider"
                        />
                        <Button type="submit" disabled={joining || !joinCode} className="btn-primary">
                            Entrar
                        </Button>
                    </form>
                </div>

                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">Grupos</h2>
                    <Button onClick={() => setShowCreateModal(true)} className="btn-primary text-sm px-4">
                        + Criar Grupo
                    </Button>
                </div>

                {groups.length === 0 ? (
                    <div className="text-center py-12 flex flex-col items-center">
                        <div className="w-20 h-20 mb-4 rounded-full bg-gray-100 flex items-center justify-center text-4xl">
                            👥
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Sem grupos</h3>
                        <p className="text-gray-500 text-sm mb-6">Cria um grupo ou pede um convite para começar.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {groups.map((group) => (
                            <div
                                key={group.id}
                                onClick={() => router.push(`/groups/${group.id}`)}
                                className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer flex items-center gap-4 group-card"
                            >
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                                    {group.name[0].toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-900 text-lg">{group.name}</h3>
                                    <p className="text-sm text-gray-500 flex items-center gap-1">
                                        <span className="material-icons text-xs">people</span>
                                        {group.members.length} membros
                                    </p>
                                </div>
                                <div className="text-gray-300">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Create Group Modal */}
            <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
                <ModalHeader>Criar Novo Grupo</ModalHeader>
                <form onSubmit={handleCreateGroup}>
                    <ModalBody>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Grupo</label>
                                <input
                                    type="text"
                                    value={newGroupName}
                                    onChange={e => setNewGroupName(e.target.value)}
                                    placeholder="Ex: Viagem Ibiza 2024"
                                    className="input w-full"
                                    autoFocus
                                />
                            </div>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" type="button" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
                        <Button type="submit" className="btn-primary" disabled={creating || !newGroupName.trim()}>
                            {creating ? 'A criar...' : 'Criar Grupo'}
                        </Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}
