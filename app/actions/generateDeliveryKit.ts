'use server'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from '@supabase/supabase-js'
import { getLogoBase64 } from './get-logo-base64'

// Helper to sanitize text for WinAnsi encoding (standard PDF fonts)
function sanitizeText(text: string): string {
  return text.replace(/[^\x00-\xFF]/g, (char) => {
    const map: { [key: string]: string } = {
      '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...',
      'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
      'â': 'a', 'ê': 'e', 'ô': 'o', 'ã': 'a', 'õ': 'o',
      'ç': 'c', 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
      'Â': 'A', 'Ê': 'E', 'Ô': 'O', 'Ã': 'A', 'Õ': 'O', 'Ç': 'C'
    }
    return map[char] || '?'
  })
}

export async function generateDeliveryKit(orderId: number, documentId: number, options?: { preview?: boolean }) {
  const isPreview = options?.preview ?? false
  
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { order: true }
    })

    if (!doc) throw new Error('Documento não encontrado')

    // 1. Create PDF and embed fonts/images
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // 2. Add Content Page (Translation)
    const page = pdfDoc.addPage([595.28, 841.89]) // A4
    const { width, height } = page.getSize()

    const logoBase64 = await getLogoBase64()
    if (logoBase64) {
      try {
        const base64Data = logoBase64.replace(/^data:image\/png;base64,/, '')
        const logoImage = await pdfDoc.embedPng(Buffer.from(base64Data, 'base64'))
        const logoDims = logoImage.scale(0.3)
        page.drawImage(logoImage, {
          x: page.getWidth() - logoDims.width - 40,
          y: page.getHeight() - logoDims.height - 40,
          width: logoDims.width,
          height: logoDims.height,
        })
      } catch (error) {
        console.error("Error embedding logo in PDF:", error)
      }
    }

    // Document Title
    // Draw header background
    page.drawRectangle({
      x: 0,
      y: page.getHeight() - 120,
      width: page.getWidth(),
      height: 120,
      color: rgb(0.05, 0.1, 0.2), // Dark Navy
    })

    page.drawText('KIT DE ENTREGA PROMOBIDOCS', {
      x: 40,
      y: page.getHeight() - 75,
      size: 28,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    })

    // Sub-header section
    let currentY = page.getHeight() - 160

    page.drawText('Informações da Venda', {
      x: 40,
      y: currentY,
      size: 18,
      font: helveticaBold,
      color: rgb(0.05, 0.1, 0.2),
    })

    page.drawLine({
      start: { x: 40, y: currentY - 5 },
      end: { x: 200, y: currentY - 5 },
      thickness: 2,
      color: rgb(0.05, 0.1, 0.2),
    })

    currentY -= 30

    const venda = doc.order
    page.drawText(`Cliente: ${venda?.customerName || 'N/A'}`, {
      x: 40,
      y: currentY,
      size: 12,
      font: helvetica,
    })
    currentY -= 20
    page.drawText(`Data: ${format(new Date(venda.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, {
      x: 40,
      y: currentY,
      size: 12,
      font: helvetica,
    })

    currentY -= 40

    page.drawText('Documentos do Kit', {
      x: 40,
      y: currentY,
      size: 18,
      font: helveticaBold,
      color: rgb(0.05, 0.1, 0.2),
    })

    page.drawLine({
      start: { x: 40, y: currentY - 5 },
      end: { x: 180, y: currentY - 5 },
      thickness: 2,
      color: rgb(0.05, 0.1, 0.2),
    })

    currentY -= 30

    // Metadata
    page.drawText(`Venda #${venda.id}`, {
      x: 40,
      y: page.getHeight() - 100,
      size: 14,
      font: helvetica,
      color: rgb(0.8, 0.8, 0.8),
    })

    // Translated Text (now listing documents)
    if (doc.translatedText) {
      // Basic text wrapping logic (simplified)
      const lines = sanitizeText(doc.translatedText.replace(/<[^>]*>/g, '')).split('\n')
      
      // Assuming 'doc' here refers to the current document being processed
      // The original code had a loop over 'lines' from translatedText,
      // but the new instruction replaces it with a single line for the current doc.
      // This part of the instruction seems to be a mix-up, as it's inside the translatedText block
      // but refers to a single doc.type and doc.link.
      // I will interpret this as listing the current document's status.
      page.drawText(`• ${doc.type}: ${doc.link ? 'Disponível' : 'Pendente'}`, {
        x: 60,
        y: currentY,
        size: 12,
        font: helvetica,
      })
      currentY -= 20
    }

    currentY -= 20

    // Important Notice Section
    page.drawRectangle({
      x: 40,
      y: currentY - 60,
      width: page.getWidth() - 80,
      height: 60,
      color: rgb(0.95, 0.95, 0.98),
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
    })

    page.drawText('IMPORTANTE:', {
      x: 55,
      y: currentY - 20,
      size: 10,
      font: helveticaBold,
      color: rgb(0.3, 0.3, 0.3),
    })

    page.drawText('Este documento comprova a geração do kit de entrega com os documentos listados acima.', {
      x: 55,
      y: currentY - 35,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    })

    page.drawText('Verifique a integridade de cada arquivo no portal PromobiDocs.', {
      x: 55,
      y: currentY - 50,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    })
  
    // 3. Append Original Document if exists
    if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
      try {
        const originalResponse = await fetch(doc.originalFileUrl)
        const originalBytes = await originalResponse.arrayBuffer()
        const originalDoc = await PDFDocument.load(originalBytes)
        const copiedPages = await pdfDoc.copyPages(originalDoc, originalDoc.getPageIndices())
        copiedPages.forEach(p => pdfDoc.addPage(p))
      } catch (e) {
        console.error('Error attaching original PDF:', e)
      }
    }

    // 4. Finalize and Upload to Supabase
    const pdfBytes = await pdfDoc.save()
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const fileName = `kit_${orderId}_${documentId}_${Date.now()}.pdf`
    const filePath = `deliveries/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        cacheControl: '3600'
      })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)

    const deliveryUrl = urlData.publicUrl

    // 5. Update Database (if not preview)
    if (!isPreview) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          delivery_pdf_url: deliveryUrl,
          translation_status: 'approved'
        }
      })
    }

    return { success: true, deliveryUrl }

  } catch (error: any) {
    console.error('Generate Delivery Kit Error:', error)
    return { success: false, error: error.message }
  }
}