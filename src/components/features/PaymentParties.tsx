import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { canonicalPartyId, partyLabel } from '@/lib/parties';
import type { Party } from '@/lib/types';

interface PaymentPartiesProps {
    payerId: string;
    payeeId: string;
    parties: Map<string, Party>;
    currentUserId?: string;
}

/** Quem paga (esquerda) → quem recebe (direita): dois avatares grandes com
 *  uma seta. O mesmo desenho no "Acertar contas" e no detalhe de um
 *  pagamento, para o pagamento ter sempre a mesma cara. */
export function PaymentParties({ payerId, payeeId, parties, currentUserId }: PaymentPartiesProps) {
    const person = (id: string) => {
        const party = parties.get(id);
        const isMe = !!currentUserId && canonicalPartyId(id, parties) === currentUserId;
        return (
            <div className="w-24 flex flex-col items-center gap-2 min-w-0">
                <Avatar name={party?.name ?? partyLabel(id, parties)} src={party?.avatar} size="lg" />
                <span className="text-sm font-medium text-ink truncate max-w-full">{isMe ? 'Tu' : partyLabel(id, parties)}</span>
            </div>
        );
    };
    return (
        <div className="flex items-start justify-center gap-4">
            {person(payerId)}
            <Icon name="arrow_forward" className="text-3xl text-ink-faint mt-4 shrink-0" aria-label="pagou a" />
            {person(payeeId)}
        </div>
    );
}

/** Frase de um pagamento do ponto de vista de quem está a ver: "Miguel
 *  pagou-te" / "Pagaste a Miguel" / "Miguel pagou a Ana". `ongoing` para o
 *  ecrã de registar ("Estás a pagar a Miguel"). */
export function paymentHeadline(
    payerId: string,
    payeeId: string,
    parties: Map<string, Party>,
    currentUserId?: string,
    ongoing = false,
): string {
    const isMe = (id: string) => !!currentUserId && canonicalPartyId(id, parties) === currentUserId;
    if (isMe(payeeId)) return `${partyLabel(payerId, parties)} pagou-te`;
    if (isMe(payerId)) return ongoing ? `Estás a pagar a ${partyLabel(payeeId, parties)}` : `Pagaste a ${partyLabel(payeeId, parties)}`;
    return `${partyLabel(payerId, parties)} pagou a ${partyLabel(payeeId, parties)}`;
}
