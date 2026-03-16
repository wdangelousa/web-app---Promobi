import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import prisma from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const GOTENBERG_URL = 'http://127.0.0.1:3001/forms/chromium/convert/html';

function isPdf(buffer: Buffer): boolean {
  return (
    buffer.length > 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  );
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

function wrapLines(
  text: string,
  font: any,
  fontSize: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }

    const words = para.split(/\s+/);
    let current = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const test = `${current} ${words[i]}`;
      if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
        current = test;
      } else {
        lines.push(current);
        current = words[i];
      }
    }

    if (current) lines.push(current);
  }

  return lines;
}

function sanitizeTranslatedHtml(html: string): string {
  if (!html) return '';

  return html
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '')
    .replace(/<\/body>/gi, '')
    .replace(/```html/gi, '')
    .replace(/```/gi, '')
    .trim();
}

async function loadLetterheadBytes(): Promise<Buffer> {
  const rootPath = path.join(process.cwd(), 'letterhead.png');
  const publicFallbackPath = path.join(process.cwd(), 'public', 'letterhead.png');

  try {
    console.log('[Kit Route] using root letterhead:', rootPath);
    return await fs.readFile(rootPath);
  } catch {
    console.log('[Kit Route] root letterhead not found, trying public:', publicFallbackPath);
    try {
      return await fs.readFile(publicFallbackPath);
    } catch {
      throw new Error("ERRO CRÍTICO: Imagem 'letterhead.png' não encontrada.");
    }
  }
}

