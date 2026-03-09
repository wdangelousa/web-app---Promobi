import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import prisma from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

// ── Text utilities (Ported from generateDeliveryKit for consistency) ────────────────

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
        .trim();
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

function sanitizeForWinAnsi(text: string): string {
    if (!text) return '';
    return text
        .replace(/→/g, '->')
        .replace(/←/g, '<-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/…/g, '...')
        .replace(/•/g, '-')
        .replace(/[^\x00-\xFF]/g, '');
}

function isImageUrl(url: string): boolean {
    const lower = url.toLowerCase().split('?')[0];
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
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

        // Initialize PDF Document
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const black = rgb(0, 0, 0);
        const grey = rgb(0.3, 0.3, 0.3);

        const PAGE_WIDTH = 612;
        const PAGE_HEIGHT = 792;
        const MARGIN = 70;

        // ── 1. Create Certificate Cover Page (Pure White) ─────────────────────────
        const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

        // Load Assets
        const publicDir = path.join(process.cwd(), 'public');

        // Main Logo: Scaled down by 30%
        const logoBytes = await fs.readFile(path.join(publicDir, 'logo-promobidocs.png'));
        const logoImg = await pdfDoc.embedPng(logoBytes);
        const originalWidth = 140; // Estimated from current context
        const originalHeight = (logoImg.height / logoImg.width) * originalWidth;
        const scaledWidth = originalWidth * 0.7; // -30%
        const scaledHeight = originalHeight * 0.7;

        coverPage.drawImage(logoImg, {
            x: MARGIN,
            y: PAGE_HEIGHT - scaledHeight - 40,
            width: scaledWidth,
            height: scaledHeight,
        });

        // Title
        coverPage.drawText('CERTIFICATION OF TRANSLATION ACCURACY', {
            x: MARGIN,
            y: PAGE_HEIGHT - 160,
            size: 16,
            font: boldFont,
            color: black,
        });

        // Metadata Grid (Strict Alignment)
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

        // Count pages logic
        const totalPagesCount = order.documents.length; // Approximate for metadata, or dynamic later
        drawGridLine('Number of pages:', String(totalPagesCount).padStart(2, '0'));
        drawGridLine('Order #:', String(order.id + 1000).padStart(4, '0') + '-USA');

        // Certification Body Text
        currentY -= 20;
        const certText = `I, the undersigned, hereby certify that I am fluent in English and the source language (${sourceLang}) of the attached documents, and that the attached translation is a true, accurate, and complete translation of the original document attached hereto.`;

        const wrapWidth = PAGE_WIDTH - (MARGIN * 2);
        const lines = wrapLines(certText, font, 11, wrapWidth);
        for (const line of lines) {
            coverPage.drawText(line, { x: MARGIN, y: currentY, size: 11, font, lineHeight: 16 });
            currentY -= 18;
        }

        // Signature Section
        currentY -= 50;
        const signatureBytes = await fs.readFile(path.join(publicDir, 'assinatura-isabele.png.jpg'));
        const signatureImg = await pdfDoc.embedJpg(signatureBytes);
        coverPage.drawImage(signatureImg, {
            x: MARGIN,
            y: currentY,
            width: 150,
            height: 45,
        });

        // Discreet ATA Logo
        const ataLogoBytes = await fs.readFile(path.join(publicDir, 'logo-ata.png'));
        const ataImg = await pdfDoc.embedPng(ataLogoBytes);
        coverPage.drawImage(ataImg, {
            x: MARGIN + 180,
            y: currentY + 5,
            width: 40,
            height: 40,
        });

        currentY -= 15;
        coverPage.drawText('___________________________________', { x: MARGIN, y: currentY, size: 12, font });
        currentY -= 20;
        coverPage.drawText('Promobi Certified Translator', { x: MARGIN, y: currentY, size: 11, font: boldFont });
        currentY -= 15;
        coverPage.drawText(`Dated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { x: MARGIN, y: currentY, size: 10, font });

        // Consolidated Footer
        const footerText = '13558 Village Park Dr, Orlando/FL, 32837 | +1 321 324-5851 | translator@promobidocs.com | www.promobidocs.com';
        const footerW = font.widthOfTextAtSize(footerText, 8.5);
        coverPage.drawText(footerText, {
            x: (PAGE_WIDTH - footerW) / 2,
            y: 35,
            size: 8.5,
            font,
            color: grey
        });

        // ── 2. Add Document Pages with Advanced Hardware Logic ────────────────────

        // Load Letterhead for internal pages
        const timbradoBytes = await fs.readFile(path.join(publicDir, 'letterhead promobi.pdf'));
        const timbradoPdf = await PDFDocument.load(timbradoBytes, { ignoreEncryption: true });

        for (const doc of order.documents) {

            // A. Handle Translation
            if (doc.externalTranslationUrl) {
                // External PDF
                try {
                    const extRes = await fetch(doc.externalTranslationUrl);
                    if (extRes.ok) {
                        const extBuf = Buffer.from(await extRes.arrayBuffer());
                        const extPdf = await PDFDocument.load(extBuf, { ignoreEncryption: true });
                        const embeddedPages = await pdfDoc.embedPages(extPdf.getPages());

                        for (const embeddedPage of embeddedPages) {
                            const [bgPage] = await pdfDoc.copyPages(timbradoPdf, [0]);
                            const p = pdfDoc.addPage(bgPage);
                            const scale = Math.min(PAGE_WIDTH / embeddedPage.width, PAGE_HEIGHT / embeddedPage.height);
                            p.drawPage(embeddedPage, {
                                x: (PAGE_WIDTH - embeddedPage.width * scale) / 2,
                                y: (PAGE_HEIGHT - embeddedPage.height * scale) / 2,
                                width: embeddedPage.width * scale,
                                height: embeddedPage.height * scale,
                            });
                        }
                    }
                } catch (e) {
                    console.error('Error appending external translation', e);
                }
            } else if (doc.translatedText) {
                // Inline AI Translation
                const plainText = sanitizeForWinAnsi(stripHtml(doc.translatedText));
                const textLines = wrapLines(plainText, font, 11, wrapWidth);
                const linesPerPage = 35;
                const totalTextPages = Math.ceil(textLines.length / linesPerPage);

                for (let i = 0; i < totalTextPages; i++) {
                    const [bgPage] = await pdfDoc.copyPages(timbradoPdf, [0]);
                    const p = pdfDoc.addPage(bgPage);
                    const pageLines = textLines.slice(i * linesPerPage, (i + 1) * linesPerPage);
                    let textY = PAGE_HEIGHT - 120;
                    for (const line of pageLines) {
                        p.drawText(line, { x: MARGIN, y: textY, size: 11, font, lineHeight: 15 });
                        textY -= 15;
                    }
                }
            }

            // B. Handle Original Document (with metadata and rotations)
            if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
                try {
                    const origRes = await fetch(doc.originalFileUrl);
                    if (origRes.ok) {
                        const origBuf = Buffer.from(await origRes.arrayBuffer());
                        const rotationsMap = (doc.pageRotations as any) || {};

                        if (isImageUrl(doc.originalFileUrl)) {
                            const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                            let image;
                            if (doc.originalFileUrl.toLowerCase().includes('.png')) {
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
                        } else {
                            const origPdf = await PDFDocument.load(origBuf, { ignoreEncryption: true });
                            const copiedPages = await pdfDoc.copyPages(origPdf, origPdf.getPageIndices());
                            copiedPages.forEach((p, idx) => {
                                const rot = rotationsMap[String(idx)] || p.getRotation().angle;
                                p.setRotation(degrees(rot));
                                pdfDoc.addPage(p);
                            });
                        }
                    }
                } catch (e) {
                    console.error('Error appending original doc', e);
                }
            }
        }

        // ── 3. Save & Upload ──────────────────────────────────────────────────────
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

        // Update Order
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
