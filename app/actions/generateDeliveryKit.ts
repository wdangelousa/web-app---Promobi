'use server'

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'
import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'

// --- Utilitários de Limpeza ---
function stripHtml(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
}

function sanitizeForWinAnsi(text: string): string {
    if (!text) return ''
    return text.replace(/[^\x00-\xFF]/g, '')
}

// --- Carregamento da Capa de Certificação em PDF ---
async function _loadCertificationCover(
    targetDoc: PDFDocument,
    params: { orderId: number; dateStr: string; sourceLanguage?: string | null }
) {
    const { orderId, dateStr, sourceLanguage } = params
    const publicDir = path.join(process.cwd(), 'public')

    // Seleção dinâmica do ficheiro de capa
    const fileName = sourceLanguage === 'ES'
        ? 'capa certificacao es-en.pdf'
        : 'capa certificacao pt-en.pdf'

    const capaPath = path.join(publicDir, fileName)

    try {
        const capaBytes = await fs.readFile(capaPath)
        const capaPdf = await PDFDocument.load(capaBytes)
        const [capaPage] = await targetDoc.copyPages(capaPdf, [0])

        const boldFont = await targetDoc.embedFont(StandardFonts.HelveticaBold)

        // Coordenadas sugeridas para preenchimento dinâmico sobre o PDF
        // Ajuste estes valores (x, y) conforme o layout final das suas capas
        capaPage.drawText(`Order #${orderId + 1000}-USA`, {
            x: 440,
            y: 555,
            size: 10,
            font: boldFont,
            color: rgb(0, 0, 0)
        })

        capaPage.drawText(dateStr, {
            x: 75,
            y: 155,
            size: 10,
            font: boldFont,
            color: rgb(0, 0, 0)
        })

        return capaPage
    } catch (err) {
        console.error(`[DeliveryKit] Erro ao carregar capa ${fileName}:`, err)
        return null
    }
}

// --- Ação Principal de Geração ---
export async function generateDeliveryKit(orderId: number, documentId: number, options?: { preview?: boolean }) {
    const isPreview = options?.preview ?? false
    console.log(`[DeliveryKit] Gerando kit para Doc #${documentId} (Idioma: ${isPreview ? 'Preview' : 'Final'})`)

    try {
        const doc = await prisma.document.findUnique({
            where: { id: documentId },
            include: { order: true },
        })

        if (!doc) throw new Error('Documento não encontrado no banco.')

        const finalPdf = await PDFDocument.create()
        const publicDir = path.join(process.cwd(), 'public')

        // 1. Carregar Papel Timbrado para as páginas de tradução
        const timbradoBytes = await fs.readFile(path.join(publicDir, 'letterhead promobi.pdf'))
        const timbradoPdf = await PDFDocument.load(timbradoBytes)
        const fontNormal = await finalPdf.embedFont(StandardFonts.Helvetica)

        // 2. Processar Páginas de Tradução
        const translationPdf = await PDFDocument.create()
        if (doc.translatedText) {
            const plainText = sanitizeForWinAnsi(stripHtml(doc.translatedText))
            const [bgPage] = await translationPdf.copyPages(timbradoPdf, [0])
            translationPdf.addPage(bgPage)

            // Renderização básica de texto (Substituir por lógica de Tiptap futuramente)
            bgPage.drawText(plainText, {
                x: 72,
                y: 650,
                size: 11,
                font: fontNormal,
                lineHeight: 15
            })
        }

        // 3. Adicionar Páginas Originais
        if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
            const originalRes = await fetch(doc.originalFileUrl)
            const originalBuf = Buffer.from(await originalRes.arrayBuffer())
            const originalPdf = await PDFDocument.load(originalBuf, { ignoreEncryption: true })
            const copied = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices())
            copied.forEach(p => finalPdf.addPage(p))
        }

        // 4. Inserir a Capa Correta (PT ou ES) na Posição 0
        const dateStr = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        })

        const capaPage = await _loadCertificationCover(finalPdf, {
            orderId,
            dateStr,
            sourceLanguage: doc.sourceLanguage || doc.order.sourceLanguage
        })

        if (capaPage) {
            finalPdf.insertPage(0, capaPage)
        }

        // 5. Inserir Páginas de Tradução após a Capa
        const transPages = await finalPdf.copyPages(translationPdf, translationPdf.getPageIndices())
        transPages.forEach((p, i) => finalPdf.insertPage(1 + i, p))

        // 6. Finalização e Upload
        const pdfBytes = await finalPdf.save()
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
        const supabase = createClient(supabaseUrl, supabaseKey)

        const safeName = `kit_${orderId}_${documentId}_${Date.now()}.pdf`
        const pathPrefix = isPreview ? 'orders/previews/' : 'orders/completed/'

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(pathPrefix + safeName, pdfBytes, { contentType: 'application/pdf' })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(pathPrefix + safeName)
        const deliveryUrl = urlData.publicUrl

        if (!isPreview) {
            await prisma.document.update({
                where: { id: documentId },
                data: { delivery_pdf_url: deliveryUrl, translation_status: 'approved' }
            })
        }

        return { success: true, deliveryUrl }
    } catch (error: any) {
        console.error('[DeliveryKit] Erro:', error)
        return { success: false, error: error.message }
    }
}