import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
    onClick?: () => void;
    style?: React.CSSProperties;
}

export function Card({ children, className, hover = true, onClick, style }: CardProps) {
    return (
        <div
            className={cn(
                'bg-white rounded-2xl shadow-lg transition duration-300',
                hover && 'hover:-translate-y-0.5 hover:shadow-xl',
                onClick && 'cursor-pointer',
                className
            )}
            onClick={onClick}
            style={style}
        >
            {children}
        </div>
    );
}

interface CardHeaderProps {
    children: React.ReactNode;
    className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
    return (
        <div className={cn('p-6 pb-4', className)}>
            {children}
        </div>
    );
}

interface CardBodyProps {
    children: React.ReactNode;
    className?: string;
}

export function CardBody({ children, className }: CardBodyProps) {
    return (
        <div className={cn('p-6 pt-0', className)}>
            {children}
        </div>
    );
}

interface CardFooterProps {
    children: React.ReactNode;
    className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
    return (
        <div className={cn('p-6 pt-4 border-t border-gray-100', className)}>
            {children}
        </div>
    );
}
