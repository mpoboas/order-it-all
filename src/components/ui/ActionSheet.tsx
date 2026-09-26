'use client';

import { Sheet } from '@/components/ui/Sheet';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export interface SheetAction {
    icon: IconName;
    label: string;
    onSelect: () => void;
    /** `danger` para ações destrutivas (apagar) — texto vermelho. */
    tone?: 'default' | 'danger';
    hidden?: boolean;
    disabled?: boolean;
}

interface ActionSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    actions: SheetAction[];
}

/**
 * Menu "⋯" — lista de ações secundárias de uma coisa (viagem, divisão) numa
 * `<Sheet>` pequena, em vez de ícones soltos sempre visíveis na linha. A folha
 * fecha antes de a ação correr, para confirmações (`useConfirm`) e outras
 * sheets abrirem por cima de um ecrã limpo.
 */
export function ActionSheet({ isOpen, onClose, title, actions }: ActionSheetProps) {
    const visible = actions.filter((a) => !a.hidden);
    return (
        <Sheet isOpen={isOpen} onClose={onClose} title={title} size="auto">
            <ul className="divide-y divide-hairline -mx-1">
                {visible.map((action) => (
                    <li key={action.label}>
                        <button
                            type="button"
                            disabled={action.disabled}
                            onClick={() => {
                                onClose();
                                action.onSelect();
                            }}
                            className={cn(
                                'w-full flex items-center gap-3 px-1 py-3.5 text-left text-base font-medium rounded-lg transition-colors',
                                'hover:bg-surface-sunken disabled:opacity-50',
                                action.tone === 'danger' ? 'text-danger-fg' : 'text-ink',
                            )}
                        >
                            <Icon
                                name={action.icon}
                                className={cn('text-xl shrink-0', action.tone === 'danger' ? 'text-danger-fg' : 'text-ink-soft')}
                            />
                            {action.label}
                        </button>
                    </li>
                ))}
            </ul>
        </Sheet>
    );
}
