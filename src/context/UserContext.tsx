'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface UserContextType {
    userName: string;
    isLoggedIn: boolean;
    setUser: (name: string) => void;
    logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const STORAGE_KEY = 'orderItAll_userName';

export function UserProvider({ children }: { children: ReactNode }) {
    const [userName, setUserName] = useState<string>('');
    const [isHydrated, setIsHydrated] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            setUserName(stored);
        }
        setIsHydrated(true);
    }, []);

    const setUser = useCallback((name: string) => {
        const trimmedName = name.trim();
        if (trimmedName) {
            localStorage.setItem(STORAGE_KEY, trimmedName);
            setUserName(trimmedName);
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setUserName('');
    }, []);

    // Prevent hydration mismatch
    if (!isHydrated) {
        return null;
    }

    return (
        <UserContext.Provider
            value={{
                userName,
                isLoggedIn: !!userName,
                setUser,
                logout,
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
