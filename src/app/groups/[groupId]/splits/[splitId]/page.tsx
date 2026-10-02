'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { expensesApi } from '@/lib/pocketbase';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';

/** Link antigo de uma divisão — agora vive como o editor de itens de uma
 *  despesa itemizada (Fase 2 do livro-razão). Encontra a despesa ligada e
 *  redireciona; sem correspondência (split nunca migrado), volta à lista. */
export default function LegacySplitRedirect() {
    const params = useParams();
    const router = useRouter();
    const groupId = params.groupId as string;
    const splitId = params.splitId as string;

    useEffect(() => {
        let cancelled = false;
        expensesApi.getBySplitId(splitId).then((expense) => {
            if (cancelled) return;
            router.replace(
                expense
                    ? `/groups/${groupId}/expenses/${expense.id}/items`
                    : `/groups/${groupId}/expenses`,
            );
        });
        return () => {
            cancelled = true;
        };
    }, [groupId, splitId, router]);

    return (
        <div className="min-h-dvh bg-app flex items-center justify-center">
            <LoadingSpinner size="lg" />
        </div>
    );
}
