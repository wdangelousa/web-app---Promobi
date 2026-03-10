'use server'

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'
import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'

// --- Utilitários de Texto ---
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

// --- Ajuste de Designer: Preenchimento da Capa ---
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
    
    // Seleção automática da capa baseada no idioma
    const fileName = sourceLanguage === 'ES' 
        ? 'capa certificacao es-en.pdf' 
        : 'capa certificacao pt-en.pdf'
    
    const capaPath = path.join(publicDir, fileName)

    try {
        const capaBytes = await fs.readFile(capaPath)
        const capaPdf = await PDFDocument.load(capaBytes)
        const [capaPage] = await targetDoc.copyPages(capaPdf, [0])
        
        const font = await targetDoc.embedFont(StandardFonts.Helvetica)
        const boldFont = await targetDoc.embedFont(StandardFonts.HelveticaBold)
        
        // --- AJUSTES DE COORDENADAS (PRECISÃO DE DESIGN) ---
        // Alinhamento horizontal dos valores à direita dos labels
        const valueX = 225; 
        // Baixamos o startY para 585 para alinhar com o grid do template
        const startY = 585; 
        const spacing = 26; 
        const fontSize = 10;

        // 1. Document Type (Linha 1)
        capaPage.drawText(docType.toUpperCase(), { x: valueX, y: startY, size: fontSize, font: boldFont })
        
        // OBS: Linhas 2 (Source) e 3 (Target) são fixas no template. Não imprimimos nada nelas.

        // 4. Number of Pages (Linha 4 - offset de 3 espaços)
        // Conta apenas as páginas traduzidas (actualTranslationPageCount)
        const pageCountStr = String(translatedPages).padStart(2, '0')
        capaPage.drawText(pageCountStr, { x: valueX, y: startY - (spacing * 3), size: fontSize, font })

        // 5. Order Number (Linha 5)
        const orderDisplay = `Order #${orderId + 1000}-USA`
        capaPage.drawText(orderDisplay, { x: valueX, y: startY - (spacing * 4), size: fontSize, font: boldFont })

        // --- DATA NO RODAPÉ (Padrão USA: MM/DD/YYYY) ---
        // Coordenada Y baixada para alinhar com o campo "Dated:"
        capaPage.drawText(dateStr, { x: 75, y: 142, size: 10, font: boldFont })

        return capaPage
    } catch (err) {
        console.error(`[DeliveryKit] Erro ao carregar capa ${fileName}:`, err)
        return null
    }
}

// --- Ação Principal de Geração ---
export async function generateDeliveryKit(orderId: number, documentId: number, options?: { preview?: boolean }) {
    const isPreview = options?.preview ?? false
    try {
        const doc = await prisma.document.findUnique({
            where: { id: documentId },
            include: { order: true },
        })

        if (!doc) throw new Error('Documento não encontrado.')

        const finalPdf = await PDFDocument.create()
        const publicDir = path.join(process.cwd(), 'public')
        
        // 1. Páginas de Tradução (Papel Timbrado)
        const timbradoBytes = await fs.readFile(path.join(publicDir, 'letterhead promobi.pdf'))
        const timbradoPdf = await PDFDocument.load(timbradoBytes)
        const fontNormal = await finalPdf.embedFont(StandardFonts.Helvetica)

        const translationPdf = await PDFDocument.create()
        let actualTranslationPageCount = 0

        if (doc.translatedText) {
            const plainText = sanitizeForWinAnsi(stripHtml(doc.translatedText))
            const [bgPage] = await translationPdf.copyPages(timbradoPdf, [0])
            translationPdf.addPage(bgPage)
            
            // Incrementa contagem de páginas traduzidas
            actualTranslationPageCount = 1
            
            bgPage.drawText(plainText, { 
                x: 72, 
                y: 650, 
                size: 11, 
                font: fontNormal, 
                lineHeight: 15 
            })
        }

        // 2. Páginas do Documento Original
        if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
            const originalRes = await fetch(doc.originalFileUrl)
            const originalBuf = Buffer.from(await originalRes.arrayBuffer())
            const originalPdf = await PDFDocument.load(originalBuf, { ignoreEncryption: true })
            const copied = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices())
            copied.forEach(p => finalPdf.addPage(p))
        }

        // 3. Formatação da Data USA (MM/DD/YYYY)
        const now = new Date();
        const mm = (now.getMonth() + 1).toString().padStart(2, '0');
        const dd = now.getDate().toString().padStart(2, '0');
        const yyyy = now.getFullYear();
        const dateStr = `${mm}/${dd}/${yyyy}`;
        
        // 4. Geração e Inserção da Capa (Posição 0)
        const docType = doc.exactNameOnDoc || doc.docType || 'Official Document'
        const capaPage = await _loadCertificationCover(finalPdf, {
            docType,
            orderId,
            translatedPages: actualTranslationPageCount,
            dateStr,
            sourceLanguage: doc.sourceLanguage || doc.order.sourceLanguage
        })

        if (capaPage) finalPdf.insertPage(0, capaPage)

        // 5. Acoplamento das Páginas de Tradução
        const transPages = await finalPdf.copyPages(translationPdf, translationPdf.getPageIndices())
        transPages.forEach((p, i) => finalPdf.insertPage(1 + i, p))

        // 6. Finalização e Upload
        const pdfBytes = await finalPdf.save()
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
        const safeName = `kit_${orderId}_${documentId}_${Date.now()}.pdf`
        const pathPrefix = isPreview ? 'orders/previews/' : 'orders/completed/'
        
        await supabase.storage.from('documents').upload(pathPrefix + safeName, pdfBytes, { contentType: 'application/pdf' })
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