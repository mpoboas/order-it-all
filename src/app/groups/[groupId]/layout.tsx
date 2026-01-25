'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { groupsApi } from '@/lib/pocketbase';
import { useUser } from '@/context/UserContext';
import { GroupProvider } from '@/context/GroupContext';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import type { Group } from '@/lib/types';

export default function GroupLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoggedIn } = useUser();
    const router = useRouter();
    const params = useParams();
    const pathname = usePathname();
    const groupId = params.groupId as string;

    const [group, setGroup] = useState<Group | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isLoggedIn) {
            return; // Middleware/Global layout handles this usually
        }

        const loadGroup = async () => {
            try {
                const g = await groupsApi.getById(groupId);

                // Check membership
                if (!g.members.includes(user!.id)) {
                    router.push('/groups');
                    return;
                }

                setGroup(g);
            } catch (error) {
                console.error("Error loading group", error);
                router.push('/groups');
            } finally {
                setLoading(false);
            }
        };

        if (groupId && user) {
            loadGroup();
        }
    }, [groupId, user, isLoggedIn, router]);

    if (loading || !group) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    const isCreator = group.creator === user?.id;
    const isAdmin = isCreator || group.admins.includes(user?.id || '');
    const currentView = pathname.includes('/splits') ? 'splits' : 'trips';

    return (
        <GroupProvider group={group}>
            <div className="min-h-screen bg-[var(--bg-primary)] pb-20">
                <Header
                    title={group.name}
                    subtitle={isAdmin ? 'Admin View' : 'Member View'}
                    groupId={group.id}
                    currentView={currentView}
                />

                <main>
                    {children}
                </main>

                {isAdmin && <BottomNav groupId={group.id} />}
            </div>
        </GroupProvider>
    );
}
