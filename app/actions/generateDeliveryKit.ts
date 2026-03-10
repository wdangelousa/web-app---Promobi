'use server'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'
import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'
import { SourceLanguage } from '@prisma/client'

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

// --- Carregamento da Capa com Coordenadas Visuais (Base Limpa) ---
async function _loadCertificationCover(
    targetDoc: PDFDocument,
    params: {
        docType: string;
        orderId: number;
        translatedPages: number;
        dateStr: string;
        sourceLanguage?: string | null
    }
) {
    const { docType, orderId, translatedPages, dateStr, sourceLanguage } = params
    const publicDir = path.join(process.cwd(), 'public')

    const fileName = sourceLanguage === 'ES'
        ? 'capa certificacao es-en.pdf'
        : 'capa certificacao pt-en.pdf'

    const capaPath = path.join(publicDir, fileName)

    try {
        const capaBytes = await fs.readFile(capaPath)
        const templatePdf = await PDFDocument.load(capaBytes)

        // 1. Carregamos a fonte DIRETAMENTE no documento original antes de copiar (evita texto invisível)
        const boldFont = await templatePdf.embedFont(StandardFonts.HelveticaBold)
        const fontSize = 11;
        const fontColor = rgb(0, 0, 0);

        // 2. Pegamos a página original do Canva para carimbar o texto
        const page = templatePdf.getPages()[0]

        // 3. Carimbamos o texto nas coordenadas exatas sobre os espaços agora em branco

        // Document Type
        page.drawText(docType.toUpperCase(), {
            x: 153, y: 660, size: fontSize, font: boldFont, color: fontColor
        })

        // Number of Pages
        page.drawText(String(translatedPages).padStart(2, '0'), {
            x: 157, y: 602, size: fontSize, font: boldFont, color: fontColor
        })

        // Order Number
        page.drawText(`${orderId}-USA`, {
            x: 105, y: 583, size: fontSize, font: boldFont, color: fontColor
        })

        // Date
        page.drawText(dateStr, {
            x: 77, y: 108, size: fontSize, font: boldFont, color: fontColor
        })

        // 4. Copiamos a página já carimbada para o documento alvo
        const [capaPage] = await targetDoc.copyPages(templatePdf, [0])

        return capaPage
    } catch (err) {
        console.error(`[DeliveryKit] Erro ao carregar capa ${fileName}:`, err)
        return null
    }
}

// --- Ação Principal de Geração ---
export async function generateDeliveryKit(orderId: number, documentId: number, options?: { preview?: boolean; coverLanguage?: string }) {
    const isPreview = options?.preview ?? false
    try {
        const doc = await prisma.document.findUnique({
            where: { id: documentId },
            include: { order: true },
        })

        if (!doc) throw new Error('Documento não encontrado.')

        // SALVA A ESCOLHA DO IDIOMA DA CAPA NO BANCO DE DADOS
        if (options?.coverLanguage) {
            await prisma.document.update({
                where: { id: documentId },
                data: { sourceLanguage: options.coverLanguage as SourceLanguage }
            });
            doc.sourceLanguage = options.coverLanguage as SourceLanguage;
        }

        const finalPdf = await PDFDocument.create()
        const publicDir = path.join(process.cwd(), 'public')

        // Páginas de Tradução
        const timbradoBytes = await fs.readFile(path.join(publicDir, 'letterhead promobi.pdf'))
        const timbradoPdf = await PDFDocument.load(timbradoBytes)
        const fontNormal = await finalPdf.embedFont(StandardFonts.Helvetica)

        const translationPdf = await PDFDocument.create()
        let actualTranslationPageCount = 0

        if (doc.translatedText) {
            const plainText = sanitizeForWinAnsi(stripHtml(doc.translatedText))
            const [bgPage] = await translationPdf.copyPages(timbradoPdf, [0])
            translationPdf.addPage(bgPage)

            actualTranslationPageCount = 1

            bgPage.drawText(plainText, { x: 72, y: 650, size: 11, font: fontNormal, lineHeight: 15 })
        }

        // Páginas Originais
        if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
            const originalRes = await fetch(doc.originalFileUrl)
            const originalBuf = Buffer.from(await originalRes.arrayBuffer())
            const originalPdf = await PDFDocument.load(originalBuf, { ignoreEncryption: true })
            const copied = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices())
            copied.forEach(p => finalPdf.addPage(p))
        }

        // Data USA
        const now = new Date();
        const mm = (now.getMonth() + 1).toString().padStart(2, '0');
        const dd = now.getDate().toString().padStart(2, '0');
        const yyyy = now.getFullYear();
        const dateStr = `${mm}/${dd}/${yyyy}`;

        // Geração da Capa
        const docType = doc.exactNameOnDoc || doc.docType || 'Official Document'
        const capaPage = await _loadCertificationCover(finalPdf, {
            docType,
            orderId,
            translatedPages: actualTranslationPageCount,
            dateStr,
            // A capa vai priorizar o que a tradutora escolher no modal de Preview
            sourceLanguage: options?.coverLanguage || doc.sourceLanguage || doc.order.sourceLanguage
        })

        if (capaPage) finalPdf.insertPage(0, capaPage)

        // Montagem
        const transPages = await finalPdf.copyPages(translationPdf, translationPdf.getPageIndices())
        transPages.forEach((p, i) => finalPdf.insertPage(1 + i, p))

        // Upload
        const pdfBytes = await finalPdf.save()
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
        const safeName = `kit_${orderId}_${documentId}_${Date.now()}.pdf`
        const pathPrefix = isPreview ? 'orders/previews/' : 'orders/completed/'

        const pdfBuffer = Buffer.from(pdfBytes)
        await supabase.storage.from('documents').upload(pathPrefix + safeName, pdfBuffer, {
            contentType: 'application/pdf',
            duplex: 'half'
        } as any)

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(pathPrefix + safeName)

        if (!isPreview) {
            await prisma.document.update({
                where: { id: documentId },
                data: { delivery_pdf_url: urlData.publicUrl, translation_status: 'approved' }
            })
        }

        return { success: true, deliveryUrl: urlData.publicUrl }
    } catch (error: any) {
        console.error('[DeliveryKit] Erro de Geração:', error)
        return { success: false, error: error.message }
    }
}