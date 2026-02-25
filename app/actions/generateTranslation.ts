'use server'

import * as deepl from 'deepl-node'
import prisma from '../../lib/prisma'

// ─── PDF text extraction ───────────────────────────────────────────────────────
/**
 * Extracts all plain text from a PDF buffer using pdf2json — a pure Node.js
 * library with zero dependency on browser APIs (no DOMMatrix, no canvas).
 *
 * pdf-parse / pdfjs-dist were removed because pdfjs-dist v5 executes
 * `const SCALE_MATRIX = new DOMMatrix()` at module load time, which throws
 * "DOMMatrix is not defined" in Node.js before any polyfill can be applied.
 */
async function extractPDFText(buffer: Buffer): Promise<string> {
    // pdf2json exports the constructor as the module default (not a named export)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require('pdf2json') as any
    const pdfParser = new PDFParser(null, true) // null context; true = extract raw text

    return new Promise<string>((resolve, reject) => {
        pdfParser.on('pdfParser_dataError', (errData: any) => {
            reject(new Error(errData.parserError ?? 'PDF parsing failed'))
        })
        pdfParser.on('pdfParser_dataReady', () => {
            resolve((pdfParser.getRawTextContent() as string) ?? '')
        })
        pdfParser.parseBuffer(buffer)
    })
}

/** Returns true when the document is a PDF, based on docType, filename, or URL.
 *  docType is often a human-readable label ("Certidão de Nascimento"), so the
 *  Supabase storage URL extension is the most reliable signal.
 */
function isPDF(doc: {
    docType?: string | null
    exactNameOnDoc?: string | null
    originalFileUrl?: string | null
}): boolean {
    return (
        doc.docType?.toLowerCase().includes('pdf') ||
        doc.exactNameOnDoc?.toLowerCase().endsWith('.pdf') ||
        doc.originalFileUrl?.toLowerCase().includes('.pdf') ||
        false
    )
}

// ─── translateSingleDocument ──────────────────────────────────────────────────
/**
 * Translates a single document on-demand via DeepL.
 * Designed for the manual "Traduzir com IA" button in the Workbench editor.
 *
 * Returns { success: true, text } on success so the UI can inject the result
 * immediately without a page refresh.
 */
export async function translateSingleDocument(
    docId: number
): Promise<{ success: boolean; text?: string; error?: string }> {
    const authKey = process.env.DEEPL_API_KEY
    if (!authKey) return { success: false, error: 'DEEPL_API_KEY não está configurada no servidor.' }

    try {
        const doc = await prisma.document.findUnique({ where: { id: docId } })
        if (!doc) return { success: false, error: 'Documento não encontrado.' }

        if (!doc.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') {
            return { success: false, error: 'Nenhum arquivo original disponível para este documento.' }
        }

        // 1. Download
        const response = await fetch(doc.originalFileUrl)
        if (!response.ok) {
            return { success: false, error: `Falha ao baixar o arquivo: ${response.statusText}` }
        }
        const dataBuffer = Buffer.from(await response.arrayBuffer())

        // 2. Guard — only PDFs can have text extracted
        if (!isPDF(doc)) {
            await prisma.document.update({ where: { id: docId }, data: { translation_status: 'needs_manual' } })
            return {
                success: false,
                error: 'Este documento não é um PDF compatível com extração de texto. Use o upload manual de PDF.',
            }
        }

        // 3. Extract text via pdf2json
        const extractedText = await extractPDFText(dataBuffer)

        if (!extractedText || extractedText.trim().length === 0) {
            await prisma.document.update({ where: { id: docId }, data: { translation_status: 'needs_manual' } })
            return {
                success: false,
                error: 'Nenhum texto extraído do PDF — provavelmente um documento escaneado/imagem. Use o upload manual de PDF.',
            }
        }

        // 4. Translate via DeepL
        const translator = new deepl.Translator(authKey)
        const result = await translator.translateText(extractedText, null, 'en-US')
        const translatedText = Array.isArray(result) ? result.map(r => r.text).join('\n') : result.text

        // 5. Save draft
        await prisma.document.update({
            where: { id: docId },
            data: { translatedText, translation_status: 'translated' },
        })

        console.log(`[ManualTranslate] ✅ Doc #${docId} translated and saved.`)
        return { success: true, text: translatedText }

    } catch (error: any) {
        console.error(`[ManualTranslate] Error on Doc #${docId}:`, error)
        await prisma.document.update({
            where: { id: docId },
            data: { translation_status: 'error' },
        }).catch(() => {})
        return { success: false, error: error?.message ?? 'Erro desconhecido na tradução.' }
    }
}

