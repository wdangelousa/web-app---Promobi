'use server'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'
import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'

function stripHtml(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
}

function sanitizeForWinAnsi(text: string): string {
    if (!text) return '';
    // Normalize to NFD (decomposes accented chars), then remove combining diacritical marks
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x00-\xFF]/g, '');
}

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

    // Forçando o caminho absoluto para a raiz do projeto
    const publicDir = path.resolve(process.cwd(), 'public')

    const fileName = sourceLanguage === 'ES'
        ? 'capa certificacao es-en.pdf'
        : 'capa certificacao pt-en.pdf'

    const capaPath = path.join(publicDir, fileName)

    console.log('--- DEBUG DA CAPA ---');
    console.log('[DeliveryKit] Diretorio publico resolvido:', publicDir);
    console.log('[DeliveryKit] Caminho completo da capa:', capaPath);

    try {
        const fileExists = await fs.access(capaPath).then(() => true).catch(() => false);

        if (!fileExists) {
            console.error(`[DeliveryKit] ARQUIVO NÃO ENCONTRADO: ${capaPath}`);
            const files = await fs.readdir(publicDir).catch(() => []);
            console.log('[DeliveryKit] Arquivos reais dentro da pasta public:', files);
            return null;
        }

        const capaBytes = await fs.readFile(capaPath)
        const templatePdf = await PDFDocument.load(capaBytes)
        const boldFont = await templatePdf.embedFont(StandardFonts.HelveticaBold)

        const page = templatePdf.getPages()[0]
        const fontSize = 11;
        const fontColor = rgb(0, 0, 0);

        const safeDocType = sanitizeForWinAnsi(docType).toUpperCase();
        page.drawText(safeDocType, { x: 153, y: 660, size: fontSize, font: boldFont, color: fontColor })
        page.drawText(String(translatedPages || 1).padStart(2, '0'), { x: 157, y: 602, size: fontSize, font: boldFont, color: fontColor })
        page.drawText(`${orderId}-USA`, { x: 105, y: 583, size: fontSize, font: boldFont, color: fontColor })
        page.drawText(dateStr, { x: 77, y: 108, size: fontSize, font: boldFont, color: fontColor })

        const [capaPage] = await targetDoc.copyPages(templatePdf, [0])
        console.log('[DeliveryKit] Capa gerada com sucesso!');
        return capaPage
    } catch (err) {
        console.error(`[DeliveryKit] Erro interno ao processar capa ${fileName}:`, err)
        return null
    }
}

export async function generateDeliveryKit(
    orderId: number,
    documentId: number,
    options?: { preview?: boolean; coverLanguage?: string }
) {
    const isPreview = options?.preview ?? false
    try {
        const doc = await prisma.document.findUnique({
            where: { id: documentId },
            include: { order: true },
        })

        if (!doc) throw new Error('Documento não encontrado.')

        if (options?.coverLanguage) {
            await prisma.document.update({
                where: { id: documentId },
                data: { sourceLanguage: options.coverLanguage }
            });
            doc.sourceLanguage = options.coverLanguage;
        }

        const finalPdf = await PDFDocument.create()
        const translationPdf = await PDFDocument.create()
        let actualTranslationPageCount = 0

        const publicDir = path.resolve(process.cwd(), 'public')
        const timbradoBytes = await fs.readFile(path.join(publicDir, 'letterhead promobi.png'))
        const letterheadImage = await translationPdf.embedPng(timbradoBytes)

        if (doc.externalTranslationUrl) {
            const extRes = await fetch(doc.externalTranslationUrl)
            const extBuf = Buffer.from(await extRes.arrayBuffer())
            const extPdf = await PDFDocument.load(extBuf, { ignoreEncryption: true })
            const copied = await translationPdf.copyPages(extPdf, extPdf.getPageIndices())

            copied.forEach(p => {
                translationPdf.addPage(p)
                p.drawImage(letterheadImage, {
                    x: 0,
                    y: 0,
                    width: p.getWidth(),
                    height: p.getHeight(),
                })
            })
            actualTranslationPageCount = copied.length
        }
        else if (doc.translatedText && !doc.translatedText.startsWith('{"sections"') && !doc.translatedText.includes('"blocks"')) {
            const fontNormal = await finalPdf.embedFont(StandardFonts.Helvetica)
            const plainText = sanitizeForWinAnsi(stripHtml(doc.translatedText))

            const page = translationPdf.addPage([612, 792])
            page.drawImage(letterheadImage, {
                x: 0, y: 0, width: page.getWidth(), height: page.getHeight(),
            })
            actualTranslationPageCount = 1
            page.drawText(plainText, { x: 72, y: 650, size: 11, font: fontNormal, lineHeight: 15 })
        }

        const now = new Date();
        const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;

        const capaPage = await _loadCertificationCover(finalPdf, {
            docType: doc.exactNameOnDoc || doc.docType || 'Official Document',
            orderId,
            translatedPages: actualTranslationPageCount || 1,
            dateStr,
            sourceLanguage: options?.coverLanguage || doc.sourceLanguage || doc.order.sourceLanguage
        })

        if (capaPage) finalPdf.addPage(capaPage)

        if (translationPdf.getPageCount() > 0) {
            const transPages = await finalPdf.copyPages(translationPdf, translationPdf.getPageIndices())
            transPages.forEach(p => finalPdf.addPage(p))
        }

        if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
            const originalRes = await fetch(doc.originalFileUrl)
            const originalBuf = Buffer.from(await originalRes.arrayBuffer())
            const originalPdf = await PDFDocument.load(originalBuf, { ignoreEncryption: true })
            const copiedOrig = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices())
            copiedOrig.forEach(p => finalPdf.addPage(p))
        }

        const pdfBytes = await finalPdf.save()

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('ERRO: Chaves do Supabase não encontradas.');
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const safeName = `kit_${orderId}_${documentId}_${Date.now()}.pdf`
        const pathPrefix = isPreview ? 'orders/previews/' : 'orders/completed/'

        await supabase.storage.from('documents').upload(pathPrefix + safeName, Buffer.from(pdfBytes), {
            contentType: 'application/pdf', duplex: 'half'
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
        console.error('[DeliveryKit] Erro:', error)
        return { success: false, error: error.message }
    }
}