async function buildTranslatedSectionPdfWithLetterhead(
  translatedHtml: string,
  targetPdfDoc: PDFDocument,
  pageWidth: number,
  pageHeight: number
) {
  const cleanHtml = sanitizeTranslatedHtml(translatedHtml);

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: letter;
      margin: 0;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: transparent !important;
      background-color: transparent !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: "Times New Roman", Times, serif;
      color: black;
      width: 100%;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      font-size: 10.5pt;
      line-height: 1.28;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .content-area {
      box-sizing: border-box;
      padding-top: 150px;
      padding-bottom: 90px;
      padding-left: 62px;
      padding-right: 62px;
      width: 100%;
    }

    .translation-body {
      width: 100%;
    }

    .translation-body h1,
    .translation-body h2,
    .translation-body h3,
    .translation-body h4,
    .translation-body h5,
    .translation-body h6 {
      font-family: "Times New Roman", Times, serif;
      color: #000;
      margin: 0 0 6pt 0;
      line-height: 1.15;
      font-weight: bold;
    }

    .translation-body h1 { font-size: 13pt; }
    .translation-body h2 { font-size: 12pt; }
    .translation-body h3 { font-size: 11.5pt; }
    .translation-body h4,
    .translation-body h5,
    .translation-body h6 { font-size: 11pt; }

    .translation-body p {
      margin: 0 0 5pt 0;
      text-align: justify;
      line-height: 1.28;
    }

    .translation-body ul,
    .translation-body ol {
      margin: 0 0 6pt 18pt;
      padding: 0;
    }

    .translation-body li {
      margin: 0 0 3pt 0;
    }

    .translation-body table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      table-layout: fixed;
      margin: 6pt 0;
      font-size: 9pt;
      page-break-inside: avoid;
    }

    .translation-body th,
    .translation-body td {
      border: 0.75pt solid #000;
      padding: 4pt;
      vertical-align: top;
      text-align: left;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .translation-body img {
      max-width: 100%;
      height: auto;
    }

    .translation-body .text-center { text-align: center; }
    .translation-body .text-right { text-align: right; }
    .translation-body .text-left { text-align: left; }
    .translation-body .no-break { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="content-area">
    <div class="translation-body">
      ${cleanHtml}
    </div>
  </div>
</body>
</html>`;

  const formData = new FormData();
  const file = new File([fullHtml], 'index.html', { type: 'text/html' });

  formData.append('files', file);
  formData.append('paperWidth', '8.5');
  formData.append('paperHeight', '11');
  formData.append('marginTop', '0');
  formData.append('marginBottom', '0');
  formData.append('marginLeft', '0');
  formData.append('marginRight', '0');
  formData.append('printBackground', 'true');
  formData.append('preferCssPageSize', 'false');
  formData.append('skipNetworkIdleEvent', 'true');

  const gotenbergRes = await fetch(GOTENBERG_URL, {
    method: 'POST',
    body: formData,
  });

  if (!gotenbergRes.ok) {
    const errorText = await gotenbergRes.text();
    throw new Error(`Gotenberg translated section failed: ${gotenbergRes.status} - ${errorText}`);
  }

  const translatedPdfBuffer = Buffer.from(await gotenbergRes.arrayBuffer());

  if (!isPdf(translatedPdfBuffer)) {
    throw new Error('Gotenberg falhou em gerar o PDF do documento traduzido.');
  }

  const letterheadBytes = await loadLetterheadBytes();
  const letterheadImg = await targetPdfDoc.embedPng(letterheadBytes);

  const translatedPdf = await PDFDocument.load(translatedPdfBuffer);
  const translatedPages = translatedPdf.getPages();
  const embeddedPages = await targetPdfDoc.embedPages(translatedPages);

  for (const embeddedPage of embeddedPages) {
    const newPage = targetPdfDoc.addPage([pageWidth, pageHeight]);

    newPage.drawPage(embeddedPage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });

    newPage.drawImage(letterheadImg, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      opacity: 1,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('=== ROUTE generate-pdf-kit HIT ===');

    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { documents: true, user: true }
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const PAGE_WIDTH = 612;
    const PAGE_HEIGHT = 792;
    const MARGIN = 70;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const black = rgb(0, 0, 0);
    const grey = rgb(0.3, 0.3, 0.3);

    // 1) CAPA DE CERTIFICAÇÃO — MANTER INTACTA
    const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const publicDir = path.join(process.cwd(), 'public');

    try {
      const logoBytes = await fs.readFile(path.join(publicDir, 'logo-promobidocs.png'));
      const logoImg = await pdfDoc.embedPng(logoBytes);
      const originalWidth = 140;
      const originalHeight = (logoImg.height / logoImg.width) * originalWidth;
      const scaledWidth = originalWidth * 0.7;
      const scaledHeight = originalHeight * 0.7;

      coverPage.drawImage(logoImg, {
        x: MARGIN,
        y: PAGE_HEIGHT - scaledHeight - 40,
        width: scaledWidth,
        height: scaledHeight,
      });
    } catch {
      console.warn('[Kit Route] logo-promobidocs.png não encontrado para a capa');
    }

    coverPage.drawText('CERTIFICATION OF TRANSLATION ACCURACY', {
      x: MARGIN,
      y: PAGE_HEIGHT - 160,
      size: 16,
      font: boldFont,
      color: black,
    });

    const labelX = 70;
    const valueX = 220;
    let currentY = PAGE_HEIGHT - 210;
    const lineSpacing = 22;

    const drawGridLine = (label: string, value: string) => {
      coverPage.drawText(label, { x: labelX, y: currentY, size: 10, font: boldFont });
      coverPage.drawText(value, { x: valueX, y: currentY, size: 10, font });
      currentY -= lineSpacing;
    };

    const firstDoc = order.documents[0];
    const docTypeVal =
      firstDoc?.exactNameOnDoc || firstDoc?.docType || 'Official Documents';

    const sourceLang =
      order.sourceLanguage === 'ES'
        ? 'Spanish'
        : 'Portuguese';

    drawGridLine('Document Type:', docTypeVal.toUpperCase());
    drawGridLine('Source Language:', sourceLang);
    drawGridLine('Target Language:', 'English');
    drawGridLine('Number of pages:', String(order.documents.length).padStart(2, '0'));
    drawGridLine('Order #:', String(order.id + 1000).padStart(4, '0') + '-USA');

    currentY -= 20;

    const certText =
      `I, the undersigned, hereby certify that I am fluent in English and the source language (${sourceLang}) ` +
      `of the attached documents, and that the attached translation is a true, accurate, and complete translation ` +
      `of the original document attached hereto.`;

    const wrapWidth = PAGE_WIDTH - (MARGIN * 2);
    const lines = wrapLines(certText, font, 11, wrapWidth);
    for (const line of lines) {
      coverPage.drawText(line, { x: MARGIN, y: currentY, size: 11, font, lineHeight: 16 });
      currentY -= 18;
    }

    currentY -= 20;

    const dateString = `Dated: ${new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}`;
    const dateWidth = font.widthOfTextAtSize(dateString, 11);
    coverPage.drawText(dateString, {
      x: PAGE_WIDTH - MARGIN - dateWidth,
      y: currentY,
      size: 11,
      font
    });

    currentY -= 50;

    try {
      const signatureBytes = await fs.readFile(path.join(publicDir, 'assinatura-isabele.png.jpg'));
      const signatureImg = await pdfDoc.embedJpg(signatureBytes);
      coverPage.drawImage(signatureImg, { x: MARGIN, y: currentY, width: 150, height: 45 });
    } catch {
      console.warn('[Kit Route] assinatura não encontrada');
    }

    try {
      const ataLogoBytes = await fs.readFile(path.join(publicDir, 'logo-ata.png'));
      const ataImg = await pdfDoc.embedPng(ataLogoBytes);
      coverPage.drawImage(ataImg, { x: MARGIN + 180, y: currentY + 5, width: 40, height: 40 });
    } catch {
      console.warn('[Kit Route] logo ATA não encontrado');
    }

    currentY -= 15;
    coverPage.drawText('___________________________________', { x: MARGIN, y: currentY, size: 12, font });
    currentY -= 20;
    coverPage.drawText('Promobi Certified Translator', { x: MARGIN, y: currentY, size: 11, font: boldFont });

    const footerText =
      '13558 Village Park Dr, Orlando/FL, 32837 | +1 321 324-5851 | translator@promobidocs.com | www.promobidocs.com';
    const footerW = font.widthOfTextAtSize(footerText, 8.5);
    coverPage.drawText(footerText, {
      x: (PAGE_WIDTH - footerW) / 2,
      y: 35,
      size: 8.5,
      font,
      color: grey
    });

    // 2) DOC TRADUZIDO
    for (const doc of order.documents) {
      if (doc.translatedText) {
        console.log('=== ROUTE translated section start ===');
        await buildTranslatedSectionPdfWithLetterhead(
          doc.translatedText,
          pdfDoc,
          PAGE_WIDTH,
          PAGE_HEIGHT
        );
      }

      // 3) DOC ORIGINAL — MANTER INTACTO
      if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
        try {
          const origRes = await fetch(doc.originalFileUrl);

          if (origRes.ok) {
            const origBuf = Buffer.from(await origRes.arrayBuffer());
            const rotationsMap = (doc.pageRotations as any) || {};

            if (isPdf(origBuf)) {
              const origPdf = await PDFDocument.load(origBuf, { ignoreEncryption: true });
              const copiedPages = await pdfDoc.copyPages(origPdf, origPdf.getPageIndices());

              copiedPages.forEach((p, idx) => {
                const rot = rotationsMap[String(idx)] || p.getRotation().angle;
                p.setRotation(degrees(rot));
                pdfDoc.addPage(p);
              });
            } else {
              const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
              let image;

              if (isPng(origBuf)) {
                image = await pdfDoc.embedPng(origBuf);
              } else {
                image = await pdfDoc.embedJpg(origBuf);
              }

              const scale = Math.min(
                PAGE_WIDTH / image.width,
                PAGE_HEIGHT / image.height
              );

              const rot = rotationsMap['0'] || 0;
              if (rot !== 0) page.setRotation(degrees(rot));

              page.drawImage(image, {
                x: (PAGE_WIDTH - image.width * scale) / 2,
                y: (PAGE_HEIGHT - image.height * scale) / 2,
                width: image.width * scale,
                height: image.height * scale,
              });
            }
          }
        } catch (e) {
          console.error('[Kit Route] Error appending original doc', e);
        }
      }
    }

    // 4) SAVE / UPLOAD
    const pdfBytes = await pdfDoc.save();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase config missing');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const fileName = `Certificate_Order_${order.id}_${Date.now()}.pdf`;
    const storagePath = `orders/delivered/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        deliveryUrl: urlData.publicUrl,
        status: 'READY_FOR_REVIEW'
      }
    });

    return NextResponse.json({
      success: true,
      deliveryUrl: urlData.publicUrl,
      order: updatedOrder
    });
  } catch (error: any) {
    console.error('PDF Kit Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}