// ─── generateTranslationDraft (order-level auto-translation) ──────────────────

export async function generateTranslationDraft(orderId: number) {
    console.log(`[AutoTranslation] Starting for Order #${orderId}`)

    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { documents: true }
        })

        if (!order) {
            console.error(`[AutoTranslation] Order #${orderId} not found`)
            return { success: false, error: 'Order not found' }
        }

        // Mark order as TRANSLATING immediately so the Workbench shows the
        // correct state and the retry button becomes visible on doc errors.
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'TRANSLATING' }
        })

        const authKey = process.env.DEEPL_API_KEY
        if (!authKey) {
            console.error('[AutoTranslation] Missing DEEPL_API_KEY — marking order as MANUAL_TRANSLATION_NEEDED')
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'MANUAL_TRANSLATION_NEEDED' }
            })
            return { success: false, error: 'Missing API Key' }
        }

        const translator = new deepl.Translator(authKey)
        let completedCount = 0
        let errorCount = 0

        for (const doc of order.documents) {
            try {
                if (!doc.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') {
                    console.log(`[AutoTranslation] Document #${doc.id} has no file yet — skipping.`)
                    continue
                }

                console.log(`[AutoTranslation] Processing Document #${doc.id} (${doc.exactNameOnDoc ?? doc.docType})`)

                // 1. Download
                const response = await fetch(doc.originalFileUrl)
                if (!response.ok) throw new Error(`Download failed: ${response.statusText}`)
                const dataBuffer = Buffer.from(await response.arrayBuffer())

                // 2. Non-PDF → needs_manual
                if (!isPDF(doc)) {
                    console.warn(`[AutoTranslation] Doc #${doc.id} is not a PDF — marking as needs_manual.`)
                    await prisma.document.update({
                        where: { id: doc.id },
                        data: { translation_status: 'needs_manual' }
                    })
                    continue
                }

                // 3. Extract text via pdf2json
                const extractedText = await extractPDFText(dataBuffer)
                console.log(`[AutoTranslation] Extracted ${extractedText.length} chars from Doc #${doc.id}`)

                if (!extractedText || extractedText.trim().length === 0) {
                    console.warn(`[AutoTranslation] No text in Doc #${doc.id} — likely scanned image. Marking as needs_manual.`)
                    await prisma.document.update({
                        where: { id: doc.id },
                        data: { translation_status: 'needs_manual' }
                    })
                    continue
                }

                // 4. Translate via DeepL
                const result = await translator.translateText(extractedText, null, 'en-US')
                const translatedText = Array.isArray(result) ? result.map(r => r.text).join('\n') : result.text

                // 5. Save draft
                await prisma.document.update({
                    where: { id: doc.id },
                    data: { translatedText, translation_status: 'translated' }
                })

                completedCount++
                console.log(`[AutoTranslation] Saved draft for Doc #${doc.id}`)

            } catch (err) {
                console.error(`[AutoTranslation] Error processing document #${doc.id}:`, err)
                await prisma.document.update({
                    where: { id: doc.id },
                    data: { translation_status: 'error' }
                }).catch(updateErr =>
                    console.error(`[AutoTranslation] Failed to mark doc #${doc.id} as error:`, updateErr)
                )
                errorCount++
            }
        }

        // Final status update
        if (completedCount > 0) {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'READY_FOR_REVIEW' }
            })
            console.log(`[AutoTranslation] ✅ Order #${orderId} → READY_FOR_REVIEW (${completedCount} docs, ${errorCount} errors)`)
            return { success: true, count: completedCount }
        } else {
            console.error(`[AutoTranslation] ❌ Order #${orderId} — no documents processed (${errorCount} errors). Marking MANUAL_TRANSLATION_NEEDED.`)
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'MANUAL_TRANSLATION_NEEDED' }
            })
            return { success: false, error: 'No documents processed' }
        }

    } catch (error) {
        console.error('[AutoTranslation] Critical Error:', error)
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'MANUAL_TRANSLATION_NEEDED' }
        })
        return { success: false, error: String(error) }
    }
}
