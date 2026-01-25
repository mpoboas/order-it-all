'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { pb, usersApi } from '@/lib/pocketbase';
import { useRouter } from 'next/navigation';

interface UserContextType {
    user: any | null;
    isLoggedIn: boolean;
    login: (email: string, pass: string) => Promise<void>;
    register: (email: string, pass: string, passConfirm: string) => Promise<any>;
    logout: () => void;
    updateProfile: (data: any) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<any | null>(pb.authStore.model);
    const [isHydrated, setIsHydrated] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // Sync auth state
        const unsubscribe = pb.authStore.onChange((token, model) => {
            setUser(model);
        });

        // Try to refresh auth if we have a token
        if (pb.authStore.model) {
            usersApi.authRefresh()
                .catch(() => {
                    console.warn('Auth token invalid/expired');
                    usersApi.logout();
                });
        }

        setIsHydrated(true);

        return () => {
            unsubscribe();
        };
    }, []);

    const login = useCallback(async (email: string, pass: string) => {
        await usersApi.authWithPassword(email, pass);
    }, []);

    const register = useCallback(async (email: string, pass: string, passConfirm: string) => {
        return await usersApi.create({
            email,
            password: pass,
            passwordConfirm: passConfirm,
        });
    }, []);

    const updateProfile = useCallback(async (data: any) => {
        if (!user?.id) return;

        // Optimistic update
        setUser((prev: any) => ({ ...prev, ...data }));

        try {
            const updated = await usersApi.update(user.id, data);
            console.log('User profile updated:', updated);

            // Verify if fields were actually saved (check for DB schema issues)
            if (data.daily_requests_count !== undefined && updated.daily_requests_count === undefined) {
                console.warn('WARNING: daily_requests_count was not saved. Check if field exists in PocketBase users collection.');
            }

            setUser(updated);
        } catch (error) {
            console.error('Failed to update profile:', error);
            // Revert on error (fetching fresh state)
            usersApi.authRefresh().then(u => setUser(u.record)).catch(() => { });
        }
    }, [user]);

    const logout = useCallback(() => {
        usersApi.logout();
        router.push('/');
    }, [router]);

    // Prevent hydration mismatch
    if (!isHydrated) {
        return null;
    }

    return (
        <UserContext.Provider
            value={{
                user,
                isLoggedIn: !!user,
                login,
                register,
                logout,
                updateProfile,
            }}
        >
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
}
