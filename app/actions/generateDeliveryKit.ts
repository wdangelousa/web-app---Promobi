'use server'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
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
  const publicKey =
    'project_public_b4990cf84ccd39069f02695ac36ed91a_0-GX3ce148715ca29b5801d8638aa65ec6599'

  let res = await fetch('https://api.ilovepdf.com/v1/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: publicKey }),
  })
  let data = await res.json()
  if (!res.ok) throw new Error(`iLovePDF auth: ${JSON.stringify(data)}`)
  const token = data.token as string

  res = await fetch('https://api.ilovepdf.com/v1/start/imagepdf', {
    headers: { Authorization: `Bearer ${token}` },
  })
  data = await res.json()
  if (!res.ok) throw new Error(`iLovePDF start: ${JSON.stringify(data)}`)
  const server = data.server as string
  const task = data.task as string

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

  res = await fetch(`https://${server}/v1/download/${task}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('iLovePDF download failed')

  return Buffer.from(await res.arrayBuffer())
}

// ── Template-based cover page ─────────────────────────────────────────────────
//
// Loads `public/capa_certificacao_modelo.pdf` and draws only the dynamic
// fields (Document Type, Number of Pages, Order #, Date) onto the pre-printed
// template.  All coordinates were derived from pdf2json analysis of the template:
//
//   1 json unit = 16 pt   (page = 38.25 × 49.5 units = 612 × 792 pt)
//   PDF_x = json_x * 16
//   PDF_y = (49.5 - json_y) * 16
//
//  Field               json pos       PDF pos (approx)
//  ─────────────────── ──────────     ────────────────
//  Document Type val   x≈11, y=9.8    (176, 635)  – blank in template
//  Number of pages     x=10.8, y=12.8 (173, 587)  – covers "02"
//  Order #             x=7.4, y=13.8  (118, 571)  – covers "0001-USA"
//  Dated               x=4.3, y=42.0  ( 69, 120)  – covers full "Dated: …"

// Returns a PDFPage that is already part of `targetDoc`'s context (ready to insert).
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

  // Copy the cover template page into the target document's context
  const [capaPage] = await targetDoc.copyPages(capaSrc, [0])

  // Embed Helvetica (standard, no subsetting issues) in the target document
  const fontHelv = await targetDoc.embedFont(StandardFonts.Helvetica)

  const black = rgb(0, 0, 0)
  // Info-box background colour (matches the light-grey box in the template)
  const infoBoxBg = rgb(0.96, 0.96, 0.97)
  // Plain white for the credentials / bottom area
  const white = rgb(1, 1, 1)

  // ── 1. Document Type value (blank in template) ─────────────────────────────
  // The "Document Type:" label ends at ~x=194pt; values in this table start at
  // ~x=176pt (consistent with Portuguese/English columns).  y=635 for row 1.
  capaPage.drawText(docType, {
    x: 176,
    y: 635,
    size: 10.5,
    font: fontHelv,
    color: black,
  })

  // ── 2. Number of Pages (template shows "02" placeholder) ──────────────────
  // White out the placeholder and draw the real value.
  capaPage.drawRectangle({ x: 168, y: 583, width: 88, height: 13, color: infoBoxBg })
  capaPage.drawText(totalPages.toString(), {
    x: 173,
    y: 586,
    size: 10.5,
    font: fontHelv,
    color: black,
  })

  // ── 3. Order # (template shows "0001-USA" placeholder) ───────────────────
  // The value column for Order # starts at x≈7.4 units = 118pt.
  capaPage.drawRectangle({ x: 115, y: 567, width: 155, height: 13, color: infoBoxBg })
  capaPage.drawText(`${orderId.toString().padStart(4, '0')}-USA`, {
    x: 119,
    y: 570,
    size: 10.5,
    font: fontHelv,
    color: black,
  })

  // ── 4. Date (template shows a hardcoded sample date) ─────────────────────
  // "Dated: February 21, 2026" is a single text run at y=42.0 (json) → PDF_y=120.
  // Erase the whole run and redraw with today's date.
  capaPage.drawRectangle({ x: 66, y: 116, width: 240, height: 13, color: white })
  capaPage.drawText(`Dated: ${dateStr}`, {
    x: 69,
    y: 119,
    size: 9,
    font: fontHelv,
    color: black,
  })

  return capaPage
}

// ── Main server action ────────────────────────────────────────────────────────
//
// options.preview = true → uploads to orders/previews/, skips all DB writes.
//   Used by "Pré-visualizar Kit" so the operator can inspect formatting without
//   committing the delivery or triggering any status changes.

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
    // 1. Fetch document + order
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

    // Content area on timbrado letterhead pages.
    // Conservative margins leave room for Promobi's header (≈130pt from top)
    // and footer (≈90pt from bottom).
    const PAGE_WIDTH = 612
    const MARGIN_LEFT = 72
    const MARGIN_RIGHT = 72
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT  // 468 pt
    const TEXT_TOP = 650      // y from bottom where body text begins
    const TEXT_BOTTOM = 90    // y from bottom where body text must stop
    const FONT_SIZE = 11
    const LINE_HEIGHT = FONT_SIZE * 1.5   // 16.5 pt
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

        // Copy the timbrado letterhead as the page background
        const [bgPage] = await finalPdf.copyPages(timbradoPdf, [0])
        finalPdf.addPage(bgPage)

        // Draw translation text on top of the letterhead
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

        // Footer: "Translation of [docName] — Page X of Y"
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
      // Placeholder page (timbrado background) if translation not yet available
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
            // Convert image to PDF first, then merge
            const filename =
              doc.originalFileUrl.split('/').pop()?.split('?')[0] || 'document.jpg'
            const pdfBuf = await convertImageToPdfBuffer(originalBuf, filename)
            const originalPdf = await PDFDocument.load(pdfBuf, { ignoreEncryption: true })
            const copied = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices())
            copied.forEach((p) => finalPdf.addPage(p))
          } else {
            // Direct PDF merge
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

    // ── 6. BUILD AND INSERT COVER PAGE (from template) ────────────────────────
    // Build cover AFTER all content pages so we know the true total page count.
    const contentPageCount = finalPdf.getPageCount()
    const totalPdfPages = contentPageCount + 1   // +1 for the cover itself

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

    // ── 8. UPDATE DATABASE (skipped in preview mode) ──────────────────────────
    if (!isPreview) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          delivery_pdf_url: deliveryUrl,
          translation_status: 'approved',
        },
      })

      // Signal to sendDelivery that the order has at least one ready kit
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
