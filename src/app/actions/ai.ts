'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

interface RawItem {
  name: string;
  quantity: number;
  notes?: string;
  id?: string;
}

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

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;

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
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  return model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Data,
        mimeType,
      },
    },
  ]);
}

export async function reconcileWithGeminiImage(
  imageBase64: string,
  mimeType: string,
  tripItems: RawItem[],
  apiKey: string
): Promise<ReconciliationResult> {
  if (!apiKey?.trim()) throw new Error('API Key em falta');
  if (!imageBase64?.trim()) throw new Error('Imagem da fatura em falta');

  const normalizedMime =
    mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

  const prompt = `
Act as a smart accountant for a shopping app.
I have an image of a supermarket receipt (Portuguese, English, Spanish, etc.) and a list of requested items from my app.

Reconcile the receipt with the request list using ONLY what you see in the image.

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
      const result = await generateWithModel(
        apiKey.trim(),
        modelName,
        prompt,
        imageBase64,
        normalizedMime
      );
      const response = await result.response;
      const text = response.text();
      if (!text?.trim()) {
        throw new Error('Resposta vazia do Gemini');
      }
      return parseGeminiJsonResponse(text);
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
  if (lastError instanceof Error) {
    if (/API key|API_KEY|invalid/i.test(lastError.message)) {
      throw new Error('Chave Gemini inválida. Verifica em aistudio.google.com');
    }
    if (/JSON|Unexpected token/i.test(lastError.message)) {
      throw new Error(
        'Não consegui ler a estrutura da fatura. Tenta outra foto mais nítida.'
      );
    }
    throw new Error(lastError.message);
  }
  throw new Error('Falha na análise da fatura com Gemini');
}

export interface ReceiptLineItem {
  name: string;
  price: number;
}

export interface ReceiptExtractionResult {
  items: ReceiptLineItem[];
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
  imageBase64: string,
  mimeType: string,
  apiKey: string
): Promise<ReceiptExtractionResult> {
  if (!apiKey?.trim()) throw new Error('API Key em falta');
  if (!imageBase64?.trim()) throw new Error('Imagem da fatura em falta');

  const normalizedMime =
    mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

  const prompt = `
Act as a smart accountant reading a supermarket/restaurant receipt (Portuguese, English, Spanish, etc.) from an image.

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
      const result = await generateWithModel(
        apiKey.trim(),
        modelName,
        prompt,
        imageBase64,
        normalizedMime
      );
      const response = await result.response;
      const text = response.text();
      if (!text?.trim()) {
        throw new Error('Resposta vazia do Gemini');
      }
      return parseReceiptItemsResponse(text);
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
  if (lastError instanceof Error) {
    if (/API key|API_KEY|invalid/i.test(lastError.message)) {
      throw new Error('Chave Gemini inválida. Verifica em aistudio.google.com');
    }
    if (/JSON|Unexpected token/i.test(lastError.message)) {
      throw new Error(
        'Não consegui ler a estrutura da fatura. Tenta outra foto mais nítida.'
      );
    }
    throw new Error(lastError.message);
  }
  throw new Error('Falha na análise da fatura com Gemini');
}
