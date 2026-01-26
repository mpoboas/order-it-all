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



export async function reconcileWithGeminiImage(
    formData: FormData,
    tripItems: RawItem[],
    apiKey: string
): Promise<ReconciliationResult> {
  if (!apiKey) throw new Error('API Key is missing');

  const file = formData.get('file') as File;
  if (!file) throw new Error('No file provided for Gemini Vision');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Act as a smart accountant for a shopping app.
      I have an image of a supermarket receipt (which may be in Portuguese, English, Spanish, or other languages) and a list of requested items from my app.
      
      Your goal is to RECONCILE the receipt with the requested items directly from the image.

      INPUT DATA:
      **Request List** (Items I wanted to buy):
      ${JSON.stringify(tripItems.map(i => ({ id: i.id, name: i.name, value_guess: i.notes })))}

      INSTRUCTIONS:
      1. **Analyze the Receipt Image**: Visually identify purchased items, their TOTAL price, quantity, and unit price. 
         - Ignore date, tax IDs (NIF), address, or random headers.
         - Handle abbreviations (e.g. "P. DE ACUCAR" = "PAO DE ACUCAR").
      
      2. **Fuzzy Match**: Compare receipt items against the "Request List".
         - If a receipt item strongly resembles a request item (e.g. "Coca Cola" ~= "Coke"), match them.
         - *Strictness*: If the product is significantly different, do NOT match.
      
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
      - If you can't read a price clearly, skip the item.
    `;

    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                data: base64Data,
                mimeType: file.type
            }
        }
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    // Clean JSON (remove markdown)
    const jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    const data = JSON.parse(jsonStr);

    return data as ReconciliationResult;
  } catch (error: unknown) {
    console.error('Gemini Vision Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Falha na análise de imagem com Gemini';
    throw new Error(errorMessage);
  }
}
