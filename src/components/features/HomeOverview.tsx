'use client';

import { useUser } from '@/context/UserContext';
import { useBalanceOverview } from '@/lib/db/hooks';
import { fromCents } from '@/lib/ledger/money';
import { getUserAvatarUrl } from '@/lib/orderParticipants';
import { Avatar } from '@/components/ui/Avatar';
import { Money } from '@/components/ui/Money';

/** Piso de largura de cada segmento da barra "Visão geral" — o suficiente
 *  para o rótulo ("Devem-te"/"Deves") + o valor a bold não ficarem
 *  espremidos quando um lado é muito maior que o outro. */
const BAR_MIN_SEGMENT_PX = 100;

/** Topo do Início — avatar do utilizador + saudação, seguido de um resumo
 *  "Visão geral": barra proporcional (verde = devem-te, vermelho = deves)
 *  com o rótulo/valor dentro de cada segmento. Em vez de largura em `%`
 *  calculada à mão, cada segmento usa `flexGrow` = o próprio valor (o
 *  flexbox distribui o espaço livre na mesma proporção) e um `minWidth`
 *  em px como piso — quando a proporção real daria menos que isso, o
 *  flexbox "congela" o segmento no piso e dá o espaço que sobra ao outro.
 *  O rácio deixa de ser matematicamente exato num caso extremo, mas o
 *  texto nunca fica espremido nem cortado. `flexBasis: 0` é o que faz o
 *  espaço livre repartir-se na proporção do `flexGrow` desde o início —
 *  com `flexBasis: 'auto'` (omissão) a base de cada segmento seria o
 *  tamanho do seu próprio texto, e só o que sobrasse depois disso é que
 *  seguiria o `flexGrow`, distorcendo o rácio pretendido. */
export function HomeOverview({ className }: { className?: string }) {
    const { user } = useUser();
    const overview = useBalanceOverview(user?.id);
    const settled = overview && overview.receiveCents === 0 && overview.payCents === 0;
    const hasBothSides = !!overview && overview.receiveCents > 0 && overview.payCents > 0;

    return (
        <div className={className}>
            <div className="flex items-center gap-3 mb-4">
                <Avatar
                    name={user?.name || user?.email || 'Tu'}
                    src={user ? getUserAvatarUrl(user.id, user.avatar) : undefined}
                    size="md"
                />
                <h2 className="text-2xl md:text-3xl font-bold text-ink">
                    Olá, <span className="text-primary-600">{user?.name || 'amigo'}</span>! 👋
                </h2>
            </div>

            {overview && !settled && (
                <div className="card p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-3">Visão geral</p>
                    <div className="flex h-16 rounded-2xl overflow-hidden">
                        {overview.receiveCents > 0 && (
                            <div
                                className="flex flex-col justify-center px-3.5 bg-success"
                                style={{
                                    flexGrow: overview.receiveCents,
                                    flexBasis: 0,
                                    minWidth: hasBothSides ? BAR_MIN_SEGMENT_PX : 0,
                                }}
                            >
                                <p className="text-[10px] font-bold uppercase tracking-wide text-white/80 whitespace-nowrap">Devem-te</p>
                                <Money
                                    value={fromCents(overview.receiveCents)}
                                    className="text-base font-black text-white whitespace-nowrap"
                                />
                            </div>
                        )}
                        {overview.payCents > 0 && (
                            <div
                                className="flex flex-col justify-center items-end px-3.5 bg-danger"
                                style={{
                                    flexGrow: overview.payCents,
                                    flexBasis: 0,
                                    minWidth: hasBothSides ? BAR_MIN_SEGMENT_PX : 0,
                                }}
                            >
                                <p className="text-[10px] font-bold uppercase tracking-wide text-white/80 whitespace-nowrap">Deves</p>
                                <Money
                                    value={fromCents(overview.payCents)}
                                    className="text-base font-black text-white whitespace-nowrap"
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
            {settled && (
                <p className="text-sm font-semibold text-ink-faint">Contas em dia em todo o lado</p>
            )}
        </div>
    );
}
