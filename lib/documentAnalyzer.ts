// lib/documentAnalyzer.ts
//
// ARCHITECTURE: Two-phase analysis
//
// Phase 1 — FAST PASS (~0.1s per file)
//   Counts pages only. Returns all pages as 'high' density (safe default).
//   Used to immediately show the document in the UI.
//
// Phase 2 — DEEP ANALYSIS (run in background, 5 files in parallel)
//   Full word count + operator list scan per page.
//   Updates density and price when complete.
//
// File support:
//   PDF   → full pdfjs analysis
//   Image → 1 page, scanned (no OCR needed)
//   DOCX  → word count via raw XML extraction, no conversion needed

// ─── Constants ───────────────────────────────────────────────────────────────

const WORD_THRESHOLD_HIGH   = 250;  // > 250 words  → 100%
const WORD_THRESHOLD_MEDIUM = 100;  // 100-250 words → 50%
// 1-99 words → 25%,  0 words → check for scan or blank

const PRICE_BASE = 9.00;

// Max files analyzed in parallel during deep pass
const DEEP_CONCURRENCY = 5;

// ─── Types ───────────────────────────────────────────────────────────────────

export type DensityType = 'high' | 'medium' | 'low' | 'blank' | 'scanned';

export type PageAnalysis = {
    pageNumber: number;
    wordCount:  number;
    density:    DensityType;
    price:      number;
    fraction:   number;
    included:   boolean;  // inclusion toggle for proposal optimization
};

export type DocumentAnalysis = {
    totalPages:         number;
    pages:              PageAnalysis[];
    totalPrice:         number;
    originalTotalPrice: number;  // price before any page exclusions
    isImage:            boolean;
    phase:              'fast' | 'deep';  // which phase produced this result
    fileType:           'pdf' | 'image' | 'docx' | 'unknown';
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePage(
    pageNumber: number,
    density: DensityType,
    wordCount: number,
    base = PRICE_BASE
): PageAnalysis {
    const fractionMap: Record<DensityType, number> = {
        high: 1.0, scanned: 1.0, medium: 0.5, low: 0.25, blank: 0.0,
    };
    const fraction = fractionMap[density];
    const price    = base * fraction;
    return { pageNumber, wordCount, density, price, fraction, included: true };
}

function classifyByWordCount(wordCount: number): Exclude<DensityType, 'scanned'> {
    if (wordCount === 0)                        return 'blank';
    if (wordCount < WORD_THRESHOLD_MEDIUM)      return 'low';
    if (wordCount <= WORD_THRESHOLD_HIGH)       return 'medium';
    return 'high';
}

function buildAnalysis(
    pages: PageAnalysis[],
    isImage: boolean,
    fileType: DocumentAnalysis['fileType'],
    phase: DocumentAnalysis['phase']
): DocumentAnalysis {
    const totalPrice = pages.reduce((acc, p) => acc + p.price, 0);
    return {
        totalPages: pages.length,
        pages,
        totalPrice,
        originalTotalPrice: totalPrice,
        isImage,
        phase,
        fileType,
    };
}

// Detect pdfjs worker once and reuse
let pdfjsWorkerConfigured = false;
async function getPdfjs() {
    const pdfjsLib = await import('pdfjs-dist');
    if (!pdfjsWorkerConfigured) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
        ).toString();
        pdfjsWorkerConfigured = true;
    }
    return pdfjsLib;
}

// ─── IMAGE ────────────────────────────────────────────────────────────────────

