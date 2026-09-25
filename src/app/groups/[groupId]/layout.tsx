'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSmartRouter } from '@/hooks/useSmartRouter';
import { useUser } from '@/context/UserContext';
import { useGroup } from '@/context/GroupContext';
import { GlobalBottomNav } from '@/components/layout/GlobalBottomNav';
import { UnsavedDraftProvider } from '@/context/UnsavedDraftContext';
import { useGroup as useGroupRecord } from '@/lib/db/hooks';
import { catchUp } from '@/lib/db/sync';
import { useSyncStatus } from '@/context/SyncProvider';
import { navStart } from '@/lib/navProgress';
import { Icon } from '@/components/ui/Icon';

/** Placeholder do portão do grupo — só aparece em entradas verdadeiramente
 *  frias (grupo ainda não visto neste browser: convite novo, 1.ª sync).
 *  Geometria igual à do `HeroHeader` + `GroupTabs` reais (mesma altura,
 *  incluindo `--safe-top`) para a troca skeleton→conteúdo não dar reflow —
 *  ver Fase 14. O conteúdo por baixo (lista, saldo) é responsabilidade de
 *  cada página/`GroupOverviewBar`, não deste portão. */
function GroupShellSkeleton() {
    return (
        <div aria-hidden className="min-h-dvh bg-app animate-pulse">
            <div className="h-[calc(7rem+var(--safe-top))] bg-surface-sunken" />
            <div className="px-4 pt-3 pb-2">
                <div className="h-[42px] rounded-xl bg-surface-sunken max-w-6xl mx-auto" />
            </div>
        </div>
    );
}

export default function GroupLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const params = useParams();
    const router = useSmartRouter();
    const groupId = params.groupId as string;
    const { user, isLoggedIn } = useUser();
    const { setCurrentGroup } = useGroup();

    const group = useGroupRecord(groupId);
    const { hydrating, ready, setActiveGroup } = useSyncStatus();

    // Regista o grupo aberto — dispara a sincronização dos seus dados
    // (trips/orders/items/splits) e as subscrições realtime filtradas.
    useEffect(() => {
        setActiveGroup(groupId);
        return () => setActiveGroup(null);
    }, [groupId, setActiveGroup]);
    // O grupo pode não estar em cache (ex.: acabaste de ser convidado) — ou
    // pode estar em cache mas DESATUALIZADO (ex.: foste removido). O
    // PocketBase não avisa quando deixas de bater certo com o filtro de uma
    // subscrição em tempo real — só pára de enviar, em silêncio. Por isso a
    // sondagem corre sempre que se entra num grupo, não só quando falta em
    // cache: `reconcileDeletes` confirma a lista de acesso a sério contra o
    // servidor e apaga o grupo (e os dados dele) se já não pertenceres lá.
    const [probedId, setProbedId] = useState<string | null>(null);

    const isMember = !!(group && user?.id && group.members.includes(user.id));
    const loading =
        group === undefined ||
        (group === null && (hydrating || !ready || probedId !== groupId));
    const error = !loading && !isMember
        ? group === null
            ? 'Grupo não encontrado'
            : 'Não tens acesso a este grupo'
        : null;

    useEffect(() => {
        if (!isLoggedIn) {
            router.push('/');
        }
    }, [isLoggedIn, router]);

    useEffect(() => {
        if (!ready || probedId === groupId) return;
        catchUp({ reconcileDeletes: true }).finally(() => setProbedId(groupId));
    }, [ready, groupId, probedId]);

    // Se ficares com a aba aberta dentro de um grupo e fores removido nesse
    // meio tempo, a sondagem acima (uma vez por entrada) não apanha isso — só
    // ao voltares a entrar. Isto cobre o caso de teres saído de foco (outra
    // app, outra aba) e voltado: confirma outra vez ao readquirir foco.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                void catchUp({ reconcileDeletes: true });
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    // Mantém o GroupContext em sincronia com a cache local.
    useEffect(() => {
        if (isMember && group) setCurrentGroup(group);
    }, [isMember, group, setCurrentGroup]);

    if (!isLoggedIn) return null;

    if (loading) {
        return <GroupShellSkeleton />;
    }

    if (error) {
        return (
            <div className="min-h-dvh bg-app flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-danger-bg text-danger-fg flex items-center justify-center">
                        <Icon name="warning" className="text-4xl" />
                    </div>
                    <h2 className="text-xl font-semibold text-ink mb-2">{error}</h2>
                    <button
                        onClick={() => { navStart(); router.push('/groups'); }}
                        className="mt-4 px-6 py-2 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors"
                    >
                        Voltar aos Grupos
                    </button>
                </div>
            </div>
        );
    }

    // Chegar aqui (passado `loading`/`error`) já garante `isMember` — sem
    // depender do `GroupContext` (que só atualiza num efeito, um tick
    // atrás), a bottom nav aparece no mesmo render que o resto do ecrã.
    return (
        <UnsavedDraftProvider>
            <div className="has-bottom-nav">
                {children}
                <GlobalBottomNav />
            </div>
        </UnsavedDraftProvider>
    );
}
