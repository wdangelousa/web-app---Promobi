// Density Rules
const CHAR_THRESHOLD_FULL = 1000;
const CHAR_THRESHOLD_EMPTY = 50;
const PRICE_FULL = 8.00;
const PRICE_HALF = 4.00;
const PRICE_EMPTY = 0.00;

export type PageAnalysis = {
    pageNumber: number;
    charCount: number;
    density: 'full' | 'half' | 'empty';
    price: number;
};

export type DocumentAnalysis = {
    totalPages: number;
    pages: PageAnalysis[];
    totalPrice: number;
    isImage: boolean;
};

export async function analyzeDocument(file: File): Promise<DocumentAnalysis> {
    const isImage = file.type.startsWith('image/');

    if (isImage) {
        // IMAGE LOGIC:
        // Cannot extract text easily without OCR.
        // Assume FULL PAGE density for highest fairness/safety for business unless OCR implemented.
        // Or per prompt: "Simulated via Text" implies we try text, if fail, fallback.
        // Prompt says "avoid processing image heavy".
        return {
            totalPages: 1,
            pages: [{
                pageNumber: 1,
                charCount: 2000, // Simulated "full" count
                density: 'full',
                price: PRICE_FULL
            }],
            totalPrice: PRICE_FULL,
            isImage: true
        };
    }

    // PDF LOGIC
    try {
        // Dynamic import to avoid SSR issues with canvas/DOMMatrix
        const pdfjsLib = await import('pdfjs-dist');

        // Configure worker (use a CDN appropriate for the version, or local file)
        // Standard approach for Next.js is to use a CDN or copy the worker file to public/
        // Using unpkg CDN for simplicity and reliability without complex build steps
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        const pages: PageAnalysis[] = [];
        let totalPrice = 0;

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Extract text string
            const text = textContent.items.map((item: any) => item.str).join(' ');
            const charCount = text.replace(/\s/g, '').length; // Count non-whitespace chars

            let density: 'full' | 'half' | 'empty' = 'full';
            let price = PRICE_FULL;

            if (charCount < CHAR_THRESHOLD_EMPTY) {
                density = 'empty';
                price = PRICE_EMPTY;
            } else if (charCount < CHAR_THRESHOLD_FULL) {
                density = 'half';
                price = PRICE_HALF;
            }

            pages.push({
                pageNumber: i,
                charCount,
                density,
                price
            });

            totalPrice += price;
        }

        return {
            totalPages,
            pages,
            totalPrice,
            isImage: false
        };

    } catch (error) {
        console.error("Error analyzing PDF:", error);
        // Fallback for corrupted/unreadable PDFs: Assume 1 Full Page to allow user to continue manually or show error
        return {
            totalPages: 1,
            pages: [{
                pageNumber: 1,
                charCount: 1000,
                density: 'full',
                price: PRICE_FULL
            }],
            totalPrice: PRICE_FULL,
            isImage: false
        };
    }
}
