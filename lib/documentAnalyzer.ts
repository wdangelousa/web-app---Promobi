// lib/documentAnalyzer.ts
// Main thread interface — spawns Web Workers for all heavy work.
// The main thread NEVER blocks. All pdfjs and byte parsing runs in workers.

import { PDFDocument } from 'pdf-lib'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DensityType = 'high' | 'medium' | 'low' | 'blank' | 'scanned'

export type PageAnalysis = {
    pageNumber: number
    wordCount: number
    density: DensityType
    price: number
    fraction: number
    included: boolean
}

export type DocumentAnalysis = {
    totalPages: number
    pages: PageAnalysis[]
    totalPrice: number
    originalTotalPrice: number
    isImage: boolean
    phase: 'fast' | 'deep'
    fileType: 'pdf' | 'image' | 'docx' | 'unknown'
}

export type BatchProgress = {
    fileIndex: number
    fileName: string
    analysis: DocumentAnalysis
    completed: number
    total: number
}

// ─── Density thresholds ───────────────────────────────────────────────────────
//
// Calibrado para documentos USCIS típicos (passaportes, certidões, etc.)
//
//   blank   :   0 palavras  →  0%    (página em branco / separador)
//   low     :  1–79 palavras → 25%   (carimbo, assinatura, capa)
//   medium  : 80–199         → 50%   (formulário parcialmente preenchido)
//   high    : 200+           → 100%  (texto denso, contrato, certidão)
//   scanned : imagem embutida → 100% (OCR obrigatório)
//
// Thresholds conservadores para nunca cobrar a mais do cliente.

function wordCountToDensity(words: number): { density: DensityType; fraction: number } {
    if (words === 0)    return { density: 'blank',  fraction: 0    }
    if (words < 80)     return { density: 'low',    fraction: 0.25 }
    if (words < 200)    return { density: 'medium', fraction: 0.5  }
    return              { density: 'high',   fraction: 1.0  }
}

// ─── Heurística bytes/página → densidade estimada ─────────────────────────────
//
// Usado no fallback quando o Web Worker (pdfjs) não está disponível.
// PDFs com muito texto → stream de texto é pequeno (texto comprimido).
// PDFs com imagens escaneadas → stream de imagem é enorme.
// PDFs com pouco conteúdo → stream minúsculo.
//
// Correlação empírica calibrada com documentos reais de imigração.

function bytesPerPageToDensity(bytesPerPage: number): { density: DensityType; fraction: number; wordCount: number } {
    // PDF digitalizado (scanned) — imagem embutida por página
    if (bytesPerPage > 350_000) return { density: 'scanned', fraction: 1.0,  wordCount: 0   }
    // Alta densidade — documento de texto rico (contrato, certidão)
    if (bytesPerPage > 50_000)  return { density: 'high',    fraction: 1.0,  wordCount: 250 }
    // Média densidade — formulário preenchido parcialmente
    if (bytesPerPage > 12_000)  return { density: 'medium',  fraction: 0.5,  wordCount: 120 }
    // Baixa densidade — capa, carimbo, página de assinatura
    if (bytesPerPage > 2_500)   return { density: 'low',     fraction: 0.25, wordCount: 40  }
    // Em branco — separador ou página vazia
    return                       { density: 'blank',   fraction: 0,    wordCount: 0   }
}

// ─── Worker pool ──────────────────────────────────────────────────────────────

const WORKER_POOL_SIZE = 4
const DEEP_CONCURRENCY = 4

let workerPool: Worker[] = []
const pendingMap = new Map<string, { resolve: (r: DocumentAnalysis) => void; reject: (e: Error) => void }>()

function getOrCreatePool(): Worker[] {
    if (typeof window === 'undefined') return []
    if (workerPool.length === 0) {
        for (let i = 0; i < WORKER_POOL_SIZE; i++) {
            try {
                const w = new Worker(new URL('./documentAnalyzer.worker.ts', import.meta.url))
                w.onmessage = handleWorkerMessage
                w.onerror = (e) => console.error('[DocumentAnalyzer Worker Error]', e)
                workerPool.push(w)
            } catch (err) {
                console.error('[DocumentAnalyzer] Failed to create worker:', err)
            }
        }
    }
    return workerPool
}

function handleWorkerMessage(e: MessageEvent) {
    const { type, id, result, message } = e.data
    const pending = pendingMap.get(id)
    if (!pending) return
    pendingMap.delete(id)

    if (type === 'error') {
        pending.reject(new Error(message))
    } else {
        pending.resolve(result as DocumentAnalysis)
    }
}

let workerIndex = 0
function getNextWorker(): Worker | null {
    const pool = getOrCreatePool()
    if (pool.length === 0) return null
    const w = pool[workerIndex % pool.length]
    workerIndex++
    return w
}

