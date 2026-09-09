'use server';

import { GoogleGenAI } from '@google/genai';
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
  if (/JSON|Unexpected token|Resposta vazia|SAFETY|blocked/i.test(message)) {
    return { code: 'unreadable' };
  }
  return { code: 'error' };
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
    },
  });

  return response.text ?? '';
}

export async function reconcileWithGeminiImage(
  imageFile: File,
  tripItems: RawItem[],
  apiKey: string
): Promise<ScanOutcome<ReconciliationResult>> {
  if (!apiKey?.trim()) return { ok: false, failure: { code: 'no_key' } };
  if (!imageFile) return { ok: false, failure: { code: 'no_image' } };

  const imageBase64 = Buffer.from(await imageFile.arrayBuffer()).toString('base64');
  const normalizedMime =
    imageFile.type === 'application/pdf' || imageFile.type?.startsWith('image/')
      ? imageFile.type
      : 'image/jpeg';

  const prompt = `
Act as a smart accountant for a shopping app.
I have an image or PDF of a supermarket receipt (Portuguese, English, Spanish, etc.) and a list of requested items from my app.

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
      if (!retryable) {
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
  apiKey: string
): Promise<ScanOutcome<ReceiptExtractionResult>> {
  if (!apiKey?.trim()) return { ok: false, failure: { code: 'no_key' } };
  if (!imageFile) return { ok: false, failure: { code: 'no_image' } };

  const imageBase64 = Buffer.from(await imageFile.arrayBuffer()).toString('base64');
  const normalizedMime =
    imageFile.type === 'application/pdf' || imageFile.type?.startsWith('image/')
      ? imageFile.type
      : 'image/jpeg';

  const prompt = `
Act as a smart accountant reading a supermarket/restaurant receipt (Portuguese, English, Spanish, etc.) from an image or PDF.

Extract every purchased line item with its name and price.

Rules:
1. Ignore headers, NIF, dates, payment method, and store address/totals/subtotals lines.
2. Expand abbreviations (e.g. "P. DE ACUCAR" → "PAO DE ACUCAR").
3. If a line shows a quantity greater than 1 (e.g. "2x Cerveja"), return ONE item with the LINE'S TOTAL price (not the unit price) — do not split it into multiple items and do not report quantity separately.
4. Skip lines you cannot read confidently.

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
      if (!retryable) {
        break;
      }
      console.warn(`Gemini model ${modelName} failed:`, message);
    }
  }

  console.error('Gemini Vision Error:', lastError);
  return { ok: false, failure: classifyGeminiError(lastError) };
}
