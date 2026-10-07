import type { ScanFailure, ScanOutcome } from '@/lib/scanTypes';

/**
 * Mensagem (toast) para cada falha do scan de fatura. A `quota_daily` é a única
 * que bloqueia o botão até amanhã — ver `isInvoiceScanBlockedToday`.
 */
export function invoiceScanFailureMessage(failure: ScanFailure): string {
  switch (failure.code) {
    case 'quota_daily':
      return 'Chegaste ao limite diário de leituras de faturas do Gemini. Amanhã já podes ler mais; por agora, adiciona os itens à mão.';
    case 'quota_rate':
      return `Muitas leituras seguidas. Espera ~${failure.retryAfterSeconds}s e tenta de novo.`;
    case 'invalid_key':
      return 'A tua chave Gemini foi rejeitada. Atualiza-a no teu perfil (ou cria uma nova em aistudio.google.com).';
    case 'unreadable':
      return 'Não consegui ler a fatura. Tenta uma foto mais nítida, direita e com boa luz.';
    case 'timeout':
      return 'O Gemini demorou demasiado a ler a fatura. Tenta de novo, ou fotografa só a parte com os itens.';
    case 'too_large':
      return 'A fatura é demasiado grande. Tira uma foto em vez de carregar o ficheiro, ou usa um PDF mais pequeno.';
    case 'no_key':
      return 'Adiciona a tua chave Gemini para leres faturas.';
    case 'unauthenticated':
      return 'A tua sessão expirou. Entra outra vez e tenta de novo.';
    case 'no_image':
      return 'Escolhe uma fatura primeiro.';
    default:
      return 'Não consegui processar a fatura. Tenta de novo daqui a pouco.';
  }
}

/**
 * Rede de segurança no cliente: se a server action nunca responder (pedido
 * morto pelo host, rede em baixo), devolve `timeout` em vez de deixar o sheet
 * preso no "A analisar…". Fica acima do timeout do servidor (45s) para que,
 * normalmente, seja o servidor a responder.
 */
export function withScanTimeout<T>(
  promise: Promise<ScanOutcome<T>>,
  ms = 60_000,
): Promise<ScanOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ScanOutcome<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, failure: { code: 'timeout' } }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
