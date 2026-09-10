import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
    onClick?: () => void;
    style?: React.CSSProperties;
}

export function Card({ children, className, hover = false, onClick, style }: CardProps) {
    return (
        <div
            className={cn(
                'bg-surface border border-hairline rounded-2xl shadow-sm transition duration-200',
                hover && 'hover:-translate-y-0.5 hover:shadow-md',
                onClick && 'cursor-pointer',
                className,
            )}
            onClick={onClick}
            style={style}
        >
            {children}
        </div>
    );
}

interface SectionProps {
    children: React.ReactNode;
    className?: string;
}

export function CardHeader({ children, className }: SectionProps) {
    return <div className={cn('p-5 pb-3', className)}>{children}</div>;
}

export function CardBody({ children, className }: SectionProps) {
    return <div className={cn('p-5 pt-0', className)}>{children}</div>;
}

export function CardFooter({ children, className }: SectionProps) {
    return (
        <div className={cn('p-5 pt-4 border-t border-hairline', className)}>{children}</div>
    );
}
