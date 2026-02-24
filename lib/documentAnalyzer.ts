// lib/documentAnalyzer.ts
//
// Main thread interface — spawns Web Workers for all heavy work.
// The main thread NEVER blocks. All pdfjs and byte parsing runs in workers.
//
// Architecture:
//   - Pool of up to 4 workers (reused across requests)
//   - Fast pass: byte scan in worker (~1ms), fires immediately for each file
//   - Deep pass: full pdfjs in worker, 4 concurrent, queue for rest

// ─── Types ────────────────────────────────────────────────────────────────────

export type DensityType = 'high' | 'medium' | 'low' | 'blank' | 'scanned'

export type PageAnalysis = {
    pageNumber: number
    wordCount:  number
    density:    DensityType
    price:      number
    fraction:   number
    included:   boolean
}

export type DocumentAnalysis = {
    totalPages:         number
    pages:              PageAnalysis[]
    totalPrice:         number
    originalTotalPrice: number
    isImage:            boolean
    phase:              'fast' | 'deep'
    fileType:           'pdf' | 'image' | 'docx' | 'unknown'
}

export type BatchProgress = {
    fileIndex: number
    fileName:  string
    analysis:  DocumentAnalysis
    completed: number
    total:     number
}

// ─── Worker pool ──────────────────────────────────────────────────────────────

const WORKER_POOL_SIZE = 4  // Matches typical CPU core count for browser workers
const DEEP_CONCURRENCY = 4  // Max simultaneous deep analyses

let   workerPool: Worker[]      = []
const pendingMap = new Map<string, { resolve: (r: DocumentAnalysis) => void; reject: (e: Error) => void }>()

function getOrCreatePool(): Worker[] {
    if (typeof window === 'undefined') return []  // SSR guard
    if (workerPool.length === 0) {
        for (let i = 0; i < WORKER_POOL_SIZE; i++) {
            try {
                const w = new Worker(new URL('./documentAnalyzer.worker.ts', import.meta.url))
                w.onmessage = handleWorkerMessage
                w.onerror   = (e) => console.error('[DocumentAnalyzer Worker Error]', e)
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

// Round-robin worker selection
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

        // Fallback: if workers unavailable (SSR, old browser), run inline
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

        // Transfer buffer to worker (zero-copy)
        const buffer = await file.arrayBuffer()
        worker.postMessage({ type, id, buffer, fileName: file.name, base }, [buffer])
    })
}

// ─── Inline fallback (no worker available) ───────────────────────────────────
// Used as safety net on environments that don't support workers.
// Simple and fast — only does fast pass level analysis.

async function inlineFallback(type: 'fastPass' | 'deepPass', file: File, base: number): Promise<DocumentAnalysis> {
    const isImg  = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)
    const isDocx = /\.docx$/i.test(file.name) || file.type.includes('wordprocessingml')

    if (isImg) {
        return { totalPages: 1, pages: [{ pageNumber: 1, wordCount: 300, density: 'scanned', price: base, fraction: 1, included: true }], totalPrice: base, originalTotalPrice: base, isImage: true, phase: 'deep', fileType: 'image' }
    }

    if (isDocx) {
        return { totalPages: 1, pages: [{ pageNumber: 1, wordCount: 300, density: 'high', price: base, fraction: 1, included: true }], totalPrice: base, originalTotalPrice: base, isImage: false, phase: 'deep', fileType: 'docx' }
    }

    // PDF: byte scan
    const buf   = await file.arrayBuffer()
    const view  = new Uint8Array(buf, Math.max(0, buf.byteLength - 32768))
    const text  = new TextDecoder('latin1').decode(view)
    const hits  = [...text.matchAll(/\/Count\s+(\d+)/g)]
    const count = Math.max(1, hits.length ? Math.max(...hits.map(m => parseInt(m[1]))) : 1)
    const pages = Array.from({ length: count }, (_, i) => ({ pageNumber: i + 1, wordCount: 300, density: 'high' as DensityType, price: base, fraction: 1, included: true }))
    return { totalPages: count, pages, totalPrice: count * base, originalTotalPrice: count * base, isImage: false, phase: 'fast', fileType: 'pdf' }
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

    // Process in concurrency chunks
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
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))                        return 'pdf'
    if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|tiff?)$/i.test(file.name)) return 'image'
    if (/\.docx$/i.test(file.name) || file.type.includes('wordprocessingml'))                return 'docx'
    return 'unsupported'
}

export function isSupportedFile(file: File): boolean {
    return detectFileType(file) !== 'unsupported'
}

// Legacy compat
export async function analyzeDocument(file: File, base = 9.00): Promise<DocumentAnalysis> {
    return deepAnalysis(file, base)
}
