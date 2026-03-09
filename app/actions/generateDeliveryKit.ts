'use server'

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'
import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'

// --- Utilitários de Texto ---
function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function sanitizeForWinAnsi(text: string): string {
    return text ? text.replace(/[^\x00-\xFF]/g, '') : ''
}

// --- Lógica da Capa de Certificação ---
async function _buildCoverPageInDoc(
    targetDoc: PDFDocument,
    params: { docType: string; orderId: number; totalPages: number; dateStr: string; sourceLanguage?: string }
) {
    const { docType, orderId, totalPages, dateStr, sourceLanguage } = params
    const publicDir = path.join(process.cwd(), 'public')

    // Identifica qual arquivo de capa usar
    const fileName = sourceLanguage === 'ES' ? 'capa certificacao es-en.pdf' : 'capa certificacao pt-en.pdf'
    const capaPath = path.join(publicDir, fileName)

    try {
        const capaBytes = await fs.readFile(capaPath)
        const capaPdf = await PDFDocument.load(capaBytes)
        const [capaPage] = await targetDoc.copyPages(capaPdf, [0])

        // Opcional: Desenhar metadados dinâmicos sobre a capa se houver campos em branco
        const boldFont = await targetDoc.embedFont(StandardFonts.HelveticaBold)
        capaPage.drawText(`Order #${orderId + 1000}-USA`, { x: 440, y: 550, size: 10, font: boldFont })
        capaPage.drawText(`Date: ${dateStr}`, { x: 70, y: 150, size: 10, font: boldFont })

        return capaPage
    } catch (err) {
        console.error(`Erro ao carregar capa ${fileName}:`, err)
        // Fallback: Adiciona página em branco se o arquivo não existir
        return targetDoc.addPage([612, 792])
    }
}

export async function generateDeliveryKit(orderId: number, documentId: number, options?: { preview?: boolean }) {
    const isPreview = options?.preview ?? false
    try {
        const doc = await prisma.document.findUnique({
            where: { id: documentId },
            include: { order: true },
        })

        if (!doc) return { success: false, error: 'Documento não encontrado.' }

        const finalPdf = await PDFDocument.create()
        const publicDir = path.join(process.cwd(), 'public')
        const timbradoBytes = await fs.readFile(path.join(publicDir, 'letterhead promobi.pdf'))
        const timbradoPdf = await PDFDocument.load(timbradoBytes)
        const fontNormal = await finalPdf.embedFont(StandardFonts.Helvetica)

        // 1. Páginas de Tradução
        const translationPdf = await PDFDocument.create()
        if (doc.translatedText) {
            const plainText = sanitizeForWinAnsi(stripHtml(doc.translatedText))
            const [bgPage] = await translationPdf.copyPages(timbradoPdf, [0])
            translationPdf.addPage(bgPage)
            bgPage.drawText(plainText, { x: 72, y: 650, size: 11, font: fontNormal })
        }

        // 2. Páginas Originais
        if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
            const originalRes = await fetch(doc.originalFileUrl)
            const originalBuf = Buffer.from(await originalRes.arrayBuffer())
            const originalPdf = await PDFDocument.load(originalBuf, { ignoreEncryption: true })
            const copied = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices())
            copied.forEach(p => finalPdf.addPage(p))
        }

        // 3. Gerar e Inserir Capa Baseada no Idioma
        const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        const capaPage = await _buildCoverPageInDoc(finalPdf, {
            docType: doc.docType,
            orderId,
            totalPages: translationPdf.getPageCount(),
            dateStr,
            sourceLanguage: doc.sourceLanguage || doc.order.sourceLanguage
        })
        finalPdf.insertPage(0, capaPage)

        // Copiar páginas de tradução para o finalPdf
        const transPages = await finalPdf.copyPages(translationPdf, translationPdf.getPageIndices())
        transPages.forEach((p, i) => finalPdf.insertPage(1 + i, p))

        const pdfBytes = await finalPdf.save()

        // Lógica de upload para Supabase (Simplificada para manter concisão conforme solicitado)
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
        const supabase = createClient(supabaseUrl, supabaseKey)
        const safeName = `delivery_kit_order${orderId}_doc${documentId}_${Date.now()}.pdf`
        const storagePath = isPreview ? `orders/previews/${safeName}` : `orders/completed/${safeName}`

        const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false })
        if (uploadError) throw new Error(`Supabase Upload: ${uploadError.message}`)

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storagePath)
        const deliveryUrl = urlData.publicUrl

        if (!isPreview) {
            await prisma.document.update({
                where: { id: documentId },
                data: { delivery_pdf_url: deliveryUrl, translation_status: 'approved' },
            })
            await prisma.order.update({ where: { id: orderId }, data: { deliveryUrl } })
        }

        return { success: true, deliveryUrl, isPreview }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}