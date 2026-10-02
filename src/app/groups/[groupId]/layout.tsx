'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
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
import { StatusBarTint } from '@/components/ui/StatusBarTint';
import { ListSkeleton } from '@/components/ui/ListSkeleton';
import { GroupOverviewSkeleton } from '@/components/features/GroupOverviewBar';

/** Placeholder do portão do grupo — só aparece em entradas verdadeiramente
 *  frias (grupo ainda não visto neste browser: convite novo, 1.ª sync).
 *  Mesma ordem e geometria da página real: capa (`HeroHeader` compacto, na
 *  cor da marca), resumo + ações rápidas, separadores e linhas de despesa —
 *  a troca skeleton→conteúdo não dá reflow (Fase 14). */
function GroupShellSkeleton() {
    return (
        <div aria-hidden className="min-h-dvh bg-app">
            <div className="h-[calc(7rem+var(--safe-top))] brand-surface relative">
                <StatusBarTint background="var(--brand-from)" />
                <div className="absolute inset-x-4 bottom-3 flex items-end gap-3 animate-pulse">
                    <div className="h-7 w-44 rounded-full bg-white/25" />
                    <div className="ml-auto flex">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="-ml-2 first:ml-0 w-8 h-8 rounded-full bg-white/30 ring-2 ring-white/60" />
                        ))}
                    </div>
                </div>
            </div>
            <GroupOverviewSkeleton />
            <div className="px-4 pt-3 pb-2 animate-pulse">
                <div className="h-9 rounded-full bg-surface-sunken max-w-6xl mx-auto" />
            </div>
            <div className="px-2 sm:px-4 py-4 max-w-2xl mx-auto">
                <ListSkeleton rows={5} leading="dated" />
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
    const pathname = usePathname();
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
                        className="mt-4 px-6 py-2 bg-primary-600 text-white rounded-full font-semibold hover:bg-primary-700 transition-colors"
                    >
                        Voltar aos Grupos
                    </button>
                </div>
            </div>
        );
    }

    // Editor de itens = ecrã de tarefa (como um formulário): sem a barra
    // global, para a área de trabalho e a barra de totais ficarem sozinhas no
    // fundo (Fase 15). Sai-se pelo "voltar" do cabeçalho.
    const isTaskScreen = pathname.endsWith('/items');

    // Chegar aqui (passado `loading`/`error`) já garante `isMember` — sem
    // depender do `GroupContext` (que só atualiza num efeito, um tick
    // atrás), a bottom nav aparece no mesmo render que o resto do ecrã.
    return (
        <UnsavedDraftProvider>
            {/* `bg-app`: o espaço reservado à barra de baixo pinta o fundo da
                app — o `body` tem a cor da barra de estado (azul). */}
            <div className={isTaskScreen ? 'bg-app' : 'bg-app has-bottom-nav'}>
                {children}
                {!isTaskScreen && <GlobalBottomNav />}
            </div>
        </UnsavedDraftProvider>
    );
}
