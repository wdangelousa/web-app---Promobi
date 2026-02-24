// lib/documentAnalyzer.worker.ts

import { PDFDocument } from 'pdf-lib'

// ─── Types ────────────────────────────────────────────────────────────────────

type DensityType = 'high' | 'medium' | 'low' | 'blank' | 'scanned'

type PageResult = {
    pageNumber: number
    wordCount: number
    density: DensityType
    price: number
    fraction: number
    included: boolean
}

type AnalysisResult = {
    totalPages: number
    pages: PageResult[]
    totalPrice: number
    originalTotalPrice: number
    isImage: boolean
    phase: 'fast' | 'deep'
    fileType: 'pdf' | 'image' | 'docx' | 'unknown'
}

type WorkerMsg =
    | { type: 'fastPass'; id: string; buffer: ArrayBuffer; fileName: string; base: number }
    | { type: 'deepPass'; id: string; buffer: ArrayBuffer; fileName: string; base: number }

type WorkerResponse =
    | { type: 'fastPassDone'; id: string; result: AnalysisResult }
    | { type: 'deepPassDone'; id: string; result: AnalysisResult }
    | { type: 'error'; id: string; message: string }

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const WORD_HIGH = 250
const WORD_MEDIUM = 100

function makePage(num: number, density: DensityType, wc: number, base: number): PageResult {
    const fracs: Record<DensityType, number> = { high: 1, scanned: 1, medium: 0.5, low: 0.25, blank: 0 }
    const f = fracs[density]
    return { pageNumber: num, wordCount: wc, density, price: base * f, fraction: f, included: true }
}

function classifyWC(n: number): DensityType {
    if (n === 0) return 'blank'
    if (n < WORD_MEDIUM) return 'low'
    if (n <= WORD_HIGH) return 'medium'
    return 'high'
}

function build(pages: PageResult[], isImage: boolean, fileType: AnalysisResult['fileType'], phase: AnalysisResult['phase']): AnalysisResult {
    const total = pages.reduce((s, p) => s + p.price, 0)
    return { totalPages: pages.length, pages, totalPrice: total, originalTotalPrice: total, isImage, phase, fileType }
}

// ─── Accurate Page Counting (Safety Net) ──────────────────────────────────────

async function getAccuratePageCount(buffer: ArrayBuffer): Promise<number> {
    try {
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
        return pdfDoc.getPageCount()
    } catch (e) {
        console.error('[Worker] pdf-lib falhou ao contar páginas:', e)
        return 1
    }
}

// ─── Fast pass ────────────────────────────────────────────────────────────────

async function fastPdf(buffer: ArrayBuffer, base: number): Promise<AnalysisResult> {
    const count = await getAccuratePageCount(buffer)
    const pages = Array.from({ length: count }, (_, i) => makePage(i + 1, 'high', 300, base))
    return build(pages, false, 'pdf', 'fast')
}

// ─── DOCX / Image ─────────────────────────────────────────────────────────────

function analyzeDocx(buffer: ArrayBuffer, base: number): AnalysisResult {
    try {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
        const matches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []
        const words = matches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean).join(' ').split(/\s+/).filter(Boolean)
        const wc = words.length
        const pages = Math.max(1, Math.ceil(wc / 250))
        const wpg = Math.round(wc / pages)
        return build(Array.from({ length: pages }, (_, i) => makePage(i + 1, classifyWC(wpg), wpg, base)), false, 'docx', 'deep')
    } catch {
        return build([makePage(1, 'high', 300, base)], false, 'docx', 'deep')
    }
}

function analyzeImage(base: number): AnalysisResult {
    return build([makePage(1, 'scanned', 300, base)], true, 'image', 'deep')
}

// ─── Deep pass ────────────────────────────────────────────────────────────────

let pdfjsLoaded = false
let pdfjsLib: any = null

async function loadPdfjs() {
    if (pdfjsLoaded) return pdfjsLib
    try {
        // @ts-ignore
        importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
        // @ts-ignore
        pdfjsLib = globalThis['pdfjsLib']
        if (pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = ''
            pdfjsLoaded = true
        }
        return pdfjsLib
    } catch (e) {
        console.error('[Worker] Falha ao carregar pdfjs', e)
        return null
    }
}

async function deepPdf(buffer: ArrayBuffer, base: number): Promise<AnalysisResult> {
    let accurateCount = 1

    try {
        // PULO DO GATO: Garantimos a contagem exata primeiro com baixo uso de memória
        accurateCount = await getAccuratePageCount(buffer)

        const lib = await loadPdfjs()
        if (!lib) throw new Error('pdfjs unavailable')

        const pdf = await lib.getDocument({ data: buffer }).promise
        const pages: PageResult[] = []

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const tc = await page.getTextContent()
            const text = tc.items.map((x: any) => x.str).join(' ')
            const wc = text.trim() === '' ? 0 : text.trim().split(/\s+/).length

            let density: DensityType
            if (wc === 0) {
                const ops = await page.getOperatorList()
                const hasGfx = ops.fnArray.some((fn: number) =>
                    fn === lib.OPS?.paintImageXObject ||
                    fn === lib.OPS?.paintInlineImageXObject ||
                    fn === lib.OPS?.constructPath ||
                    fn === lib.OPS?.fill ||
                    fn === lib.OPS?.stroke
                )
                density = (hasGfx || ops.fnArray.length > 50) ? 'scanned' : 'blank'
            } else {
                density = classifyWC(wc)
            }

            pages.push(makePage(i, density, wc, base))
        }

        return build(pages, false, 'pdf', 'deep')

    } catch (err: any) {
        console.warn(`[Worker] Análise profunda falhou. Retornando contagem garantida de ${accurateCount} páginas.`, err?.message)
        // Se a memória estourar, não voltamos para 1. Mantemos o número exato de páginas!
        const fallbackPages = Array.from({ length: accurateCount }, (_, i) => makePage(i + 1, 'high', 300, base))
        return build(fallbackPages, false, 'pdf', 'deep')
    }
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerMsg>) => {
    const { type, id, buffer, fileName, base } = e.data

    try {
        const isImg = /\.(jpe?g|png|gif|webp|tiff?)$/i.test(fileName)
        const isDocx = /\.docx$/i.test(fileName)

        if (type === 'fastPass') {
            let result: AnalysisResult
            if (isImg) result = analyzeImage(base)
            else if (isDocx) result = analyzeDocx(buffer, base)
            else result = await fastPdf(buffer, base)
            self.postMessage({ type: 'fastPassDone', id, result } as WorkerResponse)
        }

        if (type === 'deepPass') {
            let result: AnalysisResult
            if (isImg) result = analyzeImage(base)
            else if (isDocx) result = analyzeDocx(buffer, base)
            else result = await deepPdf(buffer, base)
            self.postMessage({ type: 'deepPassDone', id, result } as WorkerResponse)
        }
    } catch (err: any) {
        self.postMessage({ type: 'error', id, message: err?.message || 'unknown' } as WorkerResponse)
    }
}

export { }