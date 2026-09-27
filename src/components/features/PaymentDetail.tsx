import { Icon } from '@/components/ui/Icon';
import { Money } from '@/components/ui/Money';
import { PaymentParties, paymentHeadline } from '@/components/features/PaymentParties';
import { relativeOrDatePhrase } from '@/lib/utils';
import type { Expense, Party } from '@/lib/types';

interface PaymentDetailProps {
    expense: Expense;
    parties: Map<string, Party>;
    currentUserId?: string;
}

/**
 * Detalhe de um pagamento (`kind === 'payment'`) — não é uma despesa: não há
 * categoria, divisão nem recibo. Mostra quem pagou a quem (o mesmo desenho do
 * "Acertar contas"), o valor, quem registou, e deixa claro que registar um
 * pagamento na app não move dinheiro.
 */
export function PaymentDetail({ expense, parties, currentUserId }: PaymentDetailProps) {
    const payerId = expense.payers[0]?.party;
    const payeeId = expense.shares[0]?.party;
    const addedBy = expense.expand?.created_by?.name || 'alguém';
    const updatedBy = expense.expand?.updated_by?.name;
    const wasEdited = expense.updated_by && expense.updated_by !== expense.created_by;

    return (
        <div className="space-y-6">
            <div className="pt-2 space-y-4 text-center">
                {payerId && payeeId && (
                    <PaymentParties payerId={payerId} payeeId={payeeId} parties={parties} currentUserId={currentUserId} />
                )}
                <div>
                    <h1 className="text-lg font-semibold text-ink">
                        {payerId && payeeId ? paymentHeadline(payerId, payeeId, parties, currentUserId) : 'Pagamento'}
                    </h1>
                    <Money as="p" value={expense.amount} className="mt-1 text-4xl font-bold tracking-tight text-ink" />
                </div>
                <p className="text-sm text-ink-soft">
                    Registado por {addedBy} {relativeOrDatePhrase(expense.created)}
                    {wasEdited && updatedBy && <> · editado por {updatedBy}</>}
                </p>
            </div>

            <div className="flex items-start gap-3 rounded-xl bg-surface-sunken px-4 py-3 text-sm text-ink-soft">
                <Icon name="info" className="text-lg shrink-0 mt-0.5" />
                <p>Este pagamento foi registado na app para acertar contas. Nenhum dinheiro foi transferido por aqui.</p>
            </div>

            {expense.notes && (
                <div className="card p-4">
                    <p className="text-xs font-bold text-ink-faint uppercase tracking-wide mb-1">Notas</p>
                    <p className="text-sm text-ink whitespace-pre-wrap">{expense.notes}</p>
                </div>
            )}
        </div>
    );
}
