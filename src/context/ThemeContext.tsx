'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Default to 'light' per user request, but check localStorage first
    const [theme, setThemeState] = useState<Theme>('light');
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        // Check local storage
        const savedTheme = localStorage.getItem('theme') as Theme | null;
        if (savedTheme) {
            setThemeState(savedTheme);
        } else {
            // Default is light, no need to check system preference if "should be light by default" is strict
            // But usually good to respect user choice if they previously visited
            setThemeState('light');
        }
    }, []);

    useEffect(() => {
        if (!isMounted) return;

        const root = window.document.documentElement;

        // Remove both classes first
        root.classList.remove('light', 'dark');

        // Add current theme
        root.classList.add(theme);

        // Save to local storage
        localStorage.setItem('theme', theme);

        // Also update meta theme-color if needed (optional)
        // const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        // if (metaThemeColor) {
        //     metaThemeColor.setAttribute('content', theme === 'dark' ? '#020617' : '#f8fafc');
        // }

    }, [theme, isMounted]);

    const toggleTheme = () => {
        setThemeState(prev => prev === 'light' ? 'dark' : 'light');
    };

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    // Return current theme and toggle function
    // Prevent flash of wrong theme by not rendering children until mounted? 
    // Or just let it hydrate. For simple apps, hydration mismatch is minimal issue if defaults match server (light).
    // Since Next.js, 'light' matches server default if we assume that.

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
