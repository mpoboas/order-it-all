import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

function StepNumber({ children }: { children: ReactNode }) {
    return (
        <span className="shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-xs">
            {children}
        </span>
    );
}

/** Os 3 passos reais para adicionar ao ecrã principal no Safari/iOS —
 *  partilhado pelo onboarding e pelo pedido de notificações, para o
 *  utilizador ver sempre a mesma instrução. Passo 2 ("Ver Mais") existe
 *  porque a shell do share sheet vem colapsada — "Adicionar ao Ecrã
 *  Principal" só aparece depois de a expandir. */
export function IosInstallSteps() {
    return (
        <div className="w-full rounded-2xl bg-primary-50 dark:bg-primary-950 p-4 space-y-3">
            <div className="flex items-center gap-3">
                <StepNumber>1</StepNumber>
                <p className="text-sm font-medium text-primary-700 dark:text-primary-200 flex items-center gap-1.5 flex-wrap">
                    Toca em
                    <Icon name="ios_share" className="text-base shrink-0" />
                    <strong>Partilhar</strong>
                </p>
            </div>
            <div className="flex items-center gap-3">
                <StepNumber>2</StepNumber>
                <p className="text-sm font-medium text-primary-700 dark:text-primary-200 flex items-center gap-1.5 flex-wrap">
                    Toca em
                    <Icon name="expand_more" className="text-base shrink-0" />
                    <strong>Ver Mais</strong>
                </p>
            </div>
            <div className="flex items-center gap-3">
                <StepNumber>3</StepNumber>
                <p className="text-sm font-medium text-primary-700 dark:text-primary-200 flex items-center gap-1.5 flex-wrap">
                    Escolhe
                    <Icon name="add_to_home_screen" className="text-base shrink-0" />
                    <strong>Adicionar ao Ecrã Principal</strong>
                </p>
            </div>
        </div>
    );
}
