'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Group } from '@/lib/types';
import { useUser } from './UserContext';

interface GroupContextType {
    group: Group | null;
    isAdmin: boolean;
    isCreator: boolean;
    setGroup: (group: Group) => void;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

export function GroupProvider({
    children,
    group: initialGroup
}: {
    children: ReactNode;
    group: Group | null;
}) {
    const { user } = useUser();
    const [group, setGroup] = useState<Group | null>(initialGroup);

    // Update local state if prop changes (e.g. re-fetch in layout)
    useEffect(() => {
        if (initialGroup) setGroup(initialGroup);
    }, [initialGroup]);

    const isCreator = group?.creator === user?.id;
    const isAdmin = isCreator || (group?.admins.includes(user?.id || '') || false);

    return (
        <GroupContext.Provider value={{ group, isAdmin, isCreator, setGroup }}>
            {children}
        </GroupContext.Provider>
    );
}

export function useGroup() {
    const context = useContext(GroupContext);
    if (context === undefined) {
        throw new Error('useGroup must be used within a GroupProvider');
    }
    return context;
}
