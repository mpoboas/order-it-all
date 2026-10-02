// Deep links para pagar pelas apps de pagamento ao acertar contas.
// Regras testadas em `deep-links-teste.html`:
// - Revolut: `revolut.me/{revtag}` com o valor em CÊNTIMOS — preenche tudo.
// - MB WAY: não há link com valor/número; `mbway://home` só abre a app.

/** Só abre a app do MB WAY — o número e o valor têm de ser escritos lá. */
export const MBWAY_APP_URL = 'mbway://home';

/** Revtag normalizada: sem "@" à frente nem espaços. */
export function normalizeRevtag(revtag: string): string {
  return revtag.trim().replace(/^@+/, '');
}

/** `revolut.me/{revtag}?amount={cêntimos}&currency=EUR&note={nota}` — a nota
 *  aparece no Revolut de quem recebe (ex.: `Saldar dívida de "Casa de férias"`). */
export function revolutPaymentUrl(revtag: string, amountEuros: number, note = 'Order It'): string {
  const cents = Math.round(amountEuros * 100);
  return `https://revolut.me/${encodeURIComponent(normalizeRevtag(revtag))}?amount=${cents}&currency=EUR&note=${encodeURIComponent(note)}`;
}

/** Nota do pagamento pelo Revolut ao acertar contas. */
export function settleUpNote(groupName?: string | null): string {
  const name = groupName?.trim();
  return name ? `Saldar dívida de "${name}"` : 'Saldar dívida';
}
