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

// ── Auto-detect and embed image (PNG or JPEG) ─────────────────────────────────

async function embedAutoImage(
  pdfDoc: PDFDocument,
  buffer: Buffer
) {
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8
  if (isJpeg) return pdfDoc.embedJpg(buffer)
  return pdfDoc.embedPng(buffer)
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

// ── Cover page builder ────────────────────────────────────────────────────────

async function buildCoverPage(params: {
  docType: string
  orderId: number
  totalPages: number
  dateStr: string
}): Promise<PDFDocument> {
  const { docType, orderId, totalPages, dateStr } = params

  const coverPdf = await PDFDocument.create()
  const page = coverPdf.addPage([612, 792])

  const fontNormal = await coverPdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await coverPdf.embedFont(StandardFonts.HelveticaBold)

  // Load image assets
  const publicDir = path.join(process.cwd(), 'public')
  const logoPromobiBytes = await fs.readFile(path.join(publicDir, 'logo-promobi.png'))
  const logoAtaBytes = await fs.readFile(path.join(publicDir, 'logo-ata.png'))
  const seloAtaBytes = await fs.readFile(path.join(publicDir, 'selo-ata.png'))
  const assinaturaBytes = await fs.readFile(path.join(publicDir, 'assinatura-isabele.png.jpg'))

  const logoPromobi = await embedAutoImage(coverPdf, logoPromobiBytes)
  const logoAta = await embedAutoImage(coverPdf, logoAtaBytes)
  const seloAta = await embedAutoImage(coverPdf, seloAtaBytes)
  const assinatura = await coverPdf.embedJpg(assinaturaBytes) // confirmed JPEG

  // Colours
  const black = rgb(0, 0, 0)
  const orange = rgb(0.91, 0.46, 0.1)
  const darkBg = rgb(0.06, 0.07, 0.09)
  const midGray = rgb(0.4, 0.4, 0.4)
  const lightGray = rgb(0.82, 0.82, 0.82)
  const veryLight = rgb(0.96, 0.96, 0.97)
  const almostBlack = rgb(0.12, 0.13, 0.14)

  // ── HEADER BAR ───────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 752, width: 612, height: 40, color: darkBg })

  const promobiDims = logoPromobi.scaleToFit(120, 28)
  page.drawImage(logoPromobi, {
    x: 72,
    y: 752 + (40 - promobiDims.height) / 2,
    width: promobiDims.width,
    height: promobiDims.height,
  })

  const ataDims = logoAta.scaleToFit(72, 26)
  page.drawImage(logoAta, {
    x: 612 - 72 - ataDims.width,
    y: 752 + (40 - ataDims.height) / 2,
    width: ataDims.width,
    height: ataDims.height,
  })

  // Orange accent strip
  page.drawRectangle({ x: 0, y: 748, width: 612, height: 4, color: orange })

  // ── TITLE BLOCK ──────────────────────────────────────────────────────────
  const title = 'CERTIFICATION OF TRANSLATION ACCURACY'
  const titleSize = 14
  const titleW = fontBold.widthOfTextAtSize(title, titleSize)
  page.drawText(title, {
    x: (612 - titleW) / 2,
    y: 714,
    size: titleSize,
    font: fontBold,
    color: almostBlack,
  })

  const subtitle = 'Promobi Translation Services  ·  ATA Associate Member M-194918'
  const subtitleSize = 8.5
  const subtitleW = fontNormal.widthOfTextAtSize(subtitle, subtitleSize)
  page.drawText(subtitle, {
    x: (612 - subtitleW) / 2,
    y: 699,
    size: subtitleSize,
    font: fontNormal,
    color: midGray,
  })

  page.drawLine({
    start: { x: 72, y: 691 },
    end: { x: 540, y: 691 },
    thickness: 0.5,
    color: lightGray,
  })

  // ── INFO BOX ──────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 72,
    y: 623,
    width: 468,
    height: 62,
    color: veryLight,
    borderColor: lightGray,
    borderWidth: 0.5,
  })

  const labelSize = 8
  const valueSize = 8.5
  const infoFields: [string, string, number, number][] = [
    ['Document Type:', docType, 84, 672],
    ['Source Language:', 'Portuguese', 84, 656],
    ['Target Language:', 'English', 84, 640],
    ['Number of Pages:', totalPages.toString(), 310, 672],
    ['Order #:', orderId.toString().padStart(4, '0') + '-USA', 310, 656],
  ]

  for (const [label, value, x, y] of infoFields) {
    page.drawText(label, { x, y, size: labelSize, font: fontBold, color: midGray })
    page.drawText(value, {
      x: x + fontBold.widthOfTextAtSize(label, labelSize) + 4,
      y,
      size: valueSize,
      font: fontNormal,
      color: black,
    })
  }

  // ── CERTIFICATION TEXT ────────────────────────────────────────────────────
  const certBody = [
    `I, Isabele Bandeira de Moraes D'Angelo, a certified translator at Promobi Translation, ` +
      `Associate M-194918, hereby attest as follows:`,
    '',
    `I am not related in any way to the client for whom this translation was completed.`,
    '',
    `I hereby certify that I am fluent in and competent to translate from Portuguese into English, ` +
      `and that the document described above has been translated by me.`,
    '',
    `To the best of my knowledge and professional judgment, the translated text accurately reflects ` +
      `the content, meaning, and style of the original text and constitutes in every respect a correct, ` +
      `true, and complete translation of the original document.`,
    '',
    `This certification relates solely to the accuracy of the translation. I do not guarantee that ` +
      `the original document is genuine, nor do I guarantee that the statements contained in the original ` +
      `document are true. Furthermore, I assume no liability for the manner in which the translation is ` +
      `used by the client or by any third party, including end-users of the translation.`,
    '',
    `A copy of the translation is attached to this certification.`,
  ].join('\n')

  const certFontSize = 10.5
  const certLineHeight = certFontSize * 1.5
  const certMaxWidth = 468
  const certLines = wrapLines(certBody, fontNormal, certFontSize, certMaxWidth)

  let certY = 612
  for (const line of certLines) {
    if (certY < 205) break
    if (line) {
      page.drawText(line, {
        x: 72,
        y: certY,
        size: certFontSize,
        font: fontNormal,
        color: black,
      })
    }
    certY -= certLineHeight
  }

  // ── FOOTER SEPARATOR ─────────────────────────────────────────────────────
  page.drawLine({
    start: { x: 72, y: 195 },
    end: { x: 540, y: 195 },
    thickness: 0.5,
    color: lightGray,
  })

  // ── SIGNATURE (left column) ───────────────────────────────────────────────
  const sigDims = assinatura.scaleToFit(150, 52)
  page.drawImage(assinatura, {
    x: 72,
    y: 135,
    width: sigDims.width,
    height: sigDims.height,
  })

  // Underline below signature
  page.drawLine({
    start: { x: 72, y: 132 },
    end: { x: 235, y: 132 },
    thickness: 0.5,
    color: midGray,
  })

  // Credential text
  const credLines: [string, number][] = [
    ["Isabele Bandeira de Moraes D'Angelo", 120],
    ['American Translators Association n\u00b0 M-194918', 107],
    ['Telephone: +1 321 324-5851', 94],
    ['Email: traducao@promobi.us', 81],
    ['Address: 13550 Village Park Dr, Orlando / FL', 68],
    [`Dated: ${dateStr}`, 55],
  ]
  for (const [text, y] of credLines) {
    page.drawText(text, {
      x: 72,
      y,
      size: 8,
      font: fontNormal,
      color: rgb(0.2, 0.2, 0.2),
    })
  }

  // ── SEAL (right column) ───────────────────────────────────────────────────
  const sealDims = seloAta.scaleToFit(95, 95)
  page.drawImage(seloAta, {
    x: 540 - sealDims.width,
    y: 95,
    width: sealDims.width,
    height: sealDims.height,
  })

  return coverPdf
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

    // 2. Create the working PDF document
    const finalPdf = await PDFDocument.create()
    const fontNormal = await finalPdf.embedFont(StandardFonts.Helvetica)
    const fontBold = await finalPdf.embedFont(StandardFonts.HelveticaBold)

    // Constants (US Letter, 1-inch margins)
    const PAGE_WIDTH = 612
    const PAGE_HEIGHT = 792
    const MARGIN = 72
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2    // 468pt
    const TEXT_TOP = PAGE_HEIGHT - MARGIN - 20        // 700pt  (leave room for subtle header)
    const TEXT_BOTTOM = MARGIN + 28                   // 100pt  (room for footer)
    const FONT_SIZE = 11
    const LINE_HEIGHT = FONT_SIZE * 1.5               // 16.5pt
    const FOOTER_SIZE = 8.5
    const HEADER_SIZE = 7

    const docName = doc.exactNameOnDoc || doc.docType
    const docType = doc.docType || 'Certified Translation'

    // ── 3. TRANSLATION PAGES ─────────────────────────────────────────────────
    let translationPageCount = 0

    if (doc.translatedText) {
      const plainText = stripHtml(doc.translatedText)
      const allLines = wrapLines(plainText, fontNormal, FONT_SIZE, CONTENT_WIDTH)

      // Pre-calculate total translation pages
      const linesPerPage = Math.floor((TEXT_TOP - TEXT_BOTTOM) / LINE_HEIGHT)
      const totalTranslationPages = Math.max(1, Math.ceil(allLines.length / linesPerPage))

      for (let pageIndex = 0; pageIndex < totalTranslationPages; pageIndex++) {
        translationPageCount++
        const pageLines = allLines.slice(
          pageIndex * linesPerPage,
          (pageIndex + 1) * linesPerPage
        )

        const translationPage = finalPdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])

        // Subtle top header strip
        translationPage.drawRectangle({
          x: 0,
          y: PAGE_HEIGHT - 20,
          width: PAGE_WIDTH,
          height: 20,
          color: rgb(0.06, 0.07, 0.09),
        })
        const headerLabel = 'PROMOBI TRANSLATION SERVICES  ·  CERTIFIED TRANSLATION'
        const headerLabelW = fontBold.widthOfTextAtSize(headerLabel, HEADER_SIZE)
        translationPage.drawText(headerLabel, {
          x: (PAGE_WIDTH - headerLabelW) / 2,
          y: PAGE_HEIGHT - 14,
          size: HEADER_SIZE,
          font: fontBold,
          color: rgb(0.8, 0.8, 0.8),
        })

        // Thin orange accent
        translationPage.drawRectangle({
          x: 0,
          y: PAGE_HEIGHT - 22,
          width: PAGE_WIDTH,
          height: 2,
          color: rgb(0.91, 0.46, 0.1),
        })

        // Draw text lines
        let currentY = TEXT_TOP
        for (const line of pageLines) {
          if (line) {
            translationPage.drawText(line, {
              x: MARGIN,
              y: currentY,
              size: FONT_SIZE,
              font: fontNormal,
              color: rgb(0, 0, 0),
            })
          }
          currentY -= LINE_HEIGHT
        }

        // Footer: "Translation of [docName] - Page X of Y"
        const footerText = `Translation of ${docName}  \u2014  Page ${pageIndex + 1} of ${totalTranslationPages}`
        const footerW = fontNormal.widthOfTextAtSize(footerText, FOOTER_SIZE)
        translationPage.drawLine({
          start: { x: MARGIN, y: TEXT_BOTTOM - 6 },
          end: { x: PAGE_WIDTH - MARGIN, y: TEXT_BOTTOM - 6 },
          thickness: 0.4,
          color: rgb(0.8, 0.8, 0.8),
        })
        translationPage.drawText(footerText, {
          x: (PAGE_WIDTH - footerW) / 2,
          y: TEXT_BOTTOM - 20,
          size: FOOTER_SIZE,
          font: fontNormal,
          color: rgb(0.55, 0.55, 0.55),
        })
      }
    } else {
      // Placeholder page if no translation text
      const placeholder = finalPdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      const msg = 'Translation text not yet available.'
      const msgW = fontNormal.widthOfTextAtSize(msg, FONT_SIZE)
      placeholder.drawText(msg, {
        x: (PAGE_WIDTH - msgW) / 2,
        y: PAGE_HEIGHT / 2,
        size: FONT_SIZE,
        font: fontNormal,
        color: rgb(0.5, 0.5, 0.5),
      })
      translationPageCount = 1
    }

    // ── 4. ORIGINAL DOCUMENT PAGES ────────────────────────────────────────────
    if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
      try {
        const originalRes = await fetch(doc.originalFileUrl)
        if (originalRes.ok) {
          const originalBuf = Buffer.from(await originalRes.arrayBuffer())

          if (isImageUrl(doc.originalFileUrl)) {
            const filename = doc.originalFileUrl.split('/').pop()?.split('?')[0] || 'document.jpg'
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

    // ── 5. BUILD COVER PAGE AND INSERT AT INDEX 0 ─────────────────────────────
    const contentPageCount = finalPdf.getPageCount()
    const totalPdfPages = contentPageCount + 1 // +1 for cover

    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    const coverPdf = await buildCoverPage({
      docType,
      orderId,
      totalPages: totalPdfPages,
      dateStr,
    })

    const [importedCover] = await finalPdf.copyPages(coverPdf, [0])
    finalPdf.insertPage(0, importedCover)

    // ── 6. SAVE AND UPLOAD ────────────────────────────────────────────────────
    const pdfBytes = await finalPdf.save()

    const supabase = createClient(supabaseUrl, supabaseKey)
    const safeName = `delivery_kit_order${orderId}_doc${documentId}_${Date.now()}.pdf`
    // Preview files go to a separate folder and are never referenced in the DB
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

    // ── 7. UPDATE DATABASE (skipped in preview mode) ──────────────────────────
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
