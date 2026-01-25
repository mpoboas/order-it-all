'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

interface HeaderProps {
    title?: string;
    subtitle?: string;
    showBack?: boolean;
    transparent?: boolean;
    backUrl?: string;
}

export function Header({ title, subtitle, showBack, transparent = false, groupId, currentView, backUrl }: HeaderProps & { groupId?: string; currentView?: 'trips' | 'splits' }) {
    const { user, logout, isLoggedIn } = useUser();
    const router = useRouter();
    const pathname = usePathname();
    const userName = user?.name || user?.email || '??';

    const isAdmin = pathname.includes('/admin');
    const displayTitle = title || (isAdmin ? 'Admin' : 'Order It All!');
    const displaySubtitle = subtitle || (isAdmin ? 'Gerir viagens' : 'Tu pedes, nós entregamos!');

    const handleSwitchView = () => {
        if (!groupId) return;
        const target = currentView === 'trips' ? 'splits' : 'trips';
        router.push(`/groups/${groupId}/${target}`);
    };

    return (
        <header
            className={cn(
                'sticky top-0 z-40 transition-all duration-300',
                transparent
                    ? 'bg-transparent'
                    : 'bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600'
            )}
        >
            <div className="px-4 py-4 md:py-5">
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                    {/* Left side */}
                    <div className="flex items-center min-w-0">
                        {groupId && !backUrl ? (
                            <button
                                onClick={() => router.push('/groups')}
                                className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center mr-3 hover:bg-white/30 transition-colors active:scale-95"
                                title="Voltar aos Grupos"
                            >
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </button>
                        ) : showBack || backUrl ? (
                            <button
                                onClick={() => backUrl ? router.push(backUrl) : router.back()}
                                className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center mr-3 hover:bg-white/30 transition-colors active:scale-95"
                            >
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                        ) : (
                            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center mr-3">
                                <span className="text-xl">🛒</span>
                            </div>
                        )}
                        <div className="min-w-0">
                            <h1 className="text-lg md:text-xl font-bold text-white truncate">{displayTitle}</h1>
                            <p className="text-xs md:text-sm text-white/80 truncate hidden sm:block">{displaySubtitle}</p>
                        </div>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2">
                        {/* Toggle View Button (Only inside group) */}
                        {groupId && currentView && (
                            <button
                                onClick={handleSwitchView}
                                className="px-3 py-2 bg-white/20 backdrop-blur rounded-lg text-white text-xs font-bold uppercase tracking-wider hover:bg-white/30 transition-all flex items-center gap-2"
                            >
                                {currentView === 'trips' ? (
                                    <>
                                        <span className="material-icons text-sm">call_split</span>
                                        <span className="hidden sm:inline">Ver Splits</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-icons text-sm">flight_takeoff</span>
                                        <span className="hidden sm:inline">Ver Viagens</span>
                                    </>
                                )}
                            </button>
                        )}

                        {isLoggedIn && (
                            <button
                                onClick={logout}
                                className="relative group"
                                title="Sair"
                            >
                                <Avatar
                                    name={userName}
                                    src={user?.avatar ? `https://pb-orderit.povoas.top/api/files/users/${user.id}/${user.avatar}` : undefined}
                                    size="md"
                                    className="ring-2 ring-white/30 hover:ring-white/50 transition-all"
                                />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}

function NavLink({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
    const router = useRouter();

    return (
        <button
            onClick={() => router.push(href)}
            className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                current
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
            )}
        >
            {children}
        </button>
    );
}
