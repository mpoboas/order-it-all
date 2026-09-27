// Copiar texto para a área de transferência — incluindo no iOS.
//
// A forma certa é a Clipboard API (`navigator.clipboard.writeText`), com duas
// condições que o WebKit impõe (https://webkit.org/blog/10855/async-clipboard-api/):
//   1. contexto seguro (https) — em `http://` o `navigator.clipboard` nem existe;
//   2. chamada DENTRO do gesto do utilizador — no próprio handler de `click`,
//      antes de qualquer `await`. Fora disso a promessa é rejeitada logo.
// Por isso a chamada é feita síncrona, à cabeça.
//
// Só quando a API não existe (ex.: `http://` pela rede local ao testar no
// telemóvel) ou é recusada é que se usa o caminho antigo: um `<textarea>`
// escondido + `execCommand('copy')`, com o truque do iOS (contentEditable +
// readOnly desligado + seleção por `Range` + `setSelectionRange`). Este tinha
// de vir DEPOIS: no iOS o `execCommand` pode devolver `true` sem copiar nada,
// e ficava à frente da API boa.

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  // `fixed` + fora do ecrã: não faz saltar o scroll (problema conhecido do
  // `absolute` no iOS); 16px evita o zoom automático ao selecionar.
  Object.assign(textarea.style, {
    position: 'fixed',
    top: '0',
    left: '-9999px',
    fontSize: '16px',
  });
  textarea.readOnly = true;
  document.body.appendChild(textarea);

  // iOS: só seleciona texto num elemento editável — liga-se de passagem, sem
  // focar (não abre o teclado), e repõe-se antes de copiar.
  textarea.contentEditable = 'true';
  textarea.readOnly = false;
  const range = document.createRange();
  range.selectNodeContents(textarea);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  textarea.setSelectionRange(0, 999999);
  textarea.contentEditable = 'false';
  textarea.readOnly = true;

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  selection?.removeAllRanges();
  document.body.removeChild(textarea);
  return ok;
}

/**
 * Copia `text`. Chamar DIRETAMENTE no handler do toque, sem `await` antes —
 * a Clipboard API arranca síncrona aqui dentro. Resolve `false` se nada
 * funcionou (mostrar o valor para o utilizador copiar à mão).
 */
export function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text),
    );
  }
  return Promise.resolve(legacyCopy(text));
}
