import { Icon } from '@/components/ui/Icon';
import { getCategory } from '@/lib/ledger/categories';
import { cn } from '@/lib/utils';

type CategoryIconSize = 'md' | 'lg';

const TINT_CLASS: Record<string, string> = {
  info: 'bg-info-bg text-info-fg',
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
};

const SIZE_CLASS: Record<CategoryIconSize, string> = {
  md: 'w-10 h-10 text-lg rounded-xl',
  lg: 'w-14 h-14 text-2xl rounded-2xl',
};

interface CategoryIconProps {
  category: string | undefined;
  size?: CategoryIconSize;
  className?: string;
  onClick?: () => void;
}

/** Tile de categoria — fundo pastel tingido (legível também em dark, à
 *  Splitwise), usado na lista/formulário/detalhe de despesas. */
export function CategoryIcon({ category, size = 'md', className, onClick }: CategoryIconProps) {
  const cat = getCategory(category);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center shrink-0',
        SIZE_CLASS[size],
        TINT_CLASS[cat.tint],
        onClick && 'active:scale-95 transition',
        className,
      )}
      aria-label={onClick ? `Categoria: ${cat.label}` : undefined}
      title={cat.label}
    >
      <Icon name={cat.icon} strokeWidth={2} />
    </Tag>
  );
}
