'use server';

import { GoogleGenAI } from '@google/genai';
import { userIdFromToken } from '@/lib/serverAuth';
import type {
  ReconciliationMatch,
  ReconciliationExtra,
  ReconciliationResult,
  ReceiptLineItem,
  ReceiptExtractionResult,
  ScanFailure,
  ScanOutcome,
} from '@/lib/scanTypes';

interface RawItem {
  name: string;
  quantity: number;
  notes?: string;
  id?: string;
}

// `gemini-flash-latest` é um alias estável que a Google mantém a apontar para o
// modelo flash atual — não parte quando um modelo concreto é descontinuado.
// `gemini-2.5-flash` fica como fallback explícito.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'] as const;

// Sem limite, um talão longo (ou o modelo a entrar em loop a repetir linhas no
// modo JSON) deixava o pedido pendurado minutos e o cliente preso no
// "A analisar…". O timeout corta o pedido e o teto de tokens evita respostas
// sem fim — um talão real cabe à vontade em 8k tokens.
const GEMINI_TIMEOUT_MS = 45_000;
const GEMINI_MAX_OUTPUT_TOKENS = 8192;

// Regras comuns às duas prompts para talões fora de PT (sobretudo DE/AT/CH):
// vírgula decimal, letras de IVA, Pfand e descontos em linhas próprias.
const RECEIPT_FORMAT_RULES = `
- The receipt may be in any language (Portuguese, English, Spanish, German, French, Italian, ...). Keep product names as printed; do not translate.
- Prices may use a decimal comma (e.g. "1,99" or "1,99 EUR"). Always output them as JSON numbers with a dot (1.99), never as strings.
- Ignore VAT/tax class letters or codes printed next to prices (e.g. "A", "B", "*", "MwSt", "USt", "IVA").
- Ignore tax summary blocks, "Summe", "Gesamt", "Zwischensumme", "zu zahlen", "Bar", "EC-Karte", "Rückgeld", TSE/signature data and loyalty/bonus lines.
- Deposit lines ("Pfand") are line items. Subtract a discount ("Rabatt", "Preisvorteil", "Coupon") from the product line it follows instead of outputting it on its own; skip deposit returns ("Leergut", "Pfandrückgabe") and receipt-wide discounts. Never output negative prices.
- Quantity lines like "2 x 1,99" belong to the product line next to them; do not output them as separate items.
`;

/** Segundos de espera indicados pelo Gemini num 429 (RPM), se presentes. */
function retryDelaySeconds(message: string): number | null {
  const m =
    message.match(/retry[_ ]?delay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i) ||
    message.match(/retry (?:after|in) (\d+(?:\.\d+)?)\s*s(?:econds?)?/i);
  return m ? Math.max(1, Math.ceil(Number(m[1]))) : null;
}

/** Traduz o erro do SDK Gemini numa falha tipada para o cliente. */
function classifyGeminiError(err: unknown): ScanFailure {
  const message = err instanceof Error ? err.message : String(err);

  if (
    /RESOURCE_EXHAUSTED|"code"\s*:\s*429|\b429\b|quota|rate[ -]?limit/i.test(
      message,
    )
  ) {
    const retry = retryDelaySeconds(message);
    // Limite por-minuto traz um retryDelay curto; a quota diária não (ou é enorme).
    if (retry != null && retry <= 120) {
      return { code: 'quota_rate', retryAfterSeconds: retry };
    }
    return { code: 'quota_daily' };
  }
  if (
    /API[_ ]?key|API_KEY_INVALID|invalid.*key|PERMISSION_DENIED|permission denied|unauthenticated/i.test(
      message,
    )
  ) {
    return { code: 'invalid_key' };
  }
  if (isTimeoutError(err)) {
    return { code: 'timeout' };
  }
  if (/JSON|Unexpected token|Resposta vazia|MAX_TOKENS|SAFETY|blocked/i.test(message)) {
    return { code: 'unreadable' };
  }
  return { code: 'error' };
}

function isTimeoutError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'TimeoutError' ||
      err.name === 'AbortError' ||
      /aborted|timed? ?out/i.test(err.message))
  );
}

