// Density Rules
const CHAR_THRESHOLD_FULL = 1800; // > 1800 chars = 100%
const CHAR_THRESHOLD_HIGH = 1200; // 1200-1800 = 75%
const CHAR_THRESHOLD_MEDIUM = 600; // 600-1200 = 50%
const CHAR_THRESHOLD_LOW = 50;     // 50-600 = 25%

const PRICE_BASE = 9.00;

export type PageAnalysis = {
    pageNumber: number;
    charCount: number;
    density: 'full' | 'high' | 'medium' | 'low' | 'empty' | 'scanned'; // Added 'scanned'
    price: number;
    fraction: number; // 1.0, 0.75, 0.5, 0.25
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
        // Assume SCANNED density for highest fairness/safety for business unless OCR implemented.
        return {
            totalPages: 1,
            pages: [{
                pageNumber: 1,
                charCount: 2000,
                density: 'scanned', // Explicitly 'scanned' now
                price: PRICE_BASE,
                fraction: 1.0
            }],
            totalPrice: PRICE_BASE,
            isImage: true
        };
    }

    // PDF LOGIC
    try {
        // ... (imports remain same)
        const pdfjsLib = await import('pdfjs-dist');
        // ... (worker setup remains same)
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

            let density: 'full' | 'high' | 'medium' | 'low' | 'empty' | 'scanned' = 'full';
            let fraction = 1.0;
            let price = PRICE_BASE;

            // Updated Logic:
            if (charCount < CHAR_THRESHOLD_LOW) {
                // Was < 50 chars -> likely scanned or image based
                density = 'scanned';
                fraction = 1.0;
                price = PRICE_BASE;
            } else if (charCount < CHAR_THRESHOLD_MEDIUM) {
                density = 'low';
                fraction = 0.25;
                price = PRICE_BASE * 0.25; // $2.25
            } else if (charCount < CHAR_THRESHOLD_HIGH) {
                density = 'medium';
                fraction = 0.50;
                price = PRICE_BASE * 0.50; // $4.50
            } else if (charCount < CHAR_THRESHOLD_FULL) {
                density = 'high';
                fraction = 0.75;
                price = PRICE_BASE * 0.75; // $6.75
            } else {
                // > 1800
                density = 'full';
                fraction = 1.0;
                price = PRICE_BASE;
            }

            pages.push({
                pageNumber: i,
                charCount,
                density,
                price,
                fraction
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
        // Fallback: Assume 1 Full Page
        return {
            totalPages: 1,
            pages: [{
                pageNumber: 1,
                charCount: 2000,
                density: 'full',
                price: PRICE_BASE,
                fraction: 1.0
            }],
            totalPrice: PRICE_BASE,
            isImage: false
        };
    }
}
