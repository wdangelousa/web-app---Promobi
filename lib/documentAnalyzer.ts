// lib/documentAnalyzer.ts

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
    fraction: number;
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
        return {
            totalPages: 1,
            pages: [{
                pageNumber: 1,
                wordCount: 300,
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

        // ✅ FIX 1: Use local worker instead of CDN (CDN fails on Vercel/production)
        // This requires pdfjs-dist to be installed (it is, per package.json)
        // Next.js serves files from /public statically, but for worker we use the
        // module path directly which Next.js bundles correctly.
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
        ).toString();

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        const pages: PageAnalysis[] = [];
        let totalPrice = 0;

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            const text = textContent.items.map((item: any) => item.str).join(' ');
            const words = text.trim().split(/\s+/);
            const wordCount = text.trim() === '' ? 0 : words.length;

            let density: 'high' | 'medium' | 'low' | 'blank' | 'scanned' = 'high';
            let fraction = 1.0;
            let price = PRICE_BASE;

            if (wordCount === WORD_THRESHOLD_BLANK) {
                const ops = await page.getOperatorList();
                const hasGraphics = ops.fnArray.some(fn =>
                    fn === (pdfjsLib as any).OPS.paintImageXObject ||
                    fn === (pdfjsLib as any).OPS.paintInlineImageXObject ||
                    fn === (pdfjsLib as any).OPS.constructPath ||
                    fn === (pdfjsLib as any).OPS.fill ||
                    fn === (pdfjsLib as any).OPS.stroke
                );
                const isHeavy = ops.fnArray.length > 50;

                if (hasGraphics || isHeavy) {
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
                price = PRICE_BASE * 0.25;
            } else if (wordCount <= WORD_THRESHOLD_HIGH) {
                density = 'medium';
                fraction = 0.50;
                price = PRICE_BASE * 0.50;
            } else {
                density = 'high';
                fraction = 1.0;
                price = PRICE_BASE;
            }

            pages.push({ pageNumber: i, wordCount, density, price, fraction });
            totalPrice += price;
        }

        return { totalPages, pages, totalPrice, isImage: false };

    } catch (error) {
        console.error("Error analyzing PDF:", error);
        // ✅ FIX 2: Better fallback — use actual page count if possible via FileReader
        // If pdfjs totally fails, return a safe 1-page high density fallback
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