function sendToWorker(
    type: 'fastPass' | 'deepPass',
    file: File,
    base: number
): Promise<DocumentAnalysis> {
    return new Promise(async (resolve, reject) => {
        const worker = getNextWorker()

        if (!worker) {
            try {
                resolve(await inlineFallback(type, file, base))
            } catch (err) {
                reject(err)
            }
            return
        }

        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        pendingMap.set(id, { resolve, reject })

        const buffer = await file.arrayBuffer()
        worker.postMessage({ type, id, buffer, fileName: file.name, base }, [buffer])
    })
}

// ─── Inline fallback ─────────────────────────────────────────────────────────
//
// Acionado quando os Web Workers não estão disponíveis (SSR, alguns browsers).
//
// ✅ CORRIGIDO: antes hardcodeava density:'high' wordCount:300 para tudo.
//    Agora usa heurística calibrada de bytes/página para estimar densidade real.
//    O worker com pdfjs ainda dará resultados mais precisos quando disponível,
//    mas o fallback agora é razoável em vez de cobrar alta em tudo.

async function inlineFallback(type: 'fastPass' | 'deepPass', file: File, base: number): Promise<DocumentAnalysis> {
    const isImg  = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)
    const isDocx = /\.docx$/i.test(file.name) || file.type.includes('wordprocessingml')

    // Imagem → sempre scanned (precisa de OCR, cobra 100%)
    if (isImg) {
        return {
            totalPages: 1,
            pages: [{ pageNumber: 1, wordCount: 0, density: 'scanned', price: base, fraction: 1, included: true }],
            totalPrice: base, originalTotalPrice: base,
            isImage: true, phase: 'deep', fileType: 'image'
        }
    }

    // DOCX → heurística pelo tamanho do arquivo
    if (isDocx) {
        // DOCX médio tem ~400 bytes por palavra no ZIP comprimido
        const estimatedWords = Math.round(file.size / 400)
        const { density, fraction } = wordCountToDensity(estimatedWords)
        const price = base * fraction
        return {
            totalPages: 1,
            pages: [{ pageNumber: 1, wordCount: estimatedWords, density, price, fraction, included: true }],
            totalPrice: price, originalTotalPrice: price,
            isImage: false, phase: 'fast', fileType: 'docx'
        }
    }

    // PDF → usa pdf-lib para contar páginas e heurística bytes/página
    try {
        const buf = await file.arrayBuffer()
        const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
        const pageCount = pdfDoc.getPageCount()

        // Bytes por página: divide o arquivo pelo número de páginas.
        // Em PDFs mistos (algumas páginas escaneadas, outras texto) isso é uma
        // média — o worker com pdfjs faz análise página a página mais precisa.
        const bytesPerPage = file.size / pageCount

        const pages: PageAnalysis[] = Array.from({ length: pageCount }, (_, i) => {
            const { density, fraction, wordCount } = bytesPerPageToDensity(bytesPerPage)
            const price = base * fraction
            return { pageNumber: i + 1, wordCount, density, price, fraction, included: true }
        })

        const totalPrice = pages.reduce((s, p) => s + p.price, 0)

        return {
            totalPages: pageCount,
            pages,
            totalPrice,
            originalTotalPrice: totalPrice,
            isImage: false,
            phase: 'fast',
            fileType: 'pdf'
        }
    } catch (err) {
        console.error('[DocumentAnalyzer] Inline fallback failed:', err)
        // Último recurso — medium (nunca cobra a mais em caso de erro)
        const price = base * 0.5
        return {
            totalPages: 1,
            pages: [{ pageNumber: 1, wordCount: 100, density: 'medium', price, fraction: 0.5, included: true }],
            totalPrice: price, originalTotalPrice: price,
            isImage: false, phase: 'fast', fileType: 'pdf'
        }
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fastPassAnalysis(file: File, base = 9.00): Promise<DocumentAnalysis> {
    return sendToWorker('fastPass', file, base)
}

export async function deepAnalysis(file: File, base = 9.00): Promise<DocumentAnalysis> {
    return sendToWorker('deepPass', file, base)
}

export async function batchDeepAnalysis(
    files: Array<{ index: number; file: File }>,
    base: number,
    onFileComplete: (p: BatchProgress) => void,
    concurrency = DEEP_CONCURRENCY
): Promise<void> {
    const total = files.length
    let completed = 0

    for (let i = 0; i < files.length; i += concurrency) {
        const chunk = files.slice(i, i + concurrency)
        await Promise.all(chunk.map(async ({ index, file }) => {
            const analysis = await deepAnalysis(file, base)
            completed++
            onFileComplete({ fileIndex: index, fileName: file.name, analysis, completed, total })
        }))
    }
}

export function detectFileType(file: File): 'pdf' | 'image' | 'docx' | 'unsupported' {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
    if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)) return 'image'
    if (/\.docx$/i.test(file.name) || file.type.includes('wordprocessingml')) return 'docx'
    return 'unsupported'
}

export function isSupportedFile(file: File): boolean {
    return detectFileType(file) !== 'unsupported'
}

export async function analyzeDocument(file: File, base = 9.00): Promise<DocumentAnalysis> {
    return deepAnalysis(file, base)
}
