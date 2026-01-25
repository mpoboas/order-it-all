'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

interface RawItem {
    name: string;
    quantity: number;
    notes?: string;
    id?: string; // App ID for matching
}

interface ReconciliationResult {
    matches: {
        itemId: string;
        price: number;
        quantity: number;
        foundName: string;
    }[];
    extras: {
        name: string;
        price: number;
        quantity: number;
        unit_price: number;
    }[];
}

// Deprecated: Old Summary Function (keeping for interface compatibility if needed, or matched plan to remove)
// The plan said "Refactor to support reconciliation logic", effectively replacing it or adding alongside.
// I will REPLACE it since the user said "podes remover esta feature de teste que fizeste agora".

export async function reconcileInvoice(
    ocrText: string, 
    tripItems: RawItem[], 
    apiKey: string
): Promise<ReconciliationResult> {
  if (!apiKey) throw new Error('API Key is missing');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Act as a smart accountant for a shopping app.
      I have the OCR text from a supermarket receipt (which may be in Portuguese, English, Spanish, or other languages) and a list of requested items from my app.
      
      Your goal is to RECONCILE the receipt with the requested items.

      INPUT DATA:
      1. **Request List** (Items I wanted to buy):
      ${JSON.stringify(tripItems.map(i => ({ id: i.id, name: i.name, value_guess: i.notes })))}

      2. **Receipt Text** (OCR Output):
      """
      ${ocrText}
      """

      INSTRUCTIONS:
      1. **Analyze the Receipt**: Extract purchased items, their TOTAL price, quantity, and unit price. 
         - Ignore date, tax IDs (NIF), address, or random headers.
         - Handle abbreviations (e.g. "P. DE ACUCAR" = "PAO DE ACUCAR", "LEITE M" = "LEITE MAGRO").
      
      2. **Fuzzy Match**: Compare receipt items against the "Request List".
         - If a receipt item strongly resembles a request item (e.g., "Coca Cola" ~= "Coke", "Arroz" ~= "Arroz Basmati"), match them.
         - *Strictness*: If the product is significantly different (e.g. "Bananas" vs "Shampoo"), do NOT match.
      
      3. **Categorize**:
         - **matches**: Items found in both lists. Return the App Item ID, the TOTAL price paid, and the **quantity found on the receipt**.
         - **extras**: Items on the receipt that are NOT in the Request List.
      
      OUTPUT JSON FORMAT:
      {
        "matches": [
          { "itemId": "APP_ITEM_ID", "price": TOTAL_PRICE_NUMBER, "quantity": QUANTITY_NUMBER, "foundName": "RECEIPT_ITEM_NAME_CLEANED" }
        ],
        "extras": [
          { "name": "RECEIPT_ITEM_NAME_CLEANED", "price": TOTAL_PRICE_NUMBER, "quantity": NUMBER_OF_UNITS, "unit_price": SINGLE_UNIT_PRICE_NUMBER }
        ]
      }
      
      CRITICAL:
      - Return ONLY valid JSON.
      - Prices and quantities must be numbers.
      - "quantity" defaults to 1 if unrelated to weight/units.
      - If you can't read a price, skip the item.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    const data = JSON.parse(jsonStr);

    return data as ReconciliationResult;
  } catch (error: unknown) {
    console.error('Gemini AI Reconciliation Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Falha na reconciliação';
    throw new Error(errorMessage);
  }
}
