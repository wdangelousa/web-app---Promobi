import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import prisma from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';

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

        // Initialize a new PDF Document
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // 1. Create Certificate of Translation Page
        const certPage = pdfDoc.addPage();
        const { width, height } = certPage.getSize();

        certPage.drawText('CERTIFICATE OF TRANSLATION', {
            x: 50,
            y: height - 100,
            size: 24,
            font: boldFont,
            color: rgb(0, 0, 0),
        });

        certPage.drawText(`Order ID: #${order.id}`, { x: 50, y: height - 150, size: 12, font });
        certPage.drawText(`Client: ${order.user.fullName}`, { x: 50, y: height - 170, size: 12, font });
        certPage.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: 50, y: height - 190, size: 12, font });

        const certificationText = `I, the undersigned, hereby certify that I am fluent in English and the source \n` +
            `language of the attached documents, and that the attached translation is a true, \n` +
            `accurate, and complete translation of the original document attached hereto.`;

        certPage.drawText(certificationText, {
            x: 50,
            y: height - 250,
            size: 11,
            font,
            lineHeight: 16,
        });

        certPage.drawText('Signature: ___________________________', { x: 50, y: height - 350, size: 12, font });
        certPage.drawText('Promobi Certified Translator', { x: 50, y: height - 380, size: 12, font: boldFont });

        // 2. Attach Documents
        for (const doc of order.documents) {
            // Helper to fetch and append PDF pages
            const appendPdfFromUrl = async (url: string) => {
                if (!url || url === 'PENDING_UPLOAD') return;
                try {
                    const response = await fetch(url);
                    if (!response.ok) return;

                    const contentType = response.headers.get('content-type');
                    if (!contentType?.includes('pdf')) {
                        // Skip non-PDFs for now, or just add a placeholder page
                        const p = pdfDoc.addPage();
                        p.drawText(`Attached file is not a PDF: ${url.split('/').pop()}`, { x: 50, y: height - 50, size: 10, font });
                        return;
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const externalPdf = await PDFDocument.load(arrayBuffer);
                    const copiedPages = await pdfDoc.copyPages(externalPdf, externalPdf.getPageIndices());
                    copiedPages.forEach((p) => pdfDoc.addPage(p));
                } catch (e) {
                    console.error('Error appending PDF', e);
                }
            };

            // Append Translation first, then Original
            if (doc.translatedFileUrl) await appendPdfFromUrl(doc.translatedFileUrl);
            if (doc.originalFileUrl) await appendPdfFromUrl(doc.originalFileUrl);
        }

        // 3. Save combined PDF to Supabase
        const pdfBytes = await pdfDoc.save();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase configuration missing');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const fileName = `Certificate_Order_${order.id}_${Date.now()}.pdf`;
        const storagePath = `orders/delivered/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, pdfBytes, { contentType: 'application/pdf' });

        if (uploadError) {
            throw uploadError;
        }

        const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(storagePath);

        // 4. Update Order with deliveryUrl and status READY_FOR_REVIEW
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
