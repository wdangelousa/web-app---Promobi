// Density Rules (Word Count)
const WORD_THRESHOLD_HIGH = 250; // > 250 words = 100%
const WORD_THRESHOLD_MEDIUM = 100; // 100-250 words = 50%
const WORD_THRESHOLD_LOW = 1;      // 1-99 words = 25%
const WORD_THRESHOLD_BLANK = 0;    // 0 words = Free ($0.00)

const PRICE_BASE = 9.00;

export type PageAnalysis = {
    pageNumber: number;
    wordCount: number;
    density: 'high' | 'medium' | 'low' | 'blank' | 'scanned';
    price: number;
    fraction: number; // 1.0, 0.5, 0.25, 0.0
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
                wordCount: 300, // Arbitrary high number for scanned
                density: 'scanned',
                price: PRICE_BASE,
                fraction: 1.0
            }],
            totalPrice: PRICE_BASE,
            isImage: true
        };
    }

    // PDF LOGIC
    try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        const pages: PageAnalysis[] = [];
        let totalPrice = 0;

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Extract text string and count words
            const text = textContent.items.map((item: any) => item.str).join(' ');
            const words = text.trim().split(/\s+/);
            const wordCount = text.trim() === '' ? 0 : words.length;

            let density: 'high' | 'medium' | 'low' | 'blank' | 'scanned' = 'high';
            let fraction = 1.0;
            let price = PRICE_BASE;

            if (wordCount === WORD_THRESHOLD_BLANK) {
                // HEURISTIC FOR SCANS: 
                // If text is empty, check if there are images or substantial path operators
                const ops = await page.getOperatorList();
                // Check for common image/graphics operators in PDF.js
                const hasGraphics = ops.fnArray.some(fn =>
                    fn === (pdfjsLib as any).OPS.paintImageXObject ||
                    fn === (pdfjsLib as any).OPS.paintInlineImageXObject ||
                    fn === (pdfjsLib as any).OPS.constructPath ||
                    fn === (pdfjsLib as any).OPS.fill ||
                    fn === (pdfjsLib as any).OPS.stroke
                );

                if (hasGraphics) {
                    density = 'scanned';
                    fraction = 1.0;
                    price = PRICE_BASE;
                } else {
                    density = 'blank';
                    fraction = 0.0;
                    price = 0.00;
                }
            } else if (wordCount < WORD_THRESHOLD_MEDIUM) {
                density = 'low';
                fraction = 0.25;
                price = PRICE_BASE * 0.25; // $2.25
            } else if (wordCount <= WORD_THRESHOLD_HIGH) {
                density = 'medium';
                fraction = 0.50;
                price = PRICE_BASE * 0.50; // $4.50
            } else {
                density = 'high';
                fraction = 1.0;
                price = PRICE_BASE; // $9.00
            }

            pages.push({
                pageNumber: i,
                wordCount,
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
                wordCount: 300,
                density: 'high',
                price: PRICE_BASE,
                fraction: 1.0
            }],
            totalPrice: PRICE_BASE,
            isImage: false
        };
    }
}
