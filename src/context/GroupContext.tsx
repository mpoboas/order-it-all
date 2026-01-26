'use client';

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { groupsApi } from '@/lib/pocketbase';
import { useUser } from '@/context/UserContext';
import type { Group } from '@/lib/types';

interface GroupContextType {
    currentGroup: Group | null;
    isAdmin: boolean;
    isCreator: boolean;
    setCurrentGroup: (group: Group | null) => void;
    refreshGroup: () => Promise<void>;
    userGroups: Group[];
    loadUserGroups: () => Promise<void>;
    loadingGroups: boolean;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

export function GroupProvider({ children }: { children: ReactNode }) {
    const { user } = useUser();
    const [currentGroup, setCurrentGroupState] = useState<Group | null>(null);
    const [userGroups, setUserGroups] = useState<Group[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);

    const isCreator = !!(currentGroup && user && currentGroup.creator === user.id);
    const isAdmin = !!(currentGroup && user && currentGroup.admins?.includes(user.id));

    const setCurrentGroup = useCallback((group: Group | null) => {
        setCurrentGroupState(group);
    }, []);

    const refreshGroup = useCallback(async () => {
        if (!currentGroup?.id) return;
        try {
            const updated = await groupsApi.getById(currentGroup.id);
            setCurrentGroupState(updated);
        } catch (error) {
            console.error('Error refreshing group:', error);
        }
    }, [currentGroup?.id]);

    const loadUserGroups = useCallback(async () => {
        if (!user?.id) {
            setUserGroups([]);
            return;
        }
        setLoadingGroups(true);
        try {
            const groups = await groupsApi.getByUser(user.id);
            setUserGroups(groups);
        } catch (error) {
            console.error('Error loading user groups:', error);
            setUserGroups([]);
        } finally {
            setLoadingGroups(false);
        }
    }, [user?.id]);

    return (
        <GroupContext.Provider
            value={{
                currentGroup,
                isAdmin,
                isCreator,
                setCurrentGroup,
                refreshGroup,
                userGroups,
                loadUserGroups,
                loadingGroups,
            }}
        >
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
