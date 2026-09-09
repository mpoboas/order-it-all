'use client';

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Aplica o tema ao `<html>` **e** grava no `localStorage` de forma síncrona.
 * Feito no handler (não só num `useEffect`) para garantir a persistência mesmo
 * que o utilizador navegue logo a seguir — a navegação com View Transitions
 * suspende a árvore de providers e um efeito passivo pendente pode não chegar a
 * correr antes de a app fechar/recarregar.
 */
function persistTheme(next: Theme) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dark', next === 'dark');
    root.classList.toggle('light', next === 'light');
    try {
        localStorage.setItem('theme', next);
    } catch {
        // localStorage indisponível (modo privado) — o tema fica só nesta sessão.
    }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // No servidor não há DOM: 'light' (igual ao script bloqueante em layout.tsx).
    // No cliente lemos o localStorage (fonte de verdade) e caímos na classe já
    // aplicada pelo script — o primeiro render já tem o tema certo, sem flash.
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof document === 'undefined') return 'light';
        try {
            const stored = localStorage.getItem('theme');
            if (stored === 'dark' || stored === 'light') return stored;
        } catch {
            /* ignore */
        }
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });

    const setTheme = useCallback((next: Theme) => {
        persistTheme(next);
        setThemeState(next);
    }, []);

    const toggleTheme = useCallback(() => {
        setThemeState((prev) => {
            const next: Theme = prev === 'light' ? 'dark' : 'light';
            persistTheme(next);
            return next;
        });
    }, []);

    // Rede de segurança: mantém `<html>` / localStorage em sincronia com o estado
    // (ex.: se algum dia o tema mudar por outra via que não os handlers acima).
    useEffect(() => {
        persistTheme(theme);
    }, [theme]);

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
