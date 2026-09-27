import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

interface AvatarStackProps {
    people: { id: string; name: string; src?: string }[];
    /** Quantos avatares mostrar antes do "+N". */
    max?: number;
    size?: 'xs' | 'sm';
    className?: string;
}

/** Avatares sobrepostos + "+N" — resumo compacto de "quem" numa linha de
 *  lista (participantes de uma divisão, quem consumiu um item). */
export function AvatarStack({ people, max = 4, size = 'xs', className }: AvatarStackProps) {
    const shown = people.slice(0, max);
    const overflow = people.length - shown.length;
    const overlap = size === 'xs' ? '-ml-1.5' : '-ml-2';
    return (
        <div className={cn('flex items-center shrink-0', className)}>
            {shown.map((p, i) => (
                <div key={p.id} className={cn('flex rounded-full ring-2 ring-surface', i > 0 && overlap)}>
                    <Avatar name={p.name} src={p.src} size={size} />
                </div>
            ))}
            {overflow > 0 && (
                <span
                    className={cn(
                        'rounded-full ring-2 ring-surface bg-surface-sunken text-ink-soft font-semibold flex items-center justify-center px-1',
                        overlap,
                        size === 'xs' ? 'h-5 min-w-5 text-[10px]' : 'h-8 min-w-8 text-xs',
                    )}
                >
                    +{overflow}
                </span>
            )}
        </div>
    );
}
