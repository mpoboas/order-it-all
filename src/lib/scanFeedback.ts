import type { ScanFailure } from '@/lib/scanTypes';

/**
 * Mensagem (toast) para cada falha do scan de fatura. A `quota_daily` é a única
 * que bloqueia o botão até amanhã — ver `isInvoiceScanBlockedToday`.
 */
export function invoiceScanFailureMessage(failure: ScanFailure): string {
  switch (failure.code) {
    case 'quota_daily':
      return 'Chegaste ao limite diário de leituras de fatura do Gemini. As leituras voltam amanhã — entretanto podes adicionar os itens à mão. 🧾';
    case 'quota_rate':
      return `Muitas leituras seguidas. Espera ~${failure.retryAfterSeconds}s e tenta de novo.`;
    case 'invalid_key':
      return 'A tua chave Gemini foi rejeitada. Atualiza-a no teu perfil (ou cria uma nova em aistudio.google.com).';
    case 'unreadable':
      return 'Não consegui ler a fatura. Tenta uma foto mais nítida, direita e com boa luz.';
    case 'no_key':
      return 'Adiciona a tua chave Gemini para leres faturas.';
    case 'no_image':
      return 'Escolhe uma fatura primeiro.';
    default:
      return 'Não consegui processar a fatura. Tenta de novo daqui a pouco.';
  }
}
