import React from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
    'w-full px-4 py-3 rounded-xl border-2 border-hairline bg-surface-sunken text-base text-ink ' +
    'transition-colors placeholder:text-ink-faint ' +
    'focus:outline-none focus:border-primary-500 focus:bg-surface focus:ring-0';
const fieldError = 'border-danger/60 focus:border-danger';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
        <div className="space-y-2">
            {label && (
                <label htmlFor={inputId} className="block text-sm font-bold text-ink">
                    {label}
                </label>
            )}
            <input
                id={inputId}
                className={cn(fieldBase, error && fieldError, className)}
                {...props}
            />
            {error && <p className="text-sm text-danger">{error}</p>}
        </div>
    );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
        <div className="space-y-2">
            {label && (
                <label htmlFor={textareaId} className="block text-sm font-bold text-ink">
                    {label}
                </label>
            )}
            <textarea
                id={textareaId}
                className={cn(fieldBase, 'resize-none', error && fieldError, className)}
                {...props}
            />
            {error && <p className="text-sm text-danger">{error}</p>}
        </div>
    );
}
