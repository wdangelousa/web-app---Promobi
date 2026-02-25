'use server'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'
import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'
import { sign as jwtSign } from 'jsonwebtoken'

// ── iLovePDF credentials ──────────────────────────────────────────────────────

const ILOVEPDF_PUBLIC = 'project_public_b4990cf84ccd39069f02695ac36ed91a_0-GX3ce148715ca29b5801d8638aa65ec6599';
const ILOVEPDF_SECRET = 'secret_key_79f694c65dcfab8bd33ec4f7e4e14321_krtE5711f9df92fb18748a59f7ab14a1bc509';

/**
 * Gera um JWT assinado com a secret_key e o troca por um token de tarefa válido.
 * Corrige o erro 401 "Signature verification failed" no servidor de upload.
 */
async function getILovePdfToken(): Promise<string> {
    const selfJwt = jwtSign(
        { iss: ILOVEPDF_PUBLIC },
        ILOVEPDF_SECRET,
        { algorithm: 'HS256' }
    );

    const res = await fetch('https://api.ilovepdf.com/v1/auth', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${selfJwt}`,
        },
        body: JSON.stringify({ public_key: ILOVEPDF_PUBLIC }),
    });

    if (!res.ok) {
        throw new Error(`iLovePDF auth failed (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    return data.token as string;
}

// ── Text utilities ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

function wrapLines(
    text: string,
    font: Awaited<ReturnType<PDFDocument['embedFont']>>,
    fontSize: number,
    maxWidth: number
): string[] {
    const lines: string[] = []
    const paragraphs = text.split('\n')

    for (const para of paragraphs) {
        if (!para.trim()) {
            lines.push('')
            continue
        }
        const words = para.split(/\s+/)
        let current = words[0] || ''

        for (let i = 1; i < words.length; i++) {
            const test = current + ' ' + words[i]
            if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
                current = test
            } else {
                lines.push(current)
                current = words[i]
            }
        }
        if (current) lines.push(current)
    }

    return lines
}

function isImageUrl(url: string): boolean {
    const lower = url.toLowerCase().split('?')[0]
    return (
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.webp')
    )
}

// ── Convert image to PDF via iLovePDF ─────────────────────────────────────────

async function convertImageToPdfBuffer(
    imageBuffer: Buffer,
    filename: string
): Promise<Buffer> {
    const token = await getILovePdfToken();

    // 1. Iniciar tarefa
    let res = await fetch('https://api.ilovepdf.com/v1/start/imagepdf', {
        headers: { Authorization: `Bearer ${token}` },
    })
    let data = await res.json()
    if (!res.ok) throw new Error(`iLovePDF start: ${JSON.stringify(data)}`)
    const server = data.server as string
    const task = data.task as string

    // 2. Upload da imagem
    const form = new FormData()
    form.append('task', task)
    const mime = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
    form.append('file', new Blob([new Uint8Array(imageBuffer)], { type: mime }), filename)

    res = await fetch(`https://${server}/v1/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    })
    data = await res.json()
    if (!res.ok) throw new Error(`iLovePDF upload: ${JSON.stringify(data)}`)
    const serverFilename = data.server_filename as string

    // 3. Processar conversão
    res = await fetch(`https://${server}/v1/process`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            task,
            tool: 'imagepdf',
            files: [{ server_filename: serverFilename, filename }],
        }),
    })
    if (!res.ok) throw new Error('iLovePDF process failed')

    // 4. Download
    res = await fetch(`https://${server}/v1/download/${task}`, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('iLovePDF download failed')

    return Buffer.from(await res.arrayBuffer())
}

// ── Template-based cover page ─────────────────────────────────────────────────

