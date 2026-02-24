// lib/documentAnalyzer.worker.ts
// Este arquivo roda em um Web Worker — NUNCA toca a main thread.
// Next.js compila automaticamente via: new Worker(new URL('./documentAnalyzer.worker.ts', import.meta.url))

// ─── Types (duplicados aqui pois workers não importam de outros módulos facilmente) ──

type DensityType = 'high' | 'medium' | 'low' | 'blank' | 'scanned'

type PageResult = {
    pageNumber: number
    wordCount:  number
    density:    DensityType
    price:      number
    fraction:   number
    included:   boolean
}

type AnalysisResult = {
    totalPages:         number
    pages:              PageResult[]
    totalPrice:         number
    originalTotalPrice: number
    isImage:            boolean
    phase:              'fast' | 'deep'
    fileType:           'pdf' | 'image' | 'docx' | 'unknown'
}

// ─── Messages in ──────────────────────────────────────────────────────────────

type WorkerMsg =
    | { type: 'fastPass';  id: string; buffer: ArrayBuffer; fileName: string; base: number }
    | { type: 'deepPass';  id: string; buffer: ArrayBuffer; fileName: string; base: number }

// ─── Messages out ─────────────────────────────────────────────────────────────

// postMessage'd back to main thread
type WorkerResponse =
    | { type: 'fastPassDone'; id: string; result: AnalysisResult }
    | { type: 'deepPassDone'; id: string; result: AnalysisResult }
    | { type: 'error';        id: string; message: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const WORD_HIGH   = 250
const WORD_MEDIUM = 100

function makePage(num: number, density: DensityType, wc: number, base: number): PageResult {
    const fracs: Record<DensityType, number> = { high: 1, scanned: 1, medium: 0.5, low: 0.25, blank: 0 }
    const f = fracs[density]
    return { pageNumber: num, wordCount: wc, density, price: base * f, fraction: f, included: true }
}

function classifyWC(n: number): DensityType {
    if (n === 0)           return 'blank'
    if (n < WORD_MEDIUM)   return 'low'
    if (n <= WORD_HIGH)    return 'medium'
    return 'high'
}

function build(pages: PageResult[], isImage: boolean, fileType: AnalysisResult['fileType'], phase: AnalysisResult['phase']): AnalysisResult {
    const total = pages.reduce((s, p) => s + p.price, 0)
    return { totalPages: pages.length, pages, totalPrice: total, originalTotalPrice: total, isImage, phase, fileType }
}

// ─── Fast pass: byte scan for page count, zero pdfjs ─────────────────────────

function fastPdf(buffer: ArrayBuffer, base: number): AnalysisResult {
    // Read last 32KB — enough for any PDF trailer
    const view   = new Uint8Array(buffer, Math.max(0, buffer.byteLength - 32768))
    const text   = new TextDecoder('latin1').decode(view)
    const hits   = [...text.matchAll(/\/Count\s+(\d+)/g)]
    let   count  = hits.length ? Math.max(...hits.map(m => parseInt(m[1]))) : 0

    if (!count || count < 1) {
        // Scan full buffer (linearized PDFs)
        const full  = new TextDecoder('latin1').decode(buffer)
        const hits2 = [...full.matchAll(/\/Count\s+(\d+)/g)]
        count = hits2.length ? Math.max(...hits2.map(m => parseInt(m[1]))) : 1
    }

    count = Math.max(1, Math.min(count, 5000)) // sanity cap
    const pages = Array.from({ length: count }, (_, i) => makePage(i + 1, 'high', 300, base))
    return build(pages, false, 'pdf', 'fast')
}

// ─── DOCX: XML word count ─────────────────────────────────────────────────────

function analyzeDocx(buffer: ArrayBuffer, base: number): AnalysisResult {
    try {
        const text    = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
        const matches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []
        const words   = matches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean).join(' ').split(/\s+/).filter(Boolean)
        const wc      = words.length
        const pages   = Math.max(1, Math.ceil(wc / 250))
        const wpg     = Math.round(wc / pages)
        return build(Array.from({ length: pages }, (_, i) => makePage(i + 1, classifyWC(wpg), wpg, base)), false, 'docx', 'deep')
    } catch {
        return build([makePage(1, 'high', 300, base)], false, 'docx', 'deep')
    }
}

// ─── Image ────────────────────────────────────────────────────────────────────

function analyzeImage(base: number): AnalysisResult {
    return build([makePage(1, 'scanned', 300, base)], true, 'image', 'deep')
}

// ─── Deep pass: pdfjs full analysis ──────────────────────────────────────────

let pdfjsLoaded = false
let pdfjsLib: any = null

async function loadPdfjs() {
    if (pdfjsLoaded) return pdfjsLib
    // In a worker, we import pdfjs directly
    // @ts-ignore
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
    // @ts-ignore
    pdfjsLib = globalThis['pdfjsLib']
    if (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '' // we ARE the worker
        pdfjsLoaded = true
    }
    return pdfjsLib
}

async function deepPdf(buffer: ArrayBuffer, base: number): Promise<AnalysisResult> {
    try {
        const lib     = await loadPdfjs()
        if (!lib) throw new Error('pdfjs unavailable')
        const pdf     = await lib.getDocument({ data: buffer }).promise
        const pages: PageResult[] = []

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const tc   = await page.getTextContent()
            const text = tc.items.map((x: any) => x.str).join(' ')
            const wc   = text.trim() === '' ? 0 : text.trim().split(/\s+/).length

            let density: DensityType
            if (wc === 0) {
                const ops    = await page.getOperatorList()
                const hasGfx = ops.fnArray.some((fn: number) =>
                    fn === lib.OPS?.paintImageXObject      ||
                    fn === lib.OPS?.paintInlineImageXObject ||
                    fn === lib.OPS?.constructPath           ||
                    fn === lib.OPS?.fill                    ||
                    fn === lib.OPS?.stroke
                )
                density = (hasGfx || ops.fnArray.length > 50) ? 'scanned' : 'blank'
            } else {
                density = classifyWC(wc)
            }

            pages.push(makePage(i, density, wc, base))
        }

        return build(pages, false, 'pdf', 'deep')
    } catch {
        return build([makePage(1, 'high', 300, base)], false, 'pdf', 'deep')
    }
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerMsg>) => {
    const { type, id, buffer, fileName, base } = e.data

    try {
        const isImg  = /\.(jpe?g|png|gif|webp|tiff?)$/i.test(fileName)
        const isDocx = /\.docx$/i.test(fileName)

        if (type === 'fastPass') {
            let result: AnalysisResult
            if (isImg)       result = analyzeImage(base)
            else if (isDocx) result = analyzeDocx(buffer, base)
            else             result = fastPdf(buffer, base)
            self.postMessage({ type: 'fastPassDone', id, result } as WorkerResponse)
        }

        if (type === 'deepPass') {
            let result: AnalysisResult
            if (isImg)       result = analyzeImage(base)
            else if (isDocx) result = analyzeDocx(buffer, base)
            else             result = await deepPdf(buffer, base)
            self.postMessage({ type: 'deepPassDone', id, result } as WorkerResponse)
        }
    } catch (err: any) {
        self.postMessage({ type: 'error', id, message: err?.message || 'unknown' } as WorkerResponse)
    }
}

export {} // make TS treat this as a module