function analyzeImage(): DocumentAnalysis {
    const pages = [makePage(1, 'scanned', 300)];
    return buildAnalysis(pages, true, 'image', 'deep');
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────
// Extracts text from docx by reading the raw XML inside the zip.
// No external library needed — docx is a zip with word/document.xml inside.

async function analyzeDocx(file: File): Promise<DocumentAnalysis> {
    try {
        // Read the zip (docx) as ArrayBuffer
        const buffer = await file.arrayBuffer();

        // Dynamically import JSZip (already bundled with many Next.js projects,
        // or use fflate which is lighter — we use a manual approach here that
        // works without any extra dep by scanning for XML text blobs)
        // Strategy: convert to text and extract w:t (Word text) tags via regex
        const uint8 = new Uint8Array(buffer);
        const text  = new TextDecoder('utf-8', { fatal: false }).decode(uint8);

        // Extract all <w:t> text content from the XML
        const matches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        const words   = matches
            .map(m => m.replace(/<[^>]+>/g, '').trim())
            .filter(Boolean)
            .join(' ')
            .split(/\s+/)
            .filter(Boolean);

        const wordCount = words.length;

        // Estimate pages: ~250 words per page is a reasonable document average
        const estimatedPages = Math.max(1, Math.ceil(wordCount / 250));
        const wordsPerPage   = Math.round(wordCount / estimatedPages);
        const density        = classifyByWordCount(wordsPerPage);

        const pages: PageAnalysis[] = Array.from({ length: estimatedPages }, (_, i) =>
            makePage(i + 1, density, wordsPerPage)
        );

        return buildAnalysis(pages, false, 'docx', 'deep');
    } catch {
        // Fallback: 1 page high density
        return buildAnalysis([makePage(1, 'high', 300)], false, 'docx', 'deep');
    }
}

// ─── PDF FAST PASS ───────────────────────────────────────────────────────────
// Gets page count only. ~0.1s per file.
// All pages default to 'high' density (safe for business: never under-quotes).

export async function fastPassAnalysis(file: File, base = PRICE_BASE): Promise<DocumentAnalysis> {
    // Images and docx go straight to deep (they're fast enough)
    if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)) {
        return analyzeImage();
    }
    if (/\.docx$/i.test(file.name)) {
        return analyzeDocx(file);
    }

    try {
        const pdfjsLib    = await getPdfjs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages  = pdf.numPages;

        // All pages → 'high' density as safe default
        const pages: PageAnalysis[] = Array.from({ length: totalPages }, (_, i) =>
            makePage(i + 1, 'high', 300, base)
        );

        return buildAnalysis(pages, false, 'pdf', 'fast');
    } catch {
        return buildAnalysis([makePage(1, 'high', 300, base)], false, 'pdf', 'fast');
    }
}

// ─── PDF DEEP ANALYSIS ───────────────────────────────────────────────────────
// Full word count + scan detection per page. The expensive part.

export async function deepAnalysis(file: File, base = PRICE_BASE): Promise<DocumentAnalysis> {
    if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)) {
        return analyzeImage();
    }
    if (/\.docx$/i.test(file.name)) {
        return analyzeDocx(file);
    }

    try {
        const pdfjsLib    = await getPdfjs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages  = pdf.numPages;
        const pages: PageAnalysis[] = [];

        for (let i = 1; i <= totalPages; i++) {
            const page        = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const text        = textContent.items.map((item: any) => item.str).join(' ');
            const wordCount   = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

            let density: DensityType;

            if (wordCount === 0) {
                // Could be scan or truly blank — check operator list
                const ops        = await page.getOperatorList();
                const hasGraphics = ops.fnArray.some((fn: number) =>
                    fn === (pdfjsLib as any).OPS.paintImageXObject       ||
                    fn === (pdfjsLib as any).OPS.paintInlineImageXObject  ||
                    fn === (pdfjsLib as any).OPS.constructPath            ||
                    fn === (pdfjsLib as any).OPS.fill                     ||
                    fn === (pdfjsLib as any).OPS.stroke
                );
                density = (hasGraphics || ops.fnArray.length > 50) ? 'scanned' : 'blank';
            } else {
                density = classifyByWordCount(wordCount);
            }

            pages.push(makePage(i, density, wordCount, base));
        }

        return buildAnalysis(pages, false, 'pdf', 'deep');
    } catch {
        return buildAnalysis([makePage(1, 'high', 300, base)], false, 'pdf', 'deep');
    }
}

// ─── BATCH PROCESSOR ─────────────────────────────────────────────────────────
// Runs deep analysis on an array of files with controlled concurrency.
// Calls onFileComplete after each file finishes so the UI can update in real time.

export type BatchProgress = {
    fileIndex: number;
    fileName:  string;
    analysis:  DocumentAnalysis;
    completed: number;
    total:     number;
};

export async function batchDeepAnalysis(
    files: Array<{ index: number; file: File }>,
    base: number,
    onFileComplete: (progress: BatchProgress) => void,
    concurrency = DEEP_CONCURRENCY
): Promise<void> {
    const total   = files.length;
    let completed = 0;

    // Process in chunks of `concurrency`
    for (let i = 0; i < files.length; i += concurrency) {
        const chunk = files.slice(i, i + concurrency);

        await Promise.all(chunk.map(async ({ index, file }) => {
            const analysis = await deepAnalysis(file, base);
            completed++;
            onFileComplete({
                fileIndex: index,
                fileName:  file.name,
                analysis,
                completed,
                total,
            });
        }));
    }
}

// ─── LEGACY: single analyzeDocument (backward compat) ────────────────────────
// Kept so any other code importing this still works unchanged.

export async function analyzeDocument(file: File, base = PRICE_BASE): Promise<DocumentAnalysis> {
    return deepAnalysis(file, base);
}

// ─── FILE TYPE DETECTION ─────────────────────────────────────────────────────

export function detectFileType(file: File): 'pdf' | 'image' | 'docx' | 'unsupported' {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))         return 'pdf';
    if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)) return 'image';
    if (/\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    return 'unsupported';
}

export function isSupportedFile(file: File): boolean {
    return detectFileType(file) !== 'unsupported';
}
