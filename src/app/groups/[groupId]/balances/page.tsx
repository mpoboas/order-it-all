'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { useGroupLedger } from '@/lib/db/hooks';
import { balanceFor } from '@/lib/ledger/balances';
import { partyLabel } from '@/lib/parties';
import { notify, notifiableUserIds } from '@/lib/notify';
import { formatEUR } from '@/lib/money';
import { useToast } from '@/context/ToastContext';
import { HeroHeader } from '@/components/features/HeroHeader';
import { GroupTabs } from '@/components/features/GroupTabs';
import { getGroupHeroBackground, groupHeroAvatars } from '@/lib/groupAvatars';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Icon } from '@/components/ui/Icon';
import { SettleUpSheet } from '@/components/features/SettleUpSheet';
import { BalanceRows } from '@/components/features/BalanceRows';
import { getFabBottom } from '@/lib/bottomDock';


export default function GroupBalancesPage() {
    const params = useParams();
    const groupId = params.groupId as string;
    const router = useRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const { currentGroup, isAdmin } = useGroup();
    const { showToast } = useToast();

    const ledger = useGroupLedger(groupId);
    const [showSettleUp, setShowSettleUp] = useState(false);

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    // "Lembrete de dívida" manual — 1 por dia por par, para não spammar.
    const handleRemind = useCallback((debtorPartyId: string, amountCents: number) => {
        if (!ledger || !user?.id) return;
        const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
        const key = `debtReminder:${groupId}:${user.id}:${debtorPartyId}`;
        const last = Number(localStorage.getItem(key) ?? '0');
        if (Date.now() - last < REMINDER_COOLDOWN_MS) {
            showToast('Já enviaste um lembrete a esta pessoa hoje', 'info');
            return;
        }
        const targets = notifiableUserIds([debtorPartyId], ledger.parties, user.id);
        if (targets.length === 0) {
            showToast('Esta pessoa não tem conta para notificar', 'info');
            return;
        }
        void notify({
            targetUserIds: targets,
            title: '🔔 Lembrete de dívida',
            message: `${partyLabel(user.id, ledger.parties)} lembra-te que deves ${formatEUR(Math.abs(amountCents) / 100)}.`,
            url: `/groups/${groupId}/balances`,
        });
        localStorage.setItem(key, String(Date.now()));
        showToast('Lembrete enviado', 'success');
    }, [ledger, user, groupId, showToast]);

    const rows = useMemo(() => {
        if (!ledger) return [];
        return Array.from(ledger.parties.keys())
            .filter((id) => !ledger.parties.get(id)?.claimedBy) // reclamado → representado pelo utilizador que o reclamou
            .map((id) => ({ id, ...balanceFor(id, ledger.pairwise, ledger.net) }))
            .sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents));
    }, [ledger]);

    if (!isLoggedIn) return null;

    const memberCount = ledger?.parties.size ?? currentGroup?.members.length ?? 0;
    const heroAvatars = currentGroup ? groupHeroAvatars(currentGroup) : [];

    return (
        <div className="min-h-dvh bg-app has-bottom-nav">
            {currentGroup && (
                <HeroHeader
                    variant="compact"
                    title={currentGroup.name}
                    background={getGroupHeroBackground(currentGroup)}
                    avatars={heroAvatars}
                    avatarOverflowCount={Math.max(0, memberCount - heroAvatars.length)}
                    onBack={() => nav.up()}
                    topRightAction={isAdmin ? {
                        icon: 'settings',
                        label: 'Definições do grupo',
                        onClick: () => nav.push(`/groups/${currentGroup.id}/settings`, { haptic: false }),
                    } : undefined}
                />
            )}
            <GroupTabs groupId={groupId} isAdmin={isAdmin} />

            <main className="container mx-auto px-4 py-4 max-w-lg">
                {!ledger ? (
                    <div className="flex justify-center py-20">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : (
                    <BalanceRows
                        rows={rows}
                        parties={ledger.parties}
                        currentUserId={user?.id}
                        onRemind={handleRemind}
                    />
                )}
            </main>

            {ledger && user?.id && (
                <button
                    type="button"
                    onClick={() => setShowSettleUp(true)}
                    className="fixed right-4 z-30 h-14 px-5 rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/30 flex items-center gap-2 font-semibold active:scale-95 transition"
                    style={{ bottom: getFabBottom(true) }}
                >
                    <Icon name="swap_horiz" className="text-xl" />
                    Acertar contas
                </button>
            )}

            {ledger && user?.id && (
                <SettleUpSheet
                    isOpen={showSettleUp}
                    onClose={() => setShowSettleUp(false)}
                    groupId={groupId}
                    parties={ledger.parties}
                    pairwise={ledger.pairwise}
                    currentUserId={user.id}
                />
            )}
        </div>
    );
}
