// lib/documentAnalyzer.ts
//
// ARCHITECTURE: Two-phase analysis
//
// Phase 1 — FAST PASS (~1ms per file, zero pdfjs)
//   Reads page count directly from PDF binary trailer (/Count N).
//   No parsing, no worker, no memory spike.
//   All pages default to 'high' density (safe default — never under-quotes).
//
// Phase 2 — DEEP ANALYSIS (background, 5 files concurrent)
//   Full word count + operator list scan per page via pdfjs.
//   Updates density and price in real time as each file finishes.
//
// File support:
//   PDF   → fast pass (byte scan) + deep (pdfjs)
//   Image → instant (scanned, 1 page)
//   DOCX  → instant (XML word count)

// ─── Constants ───────────────────────────────────────────────────────────────

const WORD_THRESHOLD_HIGH   = 250;
const WORD_THRESHOLD_MEDIUM = 100;
const PRICE_BASE            = 9.00;
const DEEP_CONCURRENCY      = 5;

// ─── Types ───────────────────────────────────────────────────────────────────

export type DensityType = 'high' | 'medium' | 'low' | 'blank' | 'scanned';

export type PageAnalysis = {
    pageNumber: number;
    wordCount:  number;
    density:    DensityType;
    price:      number;
    fraction:   number;
    included:   boolean;
};

export type DocumentAnalysis = {
    totalPages:         number;
    pages:              PageAnalysis[];
    totalPrice:         number;
    originalTotalPrice: number;
    isImage:            boolean;
    phase:              'fast' | 'deep';
    fileType:           'pdf' | 'image' | 'docx' | 'unknown';
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function makePage(pageNumber: number, density: DensityType, wordCount: number, base = PRICE_BASE): PageAnalysis {
    const fractionMap: Record<DensityType, number> = { high: 1.0, scanned: 1.0, medium: 0.5, low: 0.25, blank: 0.0 };
    const fraction = fractionMap[density];
    return { pageNumber, wordCount, density, price: base * fraction, fraction, included: true };
}

function classifyByWordCount(n: number): Exclude<DensityType, 'scanned'> {
    if (n === 0)                        return 'blank';
    if (n < WORD_THRESHOLD_MEDIUM)      return 'low';
    if (n <= WORD_THRESHOLD_HIGH)       return 'medium';
    return 'high';
}

function buildAnalysis(
    pages: PageAnalysis[],
    isImage: boolean,
    fileType: DocumentAnalysis['fileType'],
    phase: DocumentAnalysis['phase']
): DocumentAnalysis {
    const totalPrice = pages.reduce((s, p) => s + p.price, 0);
    return { totalPages: pages.length, pages, totalPrice, originalTotalPrice: totalPrice, isImage, phase, fileType };
}

// ─── PDF page count via raw byte scan (NO pdfjs) ──────────────────────────────
//
// PDF trailers store total page count as "/Count N" in the catalog.
// Reading the last 8KB catches it in virtually all standard PDFs.
// Falls back to full scan if not found in tail (rare: linearized or encrypted).
// Worst case: returns 1 (safe — deep analysis will correct it).

async function getPdfPageCountFast(file: File): Promise<number> {
    const tryExtract = (buf: string): number | null => {
        // Collect all /Count N occurrences and return the largest (= total pages)
        const matches = [...buf.matchAll(/\/Count\s+(\d+)/g)];
        if (!matches.length) return null;
        return Math.max(...matches.map(m => parseInt(m[1], 10)));
    };

    try {
        // Step 1: read tail 8KB — covers 99%+ of PDFs
        const tailSize = Math.min(8192, file.size);
        const tailBuf  = await file.slice(file.size - tailSize).arrayBuffer();
        const tail     = new TextDecoder('latin1').decode(tailBuf); // latin1 = safe for binary
        const fromTail = tryExtract(tail);
        if (fromTail !== null && fromTail > 0) return fromTail;

        // Step 2: full scan (linearized / unusual PDFs)
        const fullBuf  = await file.arrayBuffer();
        const full     = new TextDecoder('latin1').decode(fullBuf);
        const fromFull = tryExtract(full);
        if (fromFull !== null && fromFull > 0) return fromFull;
    } catch { /* fall through */ }

    return 1; // safe fallback
}

// ─── pdfjs singleton ──────────────────────────────────────────────────────────

let pdfjsWorkerConfigured = false;
async function getPdfjs() {
    const lib = await import('pdfjs-dist');
    if (!pdfjsWorkerConfigured) {
        lib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
        ).toString();
        pdfjsWorkerConfigured = true;
    }
    return lib;
}

