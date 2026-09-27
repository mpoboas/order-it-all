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

/** `revolut.me/{revtag}?amount={cêntimos}&currency=EUR&note=Order%20It`. */
export function revolutPaymentUrl(revtag: string, amountEuros: number): string {
  const cents = Math.round(amountEuros * 100);
  return `https://revolut.me/${encodeURIComponent(normalizeRevtag(revtag))}?amount=${cents}&currency=EUR&note=Order%20It`;
}
