'use client';

import { Sheet } from '@/components/ui/Sheet';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EXPENSE_CATEGORIES } from '@/lib/ledger/categories';
import { cn } from '@/lib/utils';

interface CategoryPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onSelect: (categoryId: string) => void;
}

export function CategoryPickerSheet({ isOpen, onClose, value, onSelect }: CategoryPickerSheetProps) {
  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Categoria" size="medium">
      <div className="grid grid-cols-3 gap-3 pb-2">
        {EXPENSE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              onSelect(cat.id);
              onClose();
            }}
            className={cn(
              'flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-colors',
              value === cat.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-transparent hover:bg-surface-sunken',
            )}
          >
            <CategoryIcon category={cat.id} size="lg" />
            <span className="text-xs font-medium text-ink text-center leading-tight">{cat.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