function parseGeminiJsonResponse(text: string): ReconciliationResult {
  let jsonStr = text.trim();

  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    jsonStr = fenced[1].trim();
  } else {
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end > start) {
      jsonStr = jsonStr.slice(start, end + 1);
    }
  }

  const parsed = JSON.parse(jsonStr) as Partial<ReconciliationResult>;

  const matches = Array.isArray(parsed.matches)
    ? parsed.matches
        .filter(
          (m): m is ReconciliationMatch =>
            Boolean(m) &&
            typeof m.itemId === 'string' &&
            typeof m.foundName === 'string' &&
            typeof m.price === 'number' &&
            typeof m.quantity === 'number'
        )
        .map((m) => ({
          itemId: m.itemId,
          foundName: m.foundName,
          price: m.price,
          quantity: m.quantity > 0 ? m.quantity : 1,
        }))
    : [];

  const extras = Array.isArray(parsed.extras)
    ? parsed.extras
        .filter(
          (e): e is ReconciliationExtra =>
            Boolean(e) &&
            typeof e.name === 'string' &&
            typeof e.price === 'number'
        )
        .map((e) => {
          const quantity =
            typeof e.quantity === 'number' && e.quantity > 0 ? e.quantity : 1;
          const unit_price =
            typeof e.unit_price === 'number' && e.unit_price > 0
              ? e.unit_price
              : e.price / quantity;
          return {
            name: e.name,
            price: e.price,
            quantity,
            unit_price,
          };
        })
    : [];

  return { matches, extras };
}

async function generateWithModel(
  apiKey: string,
  modelName: string,
  prompt: string,
  base64Data: string,
  mimeType: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { data: base64Data, mimeType } },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    },
  });

  // JSON cortado a meio não faz parse — melhor um erro claro do que "JSON".
  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error('Resposta truncada do Gemini (MAX_TOKENS)');
  }

  return response.text ?? '';
}

// Server actions são endpoints POST públicos (o id da action está no bundle
// do cliente) — por isso exigem o token de sessão do PocketBase como
// argumento (`pb.authStore.token`), validado antes de gastar CPU/banda a
// reencaminhar a imagem para o Gemini.
export async function reconcileWithGeminiImage(
  imageFile: File,
  tripItems: RawItem[],
  apiKey: string,
  authToken: string
): Promise<ScanOutcome<ReconciliationResult>> {
  if (!(await userIdFromToken(authToken))) return { ok: false, failure: { code: 'unauthenticated' } };
  if (!apiKey?.trim()) return { ok: false, failure: { code: 'no_key' } };
  if (!imageFile) return { ok: false, failure: { code: 'no_image' } };

  const imageBase64 = Buffer.from(await imageFile.arrayBuffer()).toString('base64');
  const normalizedMime =
    imageFile.type === 'application/pdf' || imageFile.type?.startsWith('image/')
      ? imageFile.type
      : 'image/jpeg';

  const prompt = `
Act as a smart accountant for a shopping app.
I have an image or PDF of a supermarket receipt (any language) and a list of requested items from my app.

Reconcile the receipt with the request list using ONLY what you see in the file.

Request list (items we wanted to buy):
${JSON.stringify(
  tripItems.map((i) => ({
    id: i.id,
    name: i.name,
    quantity_requested: i.quantity,
    notes: i.notes || '',
  }))
)}

Rules:
1. Read line items, total price per line, quantity, and unit price when visible.
2. Ignore headers, NIF, dates, payment method, and store address.
3. Expand abbreviations (e.g. "P. DE ACUCAR" → "PAO DE ACUCAR").
4. Match receipt lines to request items only when the product is clearly the same.
5. Put unmatched receipt lines in "extras".
${RECEIPT_FORMAT_RULES}
Return ONLY valid JSON with this exact shape:
{
  "matches": [
    { "itemId": "APP_ITEM_ID", "price": 12.34, "quantity": 2, "foundName": "NAME ON RECEIPT" }
  ],
  "extras": [
    { "name": "NAME ON RECEIPT", "price": 5.99, "quantity": 1, "unit_price": 5.99 }
  ]
}

Use numbers for price, quantity, and unit_price. Skip lines you cannot read confidently.
`;

  let lastError: unknown;

  for (const modelName of GEMINI_MODELS) {
    try {
      const text = await generateWithModel(
        apiKey.trim(),
        modelName,
        prompt,
        imageBase64,
        normalizedMime
      );
      if (!text?.trim()) {
        throw new Error('Resposta vazia do Gemini');
      }
      return { ok: true, data: parseGeminiJsonResponse(text) };
    } catch (error) {
      lastError = error;
      const message =
        error instanceof Error ? error.message : String(error);
      const retryable =
        /not found|404|429|503|overload|quota|rate|JSON|Unexpected token/i.test(
          message
        );
      // Depois de um timeout não vale a pena tentar outro modelo: o cliente
      // ficaria o dobro do tempo à espera.
      if (!retryable || isTimeoutError(error)) {
        break;
      }
      console.warn(`Gemini model ${modelName} failed:`, message);
    }
  }

  console.error('Gemini Vision Error:', lastError);
  return { ok: false, failure: classifyGeminiError(lastError) };
}