// ─── Image ────────────────────────────────────────────────────────────────────

function analyzeImage(): DocumentAnalysis {
    return buildAnalysis([makePage(1, 'scanned', 300)], true, 'image', 'deep');
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────

async function analyzeDocx(file: File): Promise<DocumentAnalysis> {
    try {
        const uint8   = new Uint8Array(await file.arrayBuffer());
        const text    = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
        const matches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        const words   = matches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
        const wc      = words.length;
        const pages   = Math.max(1, Math.ceil(wc / 250));
        const wpg     = Math.round(wc / pages);
        return buildAnalysis(Array.from({ length: pages }, (_, i) => makePage(i + 1, classifyByWordCount(wpg), wpg)), false, 'docx', 'deep');
    } catch {
        return buildAnalysis([makePage(1, 'high', 300)], false, 'docx', 'deep');
    }
}

// ─── PHASE 1: Fast pass ───────────────────────────────────────────────────────
// ~1ms per PDF — reads page count from raw bytes, zero pdfjs involvement.

export async function fastPassAnalysis(file: File, base = PRICE_BASE): Promise<DocumentAnalysis> {
    if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)) return analyzeImage();
    if (/\.docx$/i.test(file.name) || file.type.includes('wordprocessingml')) return analyzeDocx(file);

    const totalPages = await getPdfPageCountFast(file);
    const pages      = Array.from({ length: totalPages }, (_, i) => makePage(i + 1, 'high', 300, base));
    return buildAnalysis(pages, false, 'pdf', 'fast');
}

// ─── PHASE 2: Deep analysis ───────────────────────────────────────────────────
// Full word count + scan detection per page. Run in background.

export async function deepAnalysis(file: File, base = PRICE_BASE): Promise<DocumentAnalysis> {
    if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)) return analyzeImage();
    if (/\.docx$/i.test(file.name) || file.type.includes('wordprocessingml')) return analyzeDocx(file);

    try {
        const lib         = await getPdfjs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf         = await lib.getDocument({ data: arrayBuffer }).promise;
        const pages: PageAnalysis[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page    = await pdf.getPage(i);
            const tc      = await page.getTextContent();
            const text    = tc.items.map((x: any) => x.str).join(' ');
            const wc      = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
            let density: DensityType;

            if (wc === 0) {
                const ops = await page.getOperatorList();
                const hasGfx = ops.fnArray.some((fn: number) =>
                    fn === (lib as any).OPS.paintImageXObject      ||
                    fn === (lib as any).OPS.paintInlineImageXObject ||
                    fn === (lib as any).OPS.constructPath           ||
                    fn === (lib as any).OPS.fill                    ||
                    fn === (lib as any).OPS.stroke
                );
                density = (hasGfx || ops.fnArray.length > 50) ? 'scanned' : 'blank';
            } else {
                density = classifyByWordCount(wc);
            }

            pages.push(makePage(i, density, wc, base));
        }

        return buildAnalysis(pages, false, 'pdf', 'deep');
    } catch {
        return buildAnalysis([makePage(1, 'high', 300, base)], false, 'pdf', 'deep');
    }
}

// ─── Batch processor ──────────────────────────────────────────────────────────

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
    onFileComplete: (p: BatchProgress) => void,
    concurrency = DEEP_CONCURRENCY
): Promise<void> {
    const total = files.length;
    let completed = 0;

    for (let i = 0; i < files.length; i += concurrency) {
        const chunk = files.slice(i, i + concurrency);
        await Promise.all(chunk.map(async ({ index, file }) => {
            const analysis = await deepAnalysis(file, base);
            completed++;
            onFileComplete({ fileIndex: index, fileName: file.name, analysis, completed, total });
        }));
    }
}

// ─── File type detection ──────────────────────────────────────────────────────

export function detectFileType(file: File): 'pdf' | 'image' | 'docx' | 'unsupported' {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))               return 'pdf';
    if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)) return 'image';
    if (/\.docx$/i.test(file.name) || file.type.includes('wordprocessingml'))       return 'docx';
    return 'unsupported';
}

export function isSupportedFile(file: File): boolean {
    return detectFileType(file) !== 'unsupported';
}

// ─── Legacy compat ────────────────────────────────────────────────────────────

export async function analyzeDocument(file: File, base = PRICE_BASE): Promise<DocumentAnalysis> {
    return deepAnalysis(file, base);
}
