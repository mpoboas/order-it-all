/**
 * Tipos partilhados entre a server action de scan de faturas
 * ([ai.ts](src/app/actions/ai.ts)) e os sheets que a chamam. Ficam num módulo
 * normal (não `'use server'`) porque uma server action só pode exportar
 * funções, e porque o erro de quota é uma falha **esperada** — a action
 * devolve-a como valor em vez de a lançar (o Next redige as mensagens de erro
 * lançadas em produção).
 */

export interface ReconciliationMatch {
  itemId: string;
  price: number;
  quantity: number;
  foundName: string;
}

export interface ReconciliationExtra {
  name: string;
  price: number;
  quantity: number;
  unit_price: number;
}

export interface ReconciliationResult {
  matches: ReconciliationMatch[];
  extras: ReconciliationExtra[];
}

export interface ReceiptLineItem {
  name: string;
  price: number;
}

export interface ReceiptExtractionResult {
  items: ReceiptLineItem[];
}

export type ScanFailure =
  /** Quota diária do Gemini esgotada (free tier ~1500/dia) — bloqueia até amanhã. */
  | { code: 'quota_daily' }
  /** Limite por-minuto — passageiro, volta a funcionar em `retryAfterSeconds`. */
  | { code: 'quota_rate'; retryAfterSeconds: number }
  | { code: 'invalid_key' }
  | { code: 'unreadable' }
  | { code: 'no_key' }
  | { code: 'no_image' }
  | { code: 'error' };

export type ScanOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; failure: ScanFailure };
