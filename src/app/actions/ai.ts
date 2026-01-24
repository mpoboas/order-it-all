'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

interface RawItem {
    name: string;
    quantity: number;
    notes?: string;
}

export async function summarizeTrip(items: RawItem[], apiKey: string) {
  if (!apiKey) throw new Error('API Key is missing');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Act as a professional shopping organizer.
      I have a list of items from multiple orders. Organize them efficiently for a shopping trip.
      
      RULES:
      1. Translate brand names or specific variations to generic product names if they are essentially the same (e.g., "Coca Cola" and "Coke" -> "Coca-Cola"), unless they are distinctly different products.
      2. SUM the quantities of identical items.
      3. Group items by logical Supermarket Categories (e.g., Produce, Dairy, Meat, Pantry, Drinks, Household).
      4. Suggest a logical shopping path order for categories (Produce first, Frozen last).
      5. Output pure JSON.

      Input List:
      ${JSON.stringify(items)}

      Required JSON Structure:
      {
        "categories": [
          {
            "name": "Category Name (in Portuguese)",
            "emoji": "emoji",
            "items": [
               { "name": "Standardized Product Name", "total_quantity": number, "notes": "Summary of notes if any important specific requests" }
            ]
          }
        ]
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Clean markdown code blocks
    const jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    return JSON.parse(jsonStr);
  } catch (error: any) {
    console.error('Gemini AI Error:', error);
    throw new Error(error.message || 'Falha ao gerar resumo');
  }
}