async function _buildCoverPageInDoc(
    targetDoc: PDFDocument,
    params: {
        docType: string
        orderId: number
        totalPages: number
        dateStr: string
    }
) {
    const { docType, orderId, totalPages, dateStr } = params

    const publicDir = path.join(process.cwd(), 'public')
    const capaBytes = await fs.readFile(path.join(publicDir, 'capa_certificacao_modelo.pdf'))
    const capaSrc = await PDFDocument.load(capaBytes, { ignoreEncryption: true })

    const [capaPage] = await targetDoc.copyPages(capaSrc, [0])
    const fontHelv = await targetDoc.embedFont(StandardFonts.Helvetica)

    // ── Layout Constants ──────────────────────────────────────────────────────
    // Coordenadas em pontos (pt), origem no canto inferior esquerdo (pdf-lib).
    // Template limpo (sem placeholders) — apenas drawText necessário.
    // Ajuste aqui se o template for substituído.

    // X: onde os valores dinâmicos são inseridos (alinhados à direita dos rótulos)
    const X_VALUE      = 178   // Document Type, Number of Pages, Order #
    const X_DATE_START = 66    // "Dated: …" inclui o rótulo, começa na margem esquerda

    // Y: baseline de cada campo (medido do rodapé da página — convenção pdf-lib)
    const Y_DOC_TYPE = 618     // Tipo do documento
    const Y_PAGES    = 570     // "Number of pages:"
    const Y_ORDER    = 554     // "Order #:"
    const Y_DATE     = 119     // Data no rodapé esquerdo

    const FONT_SIZE = 11
    const black = rgb(0, 0, 0)

    // ── 1. Document Type ──────────────────────────────────────────────────────
    capaPage.drawText(docType.toUpperCase(), {
        x: X_VALUE, y: Y_DOC_TYPE, size: FONT_SIZE, font: fontHelv, color: black,
    })

    // ── 2. Number of Pages ────────────────────────────────────────────────────
    capaPage.drawText(totalPages.toString().padStart(2, '0'), {
        x: X_VALUE, y: Y_PAGES, size: FONT_SIZE, font: fontHelv, color: black,
    })

    // ── 3. Order # ────────────────────────────────────────────────────────────
    capaPage.drawText(`${orderId.toString().padStart(4, '0')}-USA`, {
        x: X_VALUE, y: Y_ORDER, size: FONT_SIZE, font: fontHelv, color: black,
    })

    // ── 4. Date (rodapé esquerdo) ─────────────────────────────────────────────
    capaPage.drawText(`Dated: ${dateStr}`, {
        x: X_DATE_START, y: Y_DATE, size: FONT_SIZE, font: fontHelv, color: black,
    })

    return capaPage
}

// ── Main server action ────────────────────────────────────────────────────────

export async function generateDeliveryKit(
    orderId: number,
    documentId: number,
    options?: { preview?: boolean }
) {
    const isPreview = options?.preview ?? false
    return _generateDeliveryKit(orderId, documentId, isPreview)
}

