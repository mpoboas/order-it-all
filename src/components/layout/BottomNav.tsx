'use client';

import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useWebHaptics } from 'web-haptics/react';
import { useTryNavigate } from '@/context/UnsavedDraftContext';

interface NavItem {
    href: string;
    label: string;
    icon: React.ReactNode;
    activeIcon: React.ReactNode;
}

interface BottomNavProps {
    groupId: string;
}

export function BottomNav({ groupId }: BottomNavProps) {
    const pathname = usePathname();
    const router = useRouter();
    const tryNavigate = useTryNavigate();
    const { trigger } = useWebHaptics();

    const basePath = `/groups/${groupId}`;

    const navItems: NavItem[] = [
        {
            href: `${basePath}/trips`,
            label: 'Viagens',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
            ),
        },
        {
            href: `${basePath}/splits`,
            label: 'Divisor',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
            ),
        },
        {
            href: `${basePath}/admin`,
            label: 'Admin',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
        },
    ];

    const isActive = (href: string) => {
        return pathname.startsWith(href);
    };

    return (
        <nav className="bottom-nav fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-gray-100 dark:border-slate-800 z-50 md:hidden safe-bottom">
            <div className="flex items-center justify-around h-16">
                {navItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <button
                            key={item.href}
                            onClick={() => {
                                trigger();
                                tryNavigate(() => router.push(item.href));
                            }}
                            className={cn(
                                'flex flex-col items-center justify-center flex-1 h-full transition-all duration-200',
                                'active:scale-95',
                                active ? 'text-primary-600' : 'text-gray-600 dark:text-gray-400'
                            )}
                        >
                            <div className={cn(
                                'transition-transform duration-200',
                                active && 'scale-110'
                            )}>
                                {active ? item.activeIcon : item.icon}
                            </div>
                            <span className={cn(
                                'text-xs mt-1 font-medium',
                                active && 'font-semibold'
                            )}>
                                {item.label}
                            </span>
                            {active && (
                                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary-600" />
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
