import { cn } from '@/lib/utils';

type StatTone = 'default' | 'success' | 'warning' | 'danger';

const TONE: Record<StatTone, string> = {
    default: 'text-ink',
    success: 'text-success-fg',
    warning: 'text-warning-fg',
    danger: 'text-danger-fg',
};

interface StatCardProps {
    label: string;
    value: React.ReactNode;
    tone?: StatTone;
    className?: string;
}

/** Cartão de estatística — rótulo pequeno em cima, número grande em baixo. */
export function StatCard({ label, value, tone = 'default', className }: StatCardProps) {
    return (
        <div className={cn('card p-3 flex flex-col items-center justify-center text-center', className)}>
            <p className="text-[10px] uppercase tracking-wider font-bold text-ink-faint mb-1">
                {label}
            </p>
            <p className={cn('text-xl font-black tabular-nums', TONE[tone])}>{value}</p>
        </div>
    );
}
