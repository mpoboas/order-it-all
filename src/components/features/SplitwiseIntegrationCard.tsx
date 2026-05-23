'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGroup } from '@/context/GroupContext';
import { useToast } from '@/context/ToastContext';
import { apiFetch } from '@/lib/apiClient';
import { pb } from '@/lib/pocketbase';
import type { SplitwiseMemberCache } from '@/lib/types';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';

interface SwGroupOption {
  id: number;
  name: string;
  memberCount: number;
}

export function SplitwiseIntegrationCard() {
  const { currentGroup, refreshGroup, isAdmin } = useGroup();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const groupId = currentGroup?.id;

  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [swGroups, setSwGroups] = useState<SwGroupOption[]>([]);
  const [selectedSwGroupId, setSelectedSwGroupId] = useState<number | ''>('');
  const [members, setMembers] = useState<SplitwiseMemberCache[]>([]);
  const [saving, setSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!groupId || !isAdmin) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/groups/${groupId}/splitwise/status`);
      if (!res.ok) throw new Error('status');
      const data = await res.json();
      setConnected(data.connected);
      if (data.splitwise?.splitwise_group_id) {
        setSelectedSwGroupId(data.splitwise.splitwise_group_id);
      }
      if (data.splitwise?.members_cache?.length) {
        setMembers(data.splitwise.members_cache);
      }
    } catch {
      showToast('Erro ao carregar Splitwise', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, isAdmin, showToast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (searchParams.get('splitwise') === 'connected') {
      showToast('Splitwise ligado com sucesso!', 'success');
      loadStatus();
      refreshGroup();
    }
  }, [searchParams, showToast, loadStatus, refreshGroup]);

  const loadSwGroups = async () => {
    if (!groupId) return;
    try {
      const res = await apiFetch(`/api/groups/${groupId}/splitwise/groups`);
      if (!res.ok) throw new Error('groups');
      const data = await res.json();
      setSwGroups(data.groups ?? []);
    } catch {
      showToast('Erro ao listar grupos Splitwise', 'error');
    }
  };

  useEffect(() => {
    if (connected && groupId) loadSwGroups();
  }, [connected, groupId]);

  const handleConnect = async () => {
    if (!groupId) return;
    if (!pb.authStore.token) {
      showToast('Inicia sessão para ligar o Splitwise', 'error');
      return;
    }
    try {
      const res = await apiFetch(
        `/api/splitwise/oauth/start?groupId=${encodeURIComponent(groupId)}&format=json`
      );
      const data = (await res.json()) as { url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      showToast(data.error || 'Erro ao ligar Splitwise', 'error');
    } catch {
      showToast('Erro ao ligar Splitwise', 'error');
    }
  };

  const handleDisconnect = async () => {
    if (!groupId || !confirm('Desligar Splitwise deste grupo?')) return;
    try {
      const res = await apiFetch(`/api/groups/${groupId}/splitwise/configure`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('disconnect');
      setConnected(false);
      setMembers([]);
      setSelectedSwGroupId('');
      showToast('Splitwise desligado', 'success');
      refreshGroup();
    } catch {
      showToast('Erro ao desligar', 'error');
    }
  };

  const handleSaveGroup = async () => {
    if (!groupId || !selectedSwGroupId) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/groups/${groupId}/splitwise/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splitwiseGroupId: selectedSwGroupId }),
      });
      if (!res.ok) throw new Error('save');
      const data = await res.json();
      setMembers(data.members ?? []);
      showToast('Grupo Splitwise associado', 'success');
      refreshGroup();
    } catch {
      showToast('Erro ao guardar grupo', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin || !groupId) return null;

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span
              className="material-icons text-teal-600 dark:text-teal-400 text-xl shrink-0"
              aria-hidden
            >
              call_split
            </span>
            Integração Splitwise
          </h2>
          {!loading && !connected && (
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Liga a tua conta Splitwise (uma vez por grupo). Os restantes membros
              não precisam de ligar — usamos a lista de membros do grupo Splitwise
              no export.
            </p>
          )}
          {!loading && connected && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mt-1">
              Conta ligada
            </p>
          )}
        </div>
        {!loading && connected && (
          <button
            type="button"
            onClick={handleDisconnect}
            className="shrink-0 text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
          >
            Desligar
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <LoadingSpinner size="md" />
        </div>
      ) : !connected ? (
        <button
          type="button"
          onClick={handleConnect}
          className="w-full sm:w-auto btn bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5"
        >
          Ligar Splitwise
        </button>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Grupo Splitwise
            </label>
            <select
              value={selectedSwGroupId}
              onChange={(e) =>
                setSelectedSwGroupId(
                  e.target.value ? Number(e.target.value) : ''
                )
              }
              className="w-full h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-sm"
            >
              <option value="">Seleccionar grupo…</option>
              {swGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.memberCount} membros)
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedSwGroupId || saving}
              onClick={handleSaveGroup}
              className="mt-2 text-sm font-semibold text-teal-600 dark:text-teal-400 disabled:opacity-50"
            >
              {saving ? 'A guardar…' : 'Guardar e actualizar membros'}
            </button>
          </div>

          {members.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
                Membros no Splitwise ({members.length})
              </p>
              <ul className="max-h-40 overflow-y-auto space-y-1 text-sm">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="py-1.5 px-2 rounded-lg bg-[var(--bg-tertiary)]"
                  >
                    <span className="font-medium">{m.displayName}</span>
                    {m.email && (
                      <span className="text-[var(--text-muted)] ml-2 text-xs">
                        {m.email}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
