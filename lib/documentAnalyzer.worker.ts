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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePage(num: number, density: DensityType, wc: number, base: number): PageResult {
    const fracs: Record<DensityType, number> = { high: 1, scanned: 1, medium: 0.5, low: 0.25, blank: 0 }
    const f = fracs[density]
    return { pageNumber: num, wordCount: wc, density, price: base * f, fraction: f, included: true }
}

function build(pages: PageResult[], isImage: boolean, fileType: AnalysisResult['fileType'], phase: AnalysisResult['phase']): AnalysisResult {
    const total = pages.reduce((s, p) => s + p.price, 0)
    return { totalPages: pages.length, pages, totalPrice: total, originalTotalPrice: total, isImage, phase, fileType }
}

// ─── Density thresholds ───────────────────────────────────────────────────────
//
// Calibrado para documentos USCIS (passaportes, certidões, contratos).
//
//   blank   :   0 palavras  →  0%    (página em branco / separador)
//   low     :  1–79         → 25%    (carimbo, assinatura, capa)
//   medium  : 80–249        → 50%    (formulário parcialmente preenchido)
//   high    : 250+          → 100%   (texto denso, certidão, contrato)
//
// Thresholds conservadores: nunca cobrar a mais do cliente.

function classifyWC(n: number): DensityType {
    if (n === 0)    return 'blank'
    if (n < 80)     return 'low'
    if (n < 250)    return 'medium'
    return 'high'
}

// ─── Heurística bytes/página (fallback quando pdfjs não disponível) ────────────
//
// PDFs escaneados → imagem embutida → muito pesados por página (> 300 KB)
// PDFs de texto rico → stream de texto comprimido → mais leves
// PDFs quase vazios → stream mínimo
//
// Esta heurística é usada em fastPass e como fallback de deepPass.

function bytesPerPageToDensity(bytesPerPage: number): { density: DensityType; fraction: number; wordCount: number } {
    if (bytesPerPage > 350_000) return { density: 'scanned', fraction: 1.0,  wordCount: 0   }
    if (bytesPerPage > 50_000)  return { density: 'high',    fraction: 1.0,  wordCount: 260 }
    if (bytesPerPage > 12_000)  return { density: 'medium',  fraction: 0.5,  wordCount: 130 }
    if (bytesPerPage > 2_500)   return { density: 'low',     fraction: 0.25, wordCount: 40  }
    return                       { density: 'blank',   fraction: 0,    wordCount: 0   }
}

// ─── Accurate page count via pdf-lib ─────────────────────────────────────────

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
//
// ANTES: hardcodeava 'high' + 300 palavras para todas as páginas.
// AGORA: usa heurística calibrada de bytes/página.

async function fastPdf(buffer: ArrayBuffer, base: number): Promise<AnalysisResult> {
    const count = await getAccuratePageCount(buffer)
    const bytesPerPage = buffer.byteLength / count

    const pages = Array.from({ length: count }, (_, i) => {
        const { density, wordCount } = bytesPerPageToDensity(bytesPerPage)
        return makePage(i + 1, density, wordCount, base)
    })

    return build(pages, false, 'pdf', 'fast')
}

// ─── DOCX / Image ─────────────────────────────────────────────────────────────

function analyzeDocx(buffer: ArrayBuffer, base: number): AnalysisResult {
    try {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
        const matches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []
        const words = matches
            .map(m => m.replace(/<[^>]+>/g, '').trim())
            .filter(Boolean)
            .join(' ')
            .split(/\s+/)
            .filter(Boolean)
        const wc = words.length
        const pages = Math.max(1, Math.ceil(wc / 250))
        const wpg = Math.round(wc / pages)
        return build(
            Array.from({ length: pages }, (_, i) => makePage(i + 1, classifyWC(wpg), wpg, base)),
            false, 'docx', 'deep'
        )
    } catch {
        // Fallback: estimativa conservadora
        const estimatedWC = Math.round(buffer.byteLength / 400)
        const wpg = Math.round(estimatedWC / Math.max(1, Math.ceil(estimatedWC / 250)))
        return build([makePage(1, classifyWC(wpg), wpg, base)], false, 'docx', 'deep')
    }
}

function analyzeImage(base: number): AnalysisResult {
    return build([makePage(1, 'scanned', 0, base)], true, 'image', 'deep')
}

// ─── pdfjs loader ─────────────────────────────────────────────────────────────
//
// ANTES: usava importScripts() que NÃO funciona em module workers (Next.js).
// AGORA: usa import() dinâmico — compatível com ES module workers.

let pdfjsLib: any = null

async function loadPdfjs(): Promise<any> {
    if (pdfjsLib) return pdfjsLib
    try {
        // Import dinâmico — funciona em module workers (Next.js)
        const pdfjs = await import('pdfjs-dist')
        // Desabilita o worker interno do pdfjs (já estamos dentro de um worker)
        pdfjs.GlobalWorkerOptions.workerSrc = ''
        pdfjsLib = pdfjs
        return pdfjsLib
    } catch (e) {
        console.warn('[Worker] pdfjs-dist não disponível, usando heurística de bytes.', e)
        return null
    }
}

// ─── Deep pass ────────────────────────────────────────────────────────────────
//
// Tenta pdfjs para análise real palavra por palavra.
// Fallback: heurística de bytes/página (melhor do que hardcodar 'high').

async function deepPdf(buffer: ArrayBuffer, base: number): Promise<AnalysisResult> {
    const accurateCount = await getAccuratePageCount(buffer)

    // ── Tenta pdfjs (análise real) ────────────────────────────────────────────
    try {
        const lib = await loadPdfjs()
        if (!lib) throw new Error('pdfjs não disponível')

        const pdf = await lib.getDocument({ data: buffer.slice(0) }).promise
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
        // ── Fallback calibrado: bytes/página ──────────────────────────────────
        // ANTES: hardcodeava 'high' + 300 para tudo.
        // AGORA: usa heurística proporcional — nunca cobra a mais por erro.
        console.warn(`[Worker] pdfjs falhou (${err?.message}). Usando heurística de bytes.`)

        const bytesPerPage = buffer.byteLength / accurateCount
        const pages = Array.from({ length: accurateCount }, (_, i) => {
            const { density, wordCount } = bytesPerPageToDensity(bytesPerPage)
            return makePage(i + 1, density, wordCount, base)
        })

        return build(pages, false, 'pdf', 'deep')
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
            else             result = await fastPdf(buffer, base)
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

export { }