async function _generateDeliveryKit(orderId: number, documentId: number, isPreview: boolean) {
    try {
        const doc = await prisma.document.findUnique({
            where: { id: documentId },
            include: { order: true },
        })

        if (!doc || doc.orderId !== orderId) {
            return { success: false, error: 'Documento não encontrado neste pedido.' }
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !supabaseKey) {
            return { success: false, error: 'Supabase Storage não configurado.' }
        }

        // ── 2. LOAD TEMPLATE PDFs ─────────────────────────────────────────────────
        const publicDir = path.join(process.cwd(), 'public')
        const timbradoBytes = await fs.readFile(path.join(publicDir, 'timbrado_promobi.pdf'))
        const timbradoPdf = await PDFDocument.load(timbradoBytes, { ignoreEncryption: true })

        // ── 3. CREATE FINAL PDF AND EMBED FONTS ───────────────────────────────────
        const finalPdf = await PDFDocument.create()
        const fontNormal = await finalPdf.embedFont(StandardFonts.Helvetica)

        const PAGE_WIDTH = 612
        const MARGIN_LEFT = 72
        const MARGIN_RIGHT = 72
        const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
        const TEXT_TOP = 650
        const TEXT_BOTTOM = 90
        const FONT_SIZE = 11
        const LINE_HEIGHT = FONT_SIZE * 1.5
        const FOOTER_SIZE = 8

        const docName = doc.exactNameOnDoc || doc.docType
        const docType = doc.docType || 'Certified Translation'

        // ── 4. TRANSLATION PAGES (on timbrado background) ────────────────────────
        let translationPageCount = 0

        if (doc.translatedText) {
            const plainText = stripHtml(doc.translatedText)
            const allLines = wrapLines(plainText, fontNormal, FONT_SIZE, CONTENT_WIDTH)

            const linesPerPage = Math.floor((TEXT_TOP - TEXT_BOTTOM) / LINE_HEIGHT)
            const totalTranslationPages = Math.max(1, Math.ceil(allLines.length / linesPerPage))

            for (let pageIndex = 0; pageIndex < totalTranslationPages; pageIndex++) {
                translationPageCount++
                const pageLines = allLines.slice(
                    pageIndex * linesPerPage,
                    (pageIndex + 1) * linesPerPage
                )

                const [bgPage] = await finalPdf.copyPages(timbradoPdf, [0])
                finalPdf.addPage(bgPage)

                let currentY = TEXT_TOP
                for (const line of pageLines) {
                    if (line) {
                        bgPage.drawText(line, {
                            x: MARGIN_LEFT,
                            y: currentY,
                            size: FONT_SIZE,
                            font: fontNormal,
                            color: rgb(0, 0, 0),
                        })
                    }
                    currentY -= LINE_HEIGHT
                }

                const footerText = `Translation of ${docName}  \u2014  Page ${pageIndex + 1} of ${totalTranslationPages}`
                const footerW = fontNormal.widthOfTextAtSize(footerText, FOOTER_SIZE)
                bgPage.drawLine({
                    start: { x: MARGIN_LEFT, y: TEXT_BOTTOM - 6 },
                    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: TEXT_BOTTOM - 6 },
                    thickness: 0.4,
                    color: rgb(0.75, 0.75, 0.75),
                })
                bgPage.drawText(footerText, {
                    x: (PAGE_WIDTH - footerW) / 2,
                    y: TEXT_BOTTOM - 20,
                    size: FOOTER_SIZE,
                    font: fontNormal,
                    color: rgb(0.5, 0.5, 0.5),
                })
            }
        } else {
            const [bgPage] = await finalPdf.copyPages(timbradoPdf, [0])
            finalPdf.addPage(bgPage)
            const msg = 'Translation text not yet available.'
            const msgW = fontNormal.widthOfTextAtSize(msg, FONT_SIZE)
            bgPage.drawText(msg, {
                x: (PAGE_WIDTH - msgW) / 2,
                y: TEXT_TOP,
                size: FONT_SIZE,
                font: fontNormal,
                color: rgb(0.5, 0.5, 0.5),
            })
            translationPageCount = 1
        }

        // ── 5. ORIGINAL DOCUMENT PAGES ────────────────────────────────────────────
        if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
            try {
                const originalRes = await fetch(doc.originalFileUrl)
                if (originalRes.ok) {
                    const originalBuf = Buffer.from(await originalRes.arrayBuffer())

                    if (isImageUrl(doc.originalFileUrl)) {
                        const filename =
                            doc.originalFileUrl.split('/').pop()?.split('?')[0] || 'document.jpg'
                        const pdfBuf = await convertImageToPdfBuffer(originalBuf, filename)
                        const originalPdf = await PDFDocument.load(pdfBuf, { ignoreEncryption: true })
                        const copied = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices())
                        copied.forEach((p) => finalPdf.addPage(p))
                    } else {
                        const originalPdf = await PDFDocument.load(originalBuf, { ignoreEncryption: true })
                        const copied = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices())
                        copied.forEach((p) => finalPdf.addPage(p))
                    }
                } else {
                    console.warn(`[generateDeliveryKit] Could not fetch original: ${doc.originalFileUrl}`)
                }
            } catch (err) {
                console.error('[generateDeliveryKit] Error appending original document:', err)
            }
        }

        // ── 6. BUILD AND INSERT COVER PAGE ────────────────────────────────────────
        const contentPageCount = finalPdf.getPageCount()
        const totalPdfPages = contentPageCount + 1

        const dateStr = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })

        const capaPage = await _buildCoverPageInDoc(finalPdf, {
            docType,
            orderId,
            totalPages: totalPdfPages,
            dateStr,
        })

        finalPdf.insertPage(0, capaPage)

        // ── 7. SAVE AND UPLOAD ────────────────────────────────────────────────────
        const pdfBytes = await finalPdf.save()

        const supabase = createClient(supabaseUrl, supabaseKey)
        const safeName = `delivery_kit_order${orderId}_doc${documentId}_${Date.now()}.pdf`
        const storagePath = isPreview
            ? `orders/previews/${safeName}`
            : `orders/completed/${safeName}`

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, pdfBytes, {
                contentType: 'application/pdf',
                upsert: false,
            })

        if (uploadError) {
            throw new Error(`Supabase Upload: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storagePath)
        const deliveryUrl = urlData.publicUrl

        // ── 8. UPDATE DATABASE ────────────────────────────────────────────────────
        if (!isPreview) {
            await prisma.document.update({
                where: { id: documentId },
                data: {
                    delivery_pdf_url: deliveryUrl,
                    translation_status: 'approved',
                },
            })

            await prisma.order.update({
                where: { id: orderId },
                data: { deliveryUrl },
            })
        }

        console.log(
            `[generateDeliveryKit] ✅ Doc #${documentId} (${isPreview ? 'PREVIEW' : 'OFFICIAL'}) → ${deliveryUrl}`
        )
        return { success: true, deliveryUrl, isPreview }
    } catch (error: any) {
        console.error('[generateDeliveryKit] Error:', error)
        return { success: false, error: error.message || 'Erro ao gerar o Delivery Kit.' }
    }
}
