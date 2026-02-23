'use server'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import prisma from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';

// Helper to wrap text into lines based on font width
function getLines(text: string, font: any, fontSize: number, maxWidth: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
            lines.push('');
            continue;
        }
        const words = paragraph.split(/\s+/);
        let currentLine = words[0] || '';

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = font.widthOfTextAtSize(currentLine + ' ' + word, fontSize);
            if (width < maxWidth) {
                currentLine += ' ' + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
    }
    return lines;
}

export async function generateDeliveryKit(orderId: number) {
    try {
        // 1. Fetch Order Data
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { documents: true }
        });

        if (!order) {
            return { success: false, error: 'Pedido não encontrado.' };
        }

        // 2. Load Static Assets
        const capaPath = path.join(process.cwd(), 'public', 'capa_certificacao_modelo.pdf');
        const timbradoPath = path.join(process.cwd(), 'public', 'timbrado_promobi.pdf');

        const capaBuffer = await fs.readFile(capaPath);
        const timbradoBuffer = await fs.readFile(timbradoPath);

        // Create main PDF
        const finalPdf = await PDFDocument.create();
        const font = await finalPdf.embedFont(StandardFonts.Helvetica);
        const fontBold = await finalPdf.embedFont(StandardFonts.HelveticaBold);

        // 3. Mount the Cover
        const capaPdf = await PDFDocument.load(capaBuffer);
        const [capaPage] = await finalPdf.copyPages(capaPdf, [0]);
        const addedCapaPage = finalPdf.addPage(capaPage);

        // Styling config for text
        const fontSize = 11;
        const marginX = 60;
        const marginYTop = 680; // Estimate below the header. The height of US Letter is usually 792.
        const marginYBottom = 100; // Leave space for footer
        const maxWidth = 490; // Approx US Letter width (612) minus margins (60*2)
        const lineHeight = fontSize * 1.5;

        // Strip HTML helper
        const stripHtml = (html: string) => html.replace(/<[^>]*>?/g, '').replace(/&nbsp;/g, ' ').trim();

        // 4. Mount Translation Pages
        for (const doc of order.documents) {
            if (doc.translatedText) {
                const plainText = stripHtml(doc.translatedText);
                const lines = getLines(plainText, font, fontSize, maxWidth);

                let currentY = marginYTop;
                let activePage = null;

                const letterheadPdf = await PDFDocument.load(timbradoBuffer);

                for (const line of lines) {
                    if (!activePage || currentY < marginYBottom) {
                        const [newPageTemplate] = await finalPdf.copyPages(letterheadPdf, [0]);
                        activePage = finalPdf.addPage(newPageTemplate);
                        currentY = marginYTop;
                    }

                    activePage.drawText(line, {
                        x: marginX,
                        y: currentY,
                        size: fontSize,
                        font: font,
                        color: rgb(0, 0, 0),
                    });

                    currentY -= lineHeight;
                }
            }
        }

        // 5. Append Original Documents
        for (const doc of order.documents) {
            if (doc.originalFileUrl && doc.originalFileUrl.startsWith('http')) {
                try {
                    const response = await fetch(doc.originalFileUrl);
                    if (response.ok) {
                        const originalBuffer = await response.arrayBuffer();
                        const originalPdf = await PDFDocument.load(originalBuffer);
                        const copiedPages = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices());
                        for (const copiedPage of copiedPages) {
                            finalPdf.addPage(copiedPage);
                        }
                    } else {
                        console.warn(`Could not fetch original document URL: ${doc.originalFileUrl}`);
                    }
                } catch (e) {
                    console.error(`Error loading original document PDF: ${doc.originalFileUrl}`, e);
                }
            }
        }

        // 6. Fill Cover Data
        const totalPages = finalPdf.getPageCount();
        const documentTypes = order.documents.map(d => d.exactNameOnDoc || d.docType).filter(Boolean).join(", ") || "Certified Translation";
        const dateStr = new Date().toLocaleDateString('en-US'); // MM/DD/YYYY

        // Coordinates below are heuristic guesses for a typical Promobi Cover Template:
        // We will adjust if they are off, but assuming around mid-page. 
        // Example: Y goes from 0 (bottom) to ~792 (top). 
        const textOptions = { size: 12, font: fontBold, color: rgb(0, 0, 0) };

        // Let's place these centrally where form fields usually sit.
        // Document Type
        addedCapaPage.drawText(documentTypes, { x: 250, y: 440, ...textOptions });
        // Order #
        addedCapaPage.drawText(orderId.toString().padStart(4, '0') + "-USA", { x: 250, y: 415, ...textOptions });
        // Number of pages
        addedCapaPage.drawText(totalPages.toString().padStart(2, '0'), { x: 250, y: 390, ...textOptions });
        // Dated
        addedCapaPage.drawText(dateStr, { x: 250, y: 365, ...textOptions });


        // 7. Save and Upload Final Flat PDF
        const pdfBytes = await finalPdf.save();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase Storage not configured.');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const safeName = `delivery_kit_${orderId}_${Date.now()}.pdf`;
        const storagePath = `orders/completed/${safeName}`;

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false });

        if (uploadError) {
            throw new Error(`Supabase Upload Error: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(storagePath);

        const deliveryUrl = urlData.publicUrl;

        // 8. Update Order Status
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'COMPLETED',
                deliveryUrl: deliveryUrl
            }
        });

        // 9. Potentially send email. Here we can resolve safely and let the frontend trigger `sendDelivery`
        return { success: true, deliveryUrl };

    } catch (error: any) {
        console.error('generateDeliveryKit Error:', error);
        return { success: false, error: error.message || 'Erro ao gerar o PDF.' };
    }
}
