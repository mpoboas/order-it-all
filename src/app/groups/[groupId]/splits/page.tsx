'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** "Divisões" mudou de nome/lugar — agora é a tab "Despesas" (Fase 2 do
 *  livro-razão). Mantém o link antigo vivo em vez de dar 404. */
export default function LegacySplitsRedirect() {
    const params = useParams();
    const router = useRouter();
    const groupId = params.groupId as string;

    useEffect(() => {
        router.replace(`/groups/${groupId}/expenses`);
    }, [groupId, router]);

    return null;
}
