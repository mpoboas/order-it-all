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
    // No servidor nao ha DOM: 'light' (igual ao script bloqueante em layout.tsx).
    // No cliente lemos a classe que esse script ja aplicou ao <html> antes do
    // paint, portanto o primeiro render ja tem o tema certo e sem flash.
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof document === 'undefined') return 'light';
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });

    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('dark', theme === 'dark');
        root.classList.toggle('light', theme === 'light');
        try {
            localStorage.setItem('theme', theme);
        } catch {
            // localStorage indisponivel (modo privado) — o tema fica so nesta sessao.
        }
    }, [theme]);

    const toggleTheme = () => {
        setThemeState(prev => prev === 'light' ? 'dark' : 'light');
    };

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

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
