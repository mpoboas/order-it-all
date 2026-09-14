'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { usePeopleBalances } from '@/lib/db/hooks';
import { fromCents } from '@/lib/ledger/money';
import { Header } from '@/components/layout/Header';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { Avatar } from '@/components/ui/Avatar';
import { Money } from '@/components/ui/Money';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { useAppNavigate } from '@/hooks/useAppNavigate';

const EPS = 0.5;

export default function PeoplePage() {
    const router = useRouter();
    const nav = useAppNavigate();
    const { user, isLoggedIn } = useUser();
    const people = usePeopleBalances(user?.id);

    useEffect(() => {
        if (!isLoggedIn) router.push('/');
    }, [isLoggedIn, router]);

    if (!isLoggedIn) return null;

    return (
        <div className="min-h-dvh bg-app">
            <Header title="Pessoas" subtitle="Saldo com cada pessoa, em todos os grupos" showBack />

            <main className="container mx-auto max-w-lg px-2 sm:px-4 py-4">
                {!people ? (
                    <div className="flex justify-center py-20">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : people.length === 0 ? (
                    <div className="text-center py-20 px-4">
                        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-primary-50 dark:bg-primary-950 text-primary-500 flex items-center justify-center">
                            <Icon name="group" className="text-5xl" />
                        </div>
                        <h3 className="text-xl font-semibold text-ink mb-2">Sem saldos por agora</h3>
                        <p className="text-ink-soft">Assim que partilhares uma despesa, aparece aqui.</p>
                    </div>
                ) : (
                    <div className="card divide-y divide-hairline overflow-hidden">
                        {people.map((person) => {
                            const settled = Math.abs(person.netCents) < EPS;
                            return (
                                <button
                                    key={person.userId}
                                    type="button"
                                    onClick={() => nav.push(`/people/${person.userId}`, { haptic: false })}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
                                >
                                    <Avatar name={person.party.name} src={person.party.avatar} size="sm" />
                                    <span className="flex-1 min-w-0 font-medium text-ink truncate">{person.party.name}</span>
                                    {settled ? (
                                        <span className="text-sm text-ink-faint shrink-0">Contas em dia</span>
                                    ) : (
                                        <div className="text-right shrink-0">
                                            <p className={cn('text-[10px] font-bold uppercase', person.netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}>
                                                {person.netCents > 0 ? 'deve-te' : 'deves'}
                                            </p>
                                            <Money
                                                value={Math.abs(fromCents(person.netCents))}
                                                className={cn('text-sm font-bold', person.netCents > 0 ? 'text-success-fg' : 'text-warning-fg')}
                                            />
                                        </div>
                                    )}
                                    <Icon name="chevron_right" className="text-ink-faint" />
                                </button>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
