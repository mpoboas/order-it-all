import { cn } from '@/lib/utils';
import {
  getItemBrandLabel,
  normalizeItemBrand,
  type NormalizedItemBrand,
} from '@/lib/itemBrand';

const BRAND_CHIP_ICONS: Record<NormalizedItemBrand, string> = {
  official: 'verified',
  'off-brand': 'storefront',
  unset: 'help_outline',
  other: 'label',
};

export function ShoppingItemQuantityBadge({ quantity }: { quantity: number }) {
  return (
    <span
      className="inline-flex items-center justify-center min-w-[2.5rem] h-8 px-2.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-sm font-black text-white dark:text-slate-900 tabular-nums shadow-sm"
      aria-label={`Quantidade: ${quantity}`}
    >
      ×{quantity}
    </span>
  );
}

export function ShoppingItemBrandChip({ brand }: { brand?: string }) {
  const kind = normalizeItemBrand(brand);
  const label = getItemBrandLabel(brand);
  const icon = BRAND_CHIP_ICONS[kind];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold leading-tight',
        kind === 'off-brand' &&
          'bg-amber-100 text-amber-950 border-2 border-amber-400 shadow-sm dark:bg-amber-950/50 dark:text-amber-50 dark:border-amber-500',
        kind === 'official' &&
          'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/50 dark:text-slate-200 dark:border-slate-600',
        kind === 'unset' &&
          'bg-gray-50 text-gray-500 border border-dashed border-gray-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600',
        kind === 'other' &&
          'bg-primary-50 text-primary-900 border border-primary-200 dark:bg-primary-950/40 dark:text-primary-100 dark:border-primary-700'
      )}
    >
      <span className="material-icons text-[15px] leading-none shrink-0" aria-hidden>
        {icon}
      </span>
      {label}
    </span>
  );
}

export function ShoppingItemMeta({
  quantity,
  brand,
}: {
  quantity: number;
  brand?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-1.5">
      <ShoppingItemQuantityBadge quantity={quantity} />
      <ShoppingItemBrandChip brand={brand} />
    </div>
  );
}
