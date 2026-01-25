'use server';

export async function scanInvoice(formData: FormData): Promise<string> {
    const file = formData.get('file') as File;
    if (!file) throw new Error('No file provided');
    
    const OCR_API_KEY = process.env.OCR_API_KEY;
    if (!OCR_API_KEY) {
        throw new Error('OCR_API_KEY is not defined in environment variables');
    } 

    const body = new FormData();
    body.append('file', file);
    body.append('apikey', OCR_API_KEY);
    body.append('language', 'auto'); // Auto detect language
    body.append('isTable', 'true');
    body.append('OCREngine', '2');
    body.append('scale', 'true');

    try {
        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: body,
        });

        const result = await response.json();

        if (result.OCRExitCode !== 1) {
            console.error('OCR Error:', result);
            throw new Error(Array.isArray(result.ErrorMessage) ? result.ErrorMessage.join(', ') : 'OCR Failed');
        }

        // Aggregate parsed text
        const parsedText = result.ParsedResults
            ?.map((r: any) => r.ParsedText)
            .join('\n');

        return parsedText;
    } catch (error) {
        console.error('Scan Invoice Error:', error);
        throw new Error('Failed to scan invoice');
    }
}