function parseReceiptItemsResponse(text: string): ReceiptExtractionResult {
  let jsonStr = text.trim();

  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    jsonStr = fenced[1].trim();
  } else {
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end > start) {
      jsonStr = jsonStr.slice(start, end + 1);
    }
  }

  const parsed = JSON.parse(jsonStr) as { items?: unknown };

  const items = Array.isArray(parsed.items)
    ? (parsed.items as Partial<ReceiptLineItem>[])
        .filter(
          (i): i is ReceiptLineItem =>
            Boolean(i) &&
            typeof i.name === 'string' &&
            i.name.trim().length > 0 &&
            typeof i.price === 'number'
        )
        .map((i) => ({ name: i.name.trim(), price: i.price }))
    : [];

  return { items };
}

/**
 * Extracts a flat list of {name, price} from a receipt image — no
 * reconciliation against an existing list (splits have nothing to match
 * against, unlike trip shopping lists).
 */
export async function extractReceiptLineItems(
  imageFile: File,
  apiKey: string,
  authToken: string
): Promise<ScanOutcome<ReceiptExtractionResult>> {
  if (!(await userIdFromToken(authToken))) return { ok: false, failure: { code: 'unauthenticated' } };
  if (!apiKey?.trim()) return { ok: false, failure: { code: 'no_key' } };
  if (!imageFile) return { ok: false, failure: { code: 'no_image' } };

  const imageBase64 = Buffer.from(await imageFile.arrayBuffer()).toString('base64');
  const normalizedMime =
    imageFile.type === 'application/pdf' || imageFile.type?.startsWith('image/')
      ? imageFile.type
      : 'image/jpeg';

  const prompt = `
Act as a smart accountant reading a supermarket/restaurant receipt (any language) from an image or PDF.

Extract every purchased line item with its name and price.

Rules:
1. Ignore headers, NIF, dates, payment method, and store address/totals/subtotals lines.
2. Expand abbreviations (e.g. "P. DE ACUCAR" → "PAO DE ACUCAR").
3. If a line shows a quantity greater than 1 (e.g. "2x Cerveja"), return ONE item with the LINE'S TOTAL price (not the unit price) — do not split it into multiple items and do not report quantity separately.
4. Skip lines you cannot read confidently.
${RECEIPT_FORMAT_RULES}
Return ONLY valid JSON with this exact shape:
{
  "items": [
    { "name": "NAME ON RECEIPT", "price": 12.34 }
  ]
}

Use a number for price.
`;

  let lastError: unknown;

  for (const modelName of GEMINI_MODELS) {
    try {
      const text = await generateWithModel(
        apiKey.trim(),
        modelName,
        prompt,
        imageBase64,
        normalizedMime
      );
      if (!text?.trim()) {
        throw new Error('Resposta vazia do Gemini');
      }
      return { ok: true, data: parseReceiptItemsResponse(text) };
    } catch (error) {
      lastError = error;
      const message =
        error instanceof Error ? error.message : String(error);
      const retryable =
        /not found|404|429|503|overload|quota|rate|JSON|Unexpected token/i.test(
          message
        );
      // Depois de um timeout não vale a pena tentar outro modelo: o cliente
      // ficaria o dobro do tempo à espera.
      if (!retryable || isTimeoutError(error)) {
        break;
      }
      console.warn(`Gemini model ${modelName} failed:`, message);
    }
  }

  console.error('Gemini Vision Error:', lastError);
  return { ok: false, failure: classifyGeminiError(lastError) };
}
