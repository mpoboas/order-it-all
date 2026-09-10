// Formatação e leitura de dinheiro — fonte de verdade única.
//
// A app é em euros e pt-PT. Toda a apresentação de valores passa por aqui para
// não voltarmos a ter "0.00" num sítio e "0,00 €" noutro.

const EUR = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DECIMAL = new Intl.NumberFormat('pt-PT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `1234.5` → `"1234,50 €"` (formato pt-PT). */
export function formatEUR(amount: number): string {
  return EUR.format(Number.isFinite(amount) ? amount : 0);
}

/** `1234.5` → `"1234,50"` — sem símbolo, para valores editáveis num campo de texto. */
export function formatPriceInput(amount: number): string {
  return Number.isFinite(amount) && amount !== 0 ? DECIMAL.format(amount) : '';
}

/** Placeholder canónico de um campo de preço. */
export const PRICE_PLACEHOLDER = '0,00';

/**
 * Lê um valor escrito pelo utilizador (`"1.234,56 €"`, `"12,5"`, `"12.5"`, …)
 * para número. Devolve `0` se não der para interpretar.
 */
export function parseEUR(input: string | number | null | undefined): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  if (!input) return 0;

  let s = String(input).trim().replace(/[^\d.,-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // O separador decimal é o que aparece mais à direita; o outro é de milhares.
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    s = s.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
