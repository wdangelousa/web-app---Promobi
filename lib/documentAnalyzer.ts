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

async function inlineFallback(type: 'fastPass' | 'deepPass', file: File, base: number): Promise<DocumentAnalysis> {
    const isImg = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)
    const isDocx = /\.docx$/i.test(file.name) || file.type.includes('wordprocessingml')

    if (isImg) {
        return { totalPages: 1, pages: [{ pageNumber: 1, wordCount: 300, density: 'scanned', price: base, fraction: 1, included: true }], totalPrice: base, originalTotalPrice: base, isImage: true, phase: 'deep', fileType: 'image' }
    }

    if (isDocx) {
        return { totalPages: 1, pages: [{ pageNumber: 1, wordCount: 300, density: 'high', price: base, fraction: 1, included: true }], totalPrice: base, originalTotalPrice: base, isImage: false, phase: 'deep', fileType: 'docx' }
    }

    // PDF: Leitura infalível usando pdf-lib
    try {
        const buf = await file.arrayBuffer()
        const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
        const count = pdfDoc.getPageCount()
        const pages = Array.from({ length: count }, (_, i) => ({ pageNumber: i + 1, wordCount: 300, density: 'high' as DensityType, price: base, fraction: 1, included: true }))
        return { totalPages: count, pages, totalPrice: count * base, originalTotalPrice: count * base, isImage: false, phase: 'fast', fileType: 'pdf' }
    } catch (err) {
        console.error('[DocumentAnalyzer] Inline fallback failed', err)
        return { totalPages: 1, pages: [{ pageNumber: 1, wordCount: 300, density: 'high', price: base, fraction: 1, included: true }], totalPrice: base, originalTotalPrice: base, isImage: false, phase: 'fast', fileType: 'pdf' }
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