'use server'

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'
import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'

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

function sanitizeForWinAnsi(text: string): string {
    if (!text) return ''
    return text
        .replace(/→/g, '->')
        .replace(/←/g, '<-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/…/g, '...')
        .replace(/•/g, '-')
        .replace(/[^\x00-\xFF]/g, '')
}

function isImageUrl(url: string): boolean {
    const lower = url.toLowerCase().split('?')[0]
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')
}

// ── Template-based cover page ─────────────────────────────────────────────────

async function _buildCoverPageInDoc(
    targetDoc: PDFDocument,
    params: { docType: string; orderId: number; totalPages: number; dateStr: string; sourceLanguage?: string }
) {
    const { docType, orderId, totalPages, dateStr, sourceLanguage } = params
    const PAGE_WIDTH = 612
    const PAGE_HEIGHT = 792
    const MARGIN = 70

    // 1. Add Blank Page (Pure White)
    const page = targetDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

    const font = await targetDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await targetDoc.embedFont(StandardFonts.HelveticaBold)
    const black = rgb(0, 0, 0)
    const grey = rgb(0.3, 0.3, 0.3)

    // 2. Load and Draw Logo (Scaled -30%)
    const publicDir = path.join(process.cwd(), 'public')
    const logoBytes = await fs.readFile(path.join(publicDir, 'logo-promobidocs.png'))
    const logoImg = await targetDoc.embedPng(logoBytes)
    const originalWidth = 140
    const originalHeight = (logoImg.height / logoImg.width) * originalWidth
    const scaledWidth = originalWidth * 0.7 // -30%
    const scaledHeight = originalHeight * 0.7

    page.drawImage(logoImg, {
        x: MARGIN,
        y: PAGE_HEIGHT - scaledHeight - 40,
        width: scaledWidth,
        height: scaledHeight,
    })

    // 3. Title
    page.drawText('CERTIFICATION OF TRANSLATION ACCURACY', {
        x: MARGIN,
        y: PAGE_HEIGHT - 160,
        size: 16,
        font: boldFont,
        color: black,
    })

    // 4. Metadata Grid (Strict Alignment)
    const labelX = 70
    const valueX = 220
    let currentY = PAGE_HEIGHT - 210
    const lineSpacing = 22

    const drawGridLine = (label: string, value: string) => {
        page.drawText(label, { x: labelX, y: currentY, size: 10, font: boldFont })
        page.drawText(value, { x: valueX, y: currentY, size: 10, font: font })
        currentY -= lineSpacing
    }

    const sourceLangStr = sourceLanguage === 'ES' ? 'Spanish' : 'Portuguese'
    drawGridLine('Document Type:', docType.toUpperCase())
    drawGridLine('Source Language:', sourceLangStr)
    drawGridLine('Target Language:', 'English')
    drawGridLine('Number of pages:', String(totalPages).padStart(2, '0'))
    drawGridLine('Order #:', String(orderId + 1000).padStart(4, '0') + '-USA')

    // 5. Certification Body Text
    currentY -= 20
    const certText = `I, the undersigned, hereby certify that I am fluent in English and the source language (${sourceLangStr}) of the attached documents, and that the attached translation is a true, accurate, and complete translation of the original document attached hereto.`

    const wrapWidth = PAGE_WIDTH - (MARGIN * 2)
    const lines = wrapLines(certText, font, 11, wrapWidth)
    for (const line of lines) {
        page.drawText(line, { x: MARGIN, y: currentY, size: 11, font, lineHeight: 16 })
        currentY -= 18
    }

    // 6. Signature & ATA Logo
    currentY -= 50
    const signatureBytes = await fs.readFile(path.join(publicDir, 'assinatura-isabele.png.jpg'))
    const signatureImg = await targetDoc.embedJpg(signatureBytes)
    page.drawImage(signatureImg, {
        x: MARGIN,
        y: currentY,
        width: 150,
        height: 45,
    })

    const ataLogoBytes = await fs.readFile(path.join(publicDir, 'logo-ata.png'))
    const ataImg = await targetDoc.embedPng(ataLogoBytes)
    page.drawImage(ataImg, {
        x: MARGIN + 180,
        y: currentY + 5,
        width: 40,
        height: 40,
    })

    currentY -= 15
    page.drawText('___________________________________', { x: MARGIN, y: currentY, size: 12, font })
    currentY -= 20
    page.drawText('Promobi Certified Translator', { x: MARGIN, y: currentY, size: 11, font: boldFont })
    currentY -= 15
    page.drawText(`Dated: ${dateStr}`, { x: MARGIN, y: currentY, size: 10, font })

    // 7. Consolidated Footer
    const footerText = '13558 Village Park Dr, Orlando/FL, 32837 | +1 321 324-5851 | translator@promobidocs.com | www.promobidocs.com'
    const footerW = font.widthOfTextAtSize(footerText, 8.5)
    page.drawText(footerText, {
        x: (PAGE_WIDTH - footerW) / 2,
        y: 35,
        size: 8.5,
        font,
        color: grey
    })

    return page
}

// ── Main server action ────────────────────────────────────────────────────────

export async function generateDeliveryKit(orderId: number, documentId: number, options?: { preview?: boolean; translatedPageCount?: number }) {
    const isPreview = options?.preview ?? false

    console.log(`[generateDeliveryKit] 🔍 Iniciando geração: OrderID=${orderId}, DocID=${documentId}, Preview=${isPreview}`)

    try {
        let doc: any = null
        let retries = 0
        const maxRetries = 3

        while (retries < maxRetries) {
            try {
                doc = await prisma.document.findUnique({
                    where: { id: documentId },
                    include: { order: true },
                })

                if (doc) {
                    console.log(`[generateDeliveryKit] ✅ Documento encontrado: ID=${doc.id}, OrderID no Doc=${doc.orderId}`)
                    break
                } else {
                    console.warn(`[generateDeliveryKit] ⚠️ Documento ${documentId} não encontrado na tentativa ${retries + 1}`)
                }
            } catch (err: any) {
                console.warn(`[generateDeliveryKit] ❌ Erro na tentativa ${retries + 1}:`, err.message)
            }

            retries++
            if (retries < maxRetries) {
                console.log(`[generateDeliveryKit] ⏳ Aguardando 500ms para retry...`)
                await new Promise(resolve => setTimeout(resolve, 500))
            }
        }

        if (!doc) {
            console.error(`[generateDeliveryKit] 🛑 Falha final: Documento ${documentId} não existe no banco.`)
            return { success: false, error: 'Documento não encontrado no banco de dados.' }
        }

        if (doc.orderId !== orderId) {
            console.error(`[generateDeliveryKit] 🛑 Conflito de ID: Doc.orderId(${doc.orderId}) !== orderId(${orderId})`)
            return { success: false, error: 'Documento não pertence a este pedido.' }
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

        // LOAD TIMBRADO
        const publicDir = path.join(process.cwd(), 'public')
        const timbradoBytes = await fs.readFile(path.join(publicDir, 'letterhead promobi.pdf'))
        const timbradoPdf = await PDFDocument.load(timbradoBytes, { ignoreEncryption: true })

        const finalPdf = await PDFDocument.create()
        const fontNormal = await finalPdf.embedFont(StandardFonts.Helvetica)

        const PAGE_WIDTH = 612
        const MARGIN_LEFT = 72
        const MARGIN_RIGHT = 72
        const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
        const TEXT_TOP = 650
        const TEXT_BOTTOM = 90
        const FONT_SIZE = 12
        const LINE_HEIGHT = FONT_SIZE * 1.5
        const FOOTER_SIZE = 8

        // Name used on certificate cover: operator-edited field takes priority
        const docName = doc.exactNameOnDoc || doc.docType
        const docType = doc.exactNameOnDoc || doc.docType || 'Official Document'

        // ── 4. TRANSLATION PAGES (DYNAMICALY COUNTED) ─────────────────────────────
        const translationPdf = await PDFDocument.create()
        let actualTranslationPageCount = 0

        // VERIFICA SE HÁ TRADUÇÃO EXTERNA (UPLOAD MANUAL)
        // @ts-ignore - externalTranslationUrl exists in DB; Prisma client cache may be stale
        if (doc.externalTranslationUrl) {
            // @ts-ignore
            const extRes = await fetch(doc.externalTranslationUrl)
            if (extRes.ok) {
                const extBuf = Buffer.from(await extRes.arrayBuffer())
                const extPdf = await PDFDocument.load(extBuf, { ignoreEncryption: true })

                // Embed pages so we can draw them ON TOP of the timbrado background
                const embeddedPages = await translationPdf.embedPages(extPdf.getPages())

                for (const embeddedPage of embeddedPages) {
                    actualTranslationPageCount++

                    // Lay down the branded letterhead as the base layer
                    const [bgPage] = await translationPdf.copyPages(timbradoPdf, [0])
                    translationPdf.addPage(bgPage)

                    // Scale 1.0 — external PDFs have their own margins, no reduction needed
                    const scaledWidth = embeddedPage.width
                    const scaledHeight = embeddedPage.height

                    bgPage.drawPage(embeddedPage, {
                        x: (PAGE_WIDTH - scaledWidth) / 2,
                        y: (792 - scaledHeight) / 2,
                        width: scaledWidth,
                        height: scaledHeight,
                    })
                }
            }
        }
        // FLUXO NORMAL DA IA (CAIXINHA DE TEXTO)
        else if (doc.translatedText) {
            const plainText = sanitizeForWinAnsi(stripHtml(doc.translatedText))
            const allLines = wrapLines(plainText, fontNormal, FONT_SIZE, CONTENT_WIDTH)
            const linesPerPage = Math.floor((TEXT_TOP - TEXT_BOTTOM) / LINE_HEIGHT)
            const totalTranslationPages = Math.max(1, Math.ceil(allLines.length / linesPerPage))

            for (let pageIndex = 0; pageIndex < totalTranslationPages; pageIndex++) {
                actualTranslationPageCount++
                const pageLines = allLines.slice(pageIndex * linesPerPage, (pageIndex + 1) * linesPerPage)
                const [bgPage] = await translationPdf.copyPages(timbradoPdf, [0])
                translationPdf.addPage(bgPage)

                let currentY = TEXT_TOP
                for (const line of pageLines) {
                    if (line) bgPage.drawText(line, { x: MARGIN_LEFT, y: currentY, size: FONT_SIZE, font: fontNormal, color: rgb(0, 0, 0) })
                    currentY -= LINE_HEIGHT
                }

                const footerText = `Translation of ${sanitizeForWinAnsi(docName)}  --  Page ${pageIndex + 1} of ${totalTranslationPages}`
                const footerW = fontNormal.widthOfTextAtSize(footerText, FOOTER_SIZE)
                bgPage.drawText(footerText, { x: (PAGE_WIDTH - footerW) / 2, y: TEXT_BOTTOM - 20, size: FOOTER_SIZE, font: fontNormal, color: rgb(0.5, 0.5, 0.5) })
            }
        } else {
            const [bgPage] = await translationPdf.copyPages(timbradoPdf, [0])
            translationPdf.addPage(bgPage)
            actualTranslationPageCount = 1
        }

        // ── 5. ORIGINAL DOCUMENT PAGES ────────────────────────────────────────────
        // We add them directly to finalPdf AFTER translation pages
        if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
            try {
                const originalRes = await fetch(doc.originalFileUrl)
                if (originalRes.ok) {
                    const originalContentType = originalRes.headers.get('content-type') || ''
                    if (originalContentType.includes('xml') || originalContentType.includes('html')) {
                        console.warn(`[generateDeliveryKit] ⚠️ Aviso: Arquivo original retornou conteúdo inválido (${originalContentType}) - possível 404/Inacessível. Fallback ativado, seguindo sem ele.`)
                    } else {
                        const originalBuf = Buffer.from(await originalRes.arrayBuffer())

                        // Per-page rotation map saved by the operator in the Workbench
                        // @ts-ignore - pageRotations exists in DB; Prisma client cache may be stale
                        const rotationsMap = (doc.pageRotations as Record<string, number> | null) ?? {}

                        if (isImageUrl(doc.originalFileUrl)) {
                            // Images are always 1 page (index 0)
                            let image;
                            try {
                                if (doc.originalFileUrl.toLowerCase().includes('.png')) {
                                    image = await finalPdf.embedPng(originalBuf)
                                } else {
                                    image = await finalPdf.embedJpg(originalBuf)
                                }
                                // Always create portrait page; landscape images scale to fit within it
                                const scale = Math.min(PAGE_WIDTH / image.width, 792 / image.height)
                                const scaledWidth = image.width * scale
                                const scaledHeight = image.height * scale
                                const page = finalPdf.addPage([PAGE_WIDTH, 792])
                                const imageRotation = rotationsMap['0'] ?? 0
                                if (imageRotation !== 0) page.setRotation(degrees(imageRotation))
                                page.drawImage(image, {
                                    x: (PAGE_WIDTH - scaledWidth) / 2,
                                    y: (792 - scaledHeight) / 2,
                                    width: scaledWidth,
                                    height: scaledHeight,
                                })
                            } catch (imgErr) {
                                console.warn('[generateDeliveryKit] ⚠️ Aviso: Erro ao injetar Imagem Original. Fallback ativado.', imgErr)
                            }
                        } else {
                            try {
                                const originalPdf = await PDFDocument.load(originalBuf, { ignoreEncryption: true })
                                const copied = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices())
                                copied.forEach((p, i) => {
                                    // Per-page user rotation takes priority; fall back to the PDF's own metadata
                                    const savedRotation = rotationsMap[i.toString()] ?? 0
                                    const rotation = savedRotation !== 0 ? savedRotation : p.getRotation().angle
                                    p.setRotation(degrees(rotation))
                                    finalPdf.addPage(p)
                                })
                            } catch (pdfErr) {
                                console.warn('[generateDeliveryKit] ⚠️ Aviso: Erro ao fazer o parse do PDF Original. Fallback ativado.', pdfErr)
                            }
                        }
                    }
                } else {
                    console.warn(`[generateDeliveryKit] ⚠️ Aviso: Arquivo original inacessível (HTTP ${originalRes.status}). Kit será completado sem ele.`)
                }
            } catch (err) {
                console.error('[generateDeliveryKit] ⚠️ Falha na busca pelo documento original (fallback ativo):', err)
            }
        }

        // ── 6. BUILD AND INSERT COVER PAGE ────────────────────────────────────────
        // Use the actual count from our translationPdf
        const finalPageCount = translationPdf.getPageCount()
        const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        const capaPage = await _buildCoverPageInDoc(finalPdf, { docType, orderId, totalPages: finalPageCount, dateStr, sourceLanguage: doc.order?.sourceLanguage ?? undefined })

        // Final Document Assembly: Cover -> Translation -> Original
        finalPdf.insertPage(0, capaPage)

        // Copy translation pages into the final document
        const translationPages = await finalPdf.copyPages(translationPdf, translationPdf.getPageIndices())
        translationPages.forEach((p, i) => {
            // Insert after cover (index 0), so starting at index 1 + i
            finalPdf.insertPage(1 + i, p)
        })

        // ── 7. SAVE AND UPLOAD ────────────────────────────────────────────────────
        const pdfBytes = await finalPdf.save()
        const supabase = createClient(supabaseUrl, supabaseKey)
        const safeName = `delivery_kit_order${orderId}_doc${documentId}_${Date.now()}.pdf`
        const storagePath = isPreview ? `orders/previews/${safeName}` : `orders/completed/${safeName}`

        const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false })
        if (uploadError) throw new Error(`Supabase Upload: ${uploadError.message}`)

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storagePath)
        const deliveryUrl = urlData.publicUrl

        // ── 8. UPDATE DATABASE ────────────────────────────────────────────────────
        if (!isPreview) {
            await prisma.document.update({
                where: { id: documentId },
                data: { delivery_pdf_url: deliveryUrl, translation_status: 'approved' },
            })
            await prisma.order.update({ where: { id: orderId }, data: { deliveryUrl } })
        }

        return { success: true, deliveryUrl, isPreview }
    } catch (error: any) {
        return { success: false, error: error.message || 'Erro ao gerar o Delivery Kit.' }
    }
}