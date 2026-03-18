import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import prisma from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { classifyDocument } from '@/services/documentClassifier';
import { isSupportedStructuredDocumentType } from '@/services/structuredDocumentRenderer';

function isPdf(buffer: Buffer): boolean {
    return buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
}

function isPng(buffer: Buffer): boolean {
    return buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
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
            const test = current + ' ' + words[i];
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

export async function POST(req: NextRequest) {
    try {
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

        const supportedDocs = order.documents
            .map((doc) => {
                const documentLabelHint =
                    [doc.exactNameOnDoc, doc.docType].filter(Boolean).join(' ').trim() || undefined;
                const classification = classifyDocument({
                    fileUrl: doc.originalFileUrl ?? undefined,
                    documentLabel: documentLabelHint,
                    translatedText: doc.translatedText ?? undefined,
                    sourceLanguage: doc.sourceLanguage ?? order.sourceLanguage ?? undefined,
                });

                return isSupportedStructuredDocumentType(classification.documentType)
                    ? `${doc.exactNameOnDoc ?? doc.docType ?? `#${doc.id}`} (${classification.documentType})`
                    : null;
            })
            .filter(Boolean);

        if (supportedDocs.length > 0) {
            return NextResponse.json({
                success: false,
                error:
                    'Legacy order-level PDF generation is blocked for supported structured document families. ' +
                    `Detected: ${supportedDocs.join(', ')}. Use the structured workbench delivery flow instead.`,
            }, { status: 409 });
        }

        const PAGE_WIDTH = 612;
        const PAGE_HEIGHT = 792;
        const MARGIN = 70;

        let lhBytes: Buffer;
        try {
            lhBytes = await fs.readFile(path.join(process.cwd(), 'letterhead.png'));
        } catch (err1) {
            try {
                lhBytes = await fs.readFile(path.join(process.cwd(), 'public', 'letterhead.png'));
            } catch (err2) {
                throw new Error("ERRO CRÍTICO: Imagem 'letterhead.png' não encontrada.");
            }
        }

        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const black = rgb(0, 0, 0);
        const grey = rgb(0.3, 0.3, 0.3);

        const bgImage = await pdfDoc.embedPng(lhBytes);

        // ── 1. Create Certificate Cover Page ─────────────────────────
        const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        const publicDir = path.join(process.cwd(), 'public');

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

        const docTypeVal = order.documents[0]?.exactNameOnDoc || order.documents[0]?.docType || 'Official Documents';
        const sourceLang = order.sourceLanguage === 'ES' ? 'Spanish' : 'Portuguese';

        drawGridLine('Document Type:', docTypeVal.toUpperCase());
        drawGridLine('Source Language:', sourceLang);
        drawGridLine('Target Language:', 'English');

        const totalPagesCount = order.documents.length;
        drawGridLine('Number of pages:', String(totalPagesCount).padStart(2, '0'));
        drawGridLine('Order #:', String(order.id + 1000).padStart(4, '0') + '-USA');

        currentY -= 20;
        const certText = `I, the undersigned, hereby certify that I am fluent in English and the source language (${sourceLang}) of the attached documents, and that the attached translation is a true, accurate, and complete translation of the original document attached hereto.`;

        const wrapWidth = PAGE_WIDTH - (MARGIN * 2);
        const lines = wrapLines(certText, font, 11, wrapWidth);
        for (const line of lines) {
            coverPage.drawText(line, { x: MARGIN, y: currentY, size: 11, font, lineHeight: 16 });
            currentY -= 18;
        }

        currentY -= 20;

        const dateString = `Dated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
        const dateWidth = font.widthOfTextAtSize(dateString, 11);
        coverPage.drawText(dateString, { x: PAGE_WIDTH - MARGIN - dateWidth, y: currentY, size: 11, font });

        currentY -= 50;
        let signatureBytes;
        try {
            signatureBytes = await fs.readFile(path.join(publicDir, 'assinatura-isabele.png.jpg'));
            const signatureImg = await pdfDoc.embedJpg(signatureBytes);
            coverPage.drawImage(signatureImg, { x: MARGIN, y: currentY, width: 150, height: 45 });
        } catch (e) {
            console.warn("Assinatura não encontrada");
        }

        try {
            const ataLogoBytes = await fs.readFile(path.join(publicDir, 'logo-ata.png'));
            const ataImg = await pdfDoc.embedPng(ataLogoBytes);
            coverPage.drawImage(ataImg, { x: MARGIN + 180, y: currentY + 5, width: 40, height: 40 });
        } catch (e) {
            console.warn("Logo ATA não encontrado");
        }

        currentY -= 15;
        coverPage.drawText('___________________________________', { x: MARGIN, y: currentY, size: 12, font });
        currentY -= 20;
        coverPage.drawText('Promobi Certified Translator', { x: MARGIN, y: currentY, size: 11, font: boldFont });

        const footerText = '13558 Village Park Dr, Orlando/FL, 32837 | +1 321 324-5851 | translator@promobidocs.com | www.promobidocs.com';
        const footerW = font.widthOfTextAtSize(footerText, 8.5);
        coverPage.drawText(footerText, { x: (PAGE_WIDTH - footerW) / 2, y: 35, size: 8.5, font, color: grey });

        // ── 2. Add Document Pages ────────────────────

        for (const doc of order.documents) {
            if (doc.translatedText) {
                // Lavanderia HTML para segurança
                const cleanHtml = doc.translatedText
                    .replace(/<!DOCTYPE[^>]*>/gi, '')
                    .replace(/<html[^>]*>/gi, '')
                    .replace(/<\/html>/gi, '')
                    .replace(/<head>[\s\S]*?<\/head>/gi, '')
                    .replace(/<body[^>]*>/gi, '')
                    .replace(/<\/body>/gi, '')
                    .replace(/```html/gi, '')
                    .replace(/```/gi, '')
                    .trim();

                const fullHtml = `<!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="UTF-8">
                    <style>
                      html, body { margin: 0; padding: 0; background: transparent !important; background-color: transparent !important; -webkit-print-color-adjust: exact; }
                      *, *::before, *::after { background-color: transparent !important; }
                      body { font-family: "Times New Roman", Times, serif; line-height: 1.2; color: black; font-size: 9.5pt; }
                      .content-area { box-sizing: border-box; padding-top: 180px; padding-bottom: 100px; padding-left: 60px; padding-right: 60px; }
                      .zoom-container { zoom: 0.82; }
                      table { border-collapse: collapse; width: 100%; margin: 6pt 0; table-layout: fixed; }
                      th, td { border: 0.75pt solid black; padding: 4pt; font-size: 8.5pt; vertical-align: top; word-wrap: break-word; }
                    </style>
                  </head>
                  <body>
                    <div class="content-area">
                      <div class="zoom-container">${cleanHtml}</div>
                    </div>
                  </body>
                  </html>`;

                const formData = new FormData();
                const file = new File([fullHtml], "index.html", { type: "text/html" });
                formData.append("files", file);
                formData.append("omitBackground", "true");
                formData.append("printBackground", "false");
                formData.append("paperWidth", "8.5");
                formData.append("paperHeight", "11");
                formData.append("marginTop", "0");
                formData.append("marginBottom", "0");
                formData.append("marginLeft", "0");
                formData.append("marginRight", "0");
                formData.append("skipNetworkIdleEvent", "true");

                try {
                    // MÁGICA: Redirecionando para a porta 3005
                    const gotenbergRes = await fetch("http://localhost:3005/forms/chromium/convert/html", {
                        method: "POST",
                        body: formData,
                    });

                    if (gotenbergRes.ok) {
                        const gotenbergBuffer = await gotenbergRes.arrayBuffer();
                        const bufGotenberg = Buffer.from(gotenbergBuffer);

                        if (!isPdf(bufGotenberg)) {
                            throw new Error("Gotenberg falhou em gerar o PDF.");
                        }

                        const gotenbergPdf = await PDFDocument.load(gotenbergBuffer);
                        const gotenbergPages = gotenbergPdf.getPages();
                        const embeddedPages = await pdfDoc.embedPages(gotenbergPages);

                        for (let i = 0; i < embeddedPages.length; i++) {
                            const newPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                            newPage.drawPage(embeddedPages[i], { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
                            newPage.drawImage(bgImage, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, opacity: 0.3 });
                        }
                    } else {
                        const errorText = await gotenbergRes.text();
                        console.error('[Kit] Gotenberg responded with status:', gotenbergRes.status, errorText);
                    }
                } catch (err) {
                    console.error('[Kit] Error calling Gotenberg:', err);
                }
            }

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
                            const scale = Math.min(PAGE_WIDTH / image.width, PAGE_HEIGHT / image.height);
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
                    console.error('Error appending original doc', e);
                }
            }
        }

        const pdfBytes = await pdfDoc.save();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseKey) throw new Error('Supabase config missing');

        const supabase = createClient(supabaseUrl, supabaseKey);
        const fileName = `Certificate_Order_${order.id}_${Date.now()}.pdf`;
        const storagePath = `orders/delivered/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, pdfBytes, { contentType: 'application/pdf' });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storagePath);

        const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: {
                deliveryUrl: urlData.publicUrl,
                status: 'READY_FOR_REVIEW'
            }
        });

        return NextResponse.json({ success: true, deliveryUrl: urlData.publicUrl, order: updatedOrder });

    } catch (error: any) {
        console.error('PDF Kit Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
