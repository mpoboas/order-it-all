'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * Lista agrupada estilo Definições do iOS / "Info do grupo" do WhatsApp:
 * secções com um título curto por cima, linhas dentro de um cartão com
 * divisórias, nota opcional por baixo. Substitui a "torre de cartões" (cada
 * opção no seu cartão, com título e descrição) — ver `GroupInfo`.
 */
export function SettingsSection({
    title,
    footer,
    children,
    className,
}: {
    title?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={className}>
            {title && (
                <h2 className="px-4 mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">{title}</h2>
            )}
            <div className="card overflow-hidden divide-y divide-hairline">{children}</div>
            {footer && <p className="px-4 mt-2 text-xs text-ink-faint text-pretty">{footer}</p>}
        </section>
    );
}

type RowTone = 'default' | 'brand' | 'danger';

interface SettingsRowProps {
    /** Ícone num quadrado de cor (azul da marca por omissão). */
    icon?: IconName;
    /** Em vez do ícone (ex.: avatar de um membro). */
    leading?: ReactNode;
    label: ReactNode;
    sublabel?: ReactNode;
    /** À direita (ex.: interruptor, selo). Com `onClick` e sem isto → chevron. */
    trailing?: ReactNode;
    onClick?: () => void;
    /** `brand`: rótulo azul (ações como "Convidar"); `danger`: vermelho. */
    tone?: RowTone;
    disabled?: boolean;
}

export function SettingsRow({ icon, leading, label, sublabel, trailing, onClick, tone = 'default', disabled }: SettingsRowProps) {
    const content = (
        <>
            {leading ??
                (icon && (
                    <span
                        className={cn(
                            'w-9 h-9 shrink-0 rounded-xl flex items-center justify-center',
                            tone === 'danger'
                                ? 'bg-danger-bg text-danger-fg'
                                : 'bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300',
                        )}
                    >
                        <Icon name={icon} className="text-lg" />
                    </span>
                ))}
            <span className="min-w-0 flex-1">
                <span
                    className={cn(
                        'block font-medium break-words',
                        tone === 'brand' && 'text-primary-700 dark:text-primary-300',
                        tone === 'danger' && 'text-danger-fg',
                        tone === 'default' && 'text-ink',
                    )}
                >
                    {label}
                </span>
                {sublabel && <span className="block text-sm text-ink-faint break-words">{sublabel}</span>}
            </span>
            {trailing ?? (onClick && tone === 'default' && <Icon name="chevron_right" className="text-ink-faint shrink-0" />)}
        </>
    );

    const base = 'w-full flex items-center gap-3 px-4 py-3 min-h-14 text-left';
    if (!onClick) return <div className={base}>{content}</div>;
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(base, 'transition-colors hover:bg-surface-sunken active:bg-surface-sunken disabled:opacity-50')}
        >
            {content}
        </button>
    );
}
