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
}

export function Header({ title, subtitle, showBack, transparent = false }: HeaderProps) {
    const { userName, logout, isLoggedIn } = useUser();
    const router = useRouter();
    const pathname = usePathname();

    const isAdmin = pathname.startsWith('/admin');
    const displayTitle = title || (isAdmin ? 'Admin' : 'Order It All!');
    const displaySubtitle = subtitle || (isAdmin ? 'Gerir viagens' : 'Tu pedes, nós entregamos!');

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
                        {showBack ? (
                            <button
                                onClick={() => router.back()}
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
                        {/* Desktop nav links */}
                        <nav className="hidden md:flex items-center gap-1 mr-4">
                            <NavLink href="/trips" current={pathname.startsWith('/trips')}>
                                Viagens
                            </NavLink>
                            <NavLink href="/splitter" current={pathname.startsWith('/splitter')}>
                                Divisor
                            </NavLink>
                            <NavLink href="/admin" current={pathname.startsWith('/admin')}>
                                Admin
                            </NavLink>
                        </nav>

                        {/* User avatar */}
                        {isLoggedIn && (
                            <button
                                onClick={logout}
                                className="relative group"
                                title="Sair"
                            >
                                <Avatar name={userName} size="md" className="ring-2 ring-white/30 hover:ring-white/50 transition-all" />
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
