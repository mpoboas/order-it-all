import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
        <div className="space-y-2">
            {label && (
                <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}
            <input
                id={inputId}
                className={cn(
                    'w-full px-4 py-3 border-2 border-gray-200 rounded-xl',
                    'text-base transition-all duration-200',
                    'focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
                    'placeholder:text-gray-400',
                    error && 'border-red-300 focus:border-red-500 focus:ring-red-500/20',
                    className
                )}
                {...props}
            />
            {error && (
                <p className="text-sm text-red-500">{error}</p>
            )}
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
                <label htmlFor={textareaId} className="block text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}
            <textarea
                id={textareaId}
                className={cn(
                    'w-full px-4 py-3 border-2 border-gray-200 rounded-xl',
                    'text-base transition-all duration-200 resize-none',
                    'focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
                    'placeholder:text-gray-400',
                    error && 'border-red-300 focus:border-red-500 focus:ring-red-500/20',
                    className
                )}
                {...props}
            />
            {error && (
                <p className="text-sm text-red-500">{error}</p>
            )}
        </div>
    );
}
