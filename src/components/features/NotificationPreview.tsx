import { Icon } from '@/components/ui/Icon';

/** Réplica estática de uma notificação push — usada no onboarding e no
 *  soft-ask de notificações para dar uma ideia real do que se recebe, em
 *  vez de só descrever por texto. */
export function NotificationPreview({ title, body }: { title: string; body: string }) {
    return (
        <div className="flex items-start gap-3 rounded-2xl bg-surface border border-hairline shadow-sm p-3">
            <div className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-950 flex items-center justify-center shrink-0">
                <Icon
                    name="notifications_active"
                    className="text-lg text-primary-700 dark:text-primary-200"
                />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-ink text-sm truncate">{title}</p>
                    <span className="text-[11px] text-ink-faint shrink-0">agora</span>
                </div>
                <p className="text-sm text-ink-soft mt-0.5">{body}</p>
            </div>
        </div>
    );
}
