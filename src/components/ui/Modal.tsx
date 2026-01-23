'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    className?: string;
}

export function Modal({ isOpen, onClose, children, className }: ModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    // Close on backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div
                className={cn(
                    'bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200',
                    className
                )}
            >
                {children}
            </div>
        </div>
    );
}

interface ModalHeaderProps {
    children: React.ReactNode;
    className?: string;
}

export function ModalHeader({ children, className }: ModalHeaderProps) {
    return (
        <div className={cn('p-6 pb-4', className)}>
            {children}
        </div>
    );
}

interface ModalBodyProps {
    children: React.ReactNode;
    className?: string;
}

export function ModalBody({ children, className }: ModalBodyProps) {
    return (
        <div className={cn('flex-1 overflow-y-auto px-6', className)}>
            {children}
        </div>
    );
}

interface ModalFooterProps {
    children: React.ReactNode;
    className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
    return (
        <div className={cn('p-6 pt-4 border-t border-gray-200', className)}>
            {children}
        </div>
    );
}
