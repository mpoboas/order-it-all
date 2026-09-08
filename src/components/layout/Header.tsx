'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { Avatar } from '@/components/ui/Avatar';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { getGroupAvatarUrl } from '@/lib/groupAvatars';
import { cn } from '@/lib/utils';
import { useWebHaptics } from 'web-haptics/react';
import { useTryNavigate } from '@/context/UnsavedDraftContext';

interface HeaderProps {
    title?: string;
    subtitle?: string;
    showBack?: boolean;
    transparent?: boolean;
    groupId?: string;
    icon?: React.ReactNode;
}

export function Header({ title, subtitle, showBack, transparent = false, groupId, icon }: HeaderProps) {
    const { user, logout, isLoggedIn } = useUser();
    const { currentGroup, isAdmin } = useGroup();
    const router = useRouter();
    const pathname = usePathname();
    const tryNavigate = useTryNavigate();
    const { trigger } = useWebHaptics();
    const userName = user?.name || user?.email || '??';

    // Determine current section within a group
    const isInTrips = pathname.includes('/trips');
    const isInSplits = pathname.includes('/splits');
    const isInAdmin = pathname.includes('/admin');
    const isInGroup = !!groupId || pathname.startsWith('/groups/');

    const displayTitle = title || currentGroup?.name || 'Order It All!';
    const displaySubtitle = subtitle || (isInAdmin ? 'Painel de administração' : 'Tu pedes, nós entregamos!');

    const handleBack = () => {
        if (isInGroup && groupId) {
            // If on trips/splits list, go back to groups
            if (pathname === `/groups/${groupId}/trips` || pathname === `/groups/${groupId}/splits`) {
                router.push('/groups');
            } else {
                router.back();
            }
        } else {
            router.back();
        }
    };

    // Toggle to the other section (trips <-> splits) for non-admin users
    const getToggleHref = () => {
        if (!groupId) return null;
        if (isInTrips) return `/groups/${groupId}/splits`;
        if (isInSplits) return `/groups/${groupId}/trips`;
        return null;
    };

    const toggleHref = getToggleHref();
    const showToggle = isInGroup && !isAdmin && toggleHref;

    return (
        <header
            className={cn(
                'sticky top-0 z-40 transition-all duration-300 safe-top',
                transparent
                    ? 'bg-transparent'
                    : 'bg-gradient-to-r from-primary-600 via-primary-700 to-primary-800'
            )}
        >
            <div className="px-4 py-4 md:py-5">
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                    {/* Left side */}
                    <div className="flex items-center min-w-0">
                        {showBack ? (
                            <button
                                type="button"
                                aria-label="Voltar"
                                onClick={() => {
                                    trigger();
                                    tryNavigate(() => handleBack());
                                }}
                                className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center mr-3 hover:bg-white/30 transition-colors active:scale-95"
                            >
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                        ) : (
                            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center mr-3 overflow-hidden">
                                {icon ? (
                                    typeof icon === 'string' ? (
                                        <span className="text-xl">{icon}</span>
                                    ) : (
                                        icon
                                    )
                                ) : currentGroup && getGroupAvatarUrl(currentGroup.id, currentGroup.avatar) ? (
                                    <RemoteImage
                                        src={getGroupAvatarUrl(currentGroup.id, currentGroup.avatar)!}
                                        alt="Grupo"
                                        width={40}
                                        height={40}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <span className="text-xl">{currentGroup?.avatar || '🛒'}</span>
                                )}
                            </div>
                        )}
                        <div className="min-w-0">
                            <h1 className="text-lg md:text-xl font-bold text-white truncate">{displayTitle}</h1>
                            <p className="text-xs md:text-sm text-white/80 truncate hidden sm:block">{displaySubtitle}</p>
                        </div>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2">
                        {/* Toggle button for non-admin users in a group */}
                        {showToggle && (
                            <button
                                type="button"
                                aria-label={isInTrips ? 'Ver Divisões' : 'Ver Viagens'}
                                onClick={() => {
                                    trigger();
                                    tryNavigate(() => router.push(toggleHref!));
                                }}
                                className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-colors active:scale-95"
                            >
                                {isInTrips ? (
                                    // Calculator icon for splits
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                ) : (
                                    // Shopping bag icon for trips
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                    </svg>
                                )}
                            </button>
                        )}

                        {/* Desktop nav links - only for admins in group */}
                        {isAdmin && groupId && (
                            <nav className="hidden md:flex items-center gap-1 mr-4">
                                <NavLink href={`/groups/${groupId}/trips`} current={isInTrips}>
                                    Viagens
                                </NavLink>
                                <NavLink href={`/groups/${groupId}/splits`} current={isInSplits}>
                                    Divisor
                                </NavLink>
                                <NavLink href={`/groups/${groupId}/admin`} current={isInAdmin}>
                                    Admin
                                </NavLink>
                            </nav>
                        )}

                        {isLoggedIn && (
                            <button
                                type="button"
                                aria-label="Meu perfil"
                                onClick={() => {
                                    trigger();
                                    tryNavigate(() => router.push('/profile'));
                                }}
                                className="relative group"
                            >
                                <Avatar
                                    name={userName}
                                    src={user?.avatar ? `https://pb-orderit.povoas.top/api/files/users/${user.id}/${user.avatar}` : undefined}
                                    size="md"
                                    className="ring-2 ring-white/30 hover:ring-white/50 transition-all"
                                />
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                </div>
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
    const tryNavigate = useTryNavigate();
    const { trigger } = useWebHaptics();

    return (
        <button
            onClick={() => {
                trigger();
                tryNavigate(() => router.push(href));
            }}
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
