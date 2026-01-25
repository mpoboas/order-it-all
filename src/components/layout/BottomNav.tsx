'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { cn } from '@/lib/utils';
import { groupsApi } from '@/lib/pocketbase';
import type { Group } from '@/lib/types';

interface NavItem {
    href: string;
    label: string;
    icon: React.ReactNode;
    activeIcon: React.ReactNode;
}

export function BottomNav() {
    const pathname = usePathname();
    const router = useRouter();
    const params = useParams();
    const groupId = params.groupId as string;
    const { user, isLoggedIn } = useUser();
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        if (groupId && user) {
            groupsApi.getById(groupId).then(group => {
                setIsAdmin(group.admins.includes(user.id));
            }).catch(() => setIsAdmin(false));
        }
    }, [groupId, user]);

    // Don't show if not logged in or no group
    if (!isLoggedIn || !groupId) return null;

    const navItems: NavItem[] = [
        {
            href: `/groups/${groupId}`, // Changed to Dashboard as 'Home'
            label: 'Grupo',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            ),
            activeIcon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            ),
        },
        // {
        //     href: `/groups/${groupId}/splits`,
        //     label: 'Divisor',
        //     icon: (
        //         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        //             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        //         </svg>
        //     ),
        //     activeIcon: (
        //         <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        //             <path d="M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        //         </svg>
        //     ),
        // },
    ];

    if (isAdmin) {
        navItems.push({
            href: `/groups/${groupId}/admin`,
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
        });
    }

    const isActive = (href: string) => {
        // Simple exact or prefix match
        return pathname === href || pathname.startsWith(href + '/');
    };

    return (
        <nav className="bottom-nav fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 z-50 md:hidden safe-bottom">
            <div className="flex items-center justify-around h-16">
                {navItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <button
                            key={item.href}
                            onClick={() => router.push(item.href)}
                            className={cn(
                                'flex flex-col items-center justify-center flex-1 h-full transition-all duration-200',
                                'active:scale-95',
                                active ? 'text-violet-600' : 'text-gray-400'
                            )}
                        >
                            <div className={cn(
                                'transition-transform duration-200',
                                'transform', // Fixed: Ensure transform class is present if needed for scale
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
                                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-violet-600" />
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
