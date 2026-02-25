'use server'

import * as deepl from 'deepl-node';
import prisma from '../../lib/prisma';

// Helper to download file from URL to Buffer
async function downloadFile(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
}

// Returns true if the document is a PDF based on docType, filename, or storage URL.
// docType is usually a label like "Certidão de Nascimento", so URL is the most reliable signal.
function isPDF(doc: { docType?: string | null; exactNameOnDoc?: string | null; originalFileUrl?: string | null }): boolean {
    return (
        doc.docType?.toLowerCase().includes('pdf') ||
        doc.exactNameOnDoc?.toLowerCase().endsWith('.pdf') ||
        doc.originalFileUrl?.toLowerCase().includes('.pdf') ||
        false
    );
}

export async function generateTranslationDraft(orderId: number) {
    console.log(`[AutoTranslation] Starting for Order #${orderId}`);

    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { documents: true }
        });

        if (!order) {
            console.error(`[AutoTranslation] Order #${orderId} not found`);
            return { success: false, error: 'Order not found' };
        }

        // Mark order as actively translating immediately so the Workbench
        // shows the correct state and the retry button becomes visible on errors.
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'TRANSLATING' }
        });

        // Initialize DeepL
        const authKey = process.env.DEEPL_API_KEY;
        if (!authKey) {
            console.error("[AutoTranslation] Missing DEEPL_API_KEY — marking order as MANUAL_TRANSLATION_NEEDED");
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'MANUAL_TRANSLATION_NEEDED' }
            });
            return { success: false, error: 'Missing API Key' };
        }

        const translator = new deepl.Translator(authKey);
        let completedCount = 0;
        let errorCount = 0;

        // Process each document
        for (const doc of order.documents) {
            try {
                if (!doc.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') {
                    console.log(`[AutoTranslation] Document #${doc.id} has no file yet — skipping.`);
                    continue;
                }

                console.log(`[AutoTranslation] Processing Document #${doc.id} (${doc.exactNameOnDoc ?? doc.docType})`);

                // 1. Download
                const dataBuffer = await downloadFile(doc.originalFileUrl);

                // 2. Extract Text — PDF only (OCR for images is out of scope for now)
                let extractedText = '';
                if (isPDF(doc)) {
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
                    const data = await pdfParse(dataBuffer);
                    extractedText = data.text;
                    console.log(`[AutoTranslation] Extracted ${extractedText.length} chars from Doc #${doc.id}`);
                } else {
                    console.warn(`[AutoTranslation] Doc #${doc.id} is not a PDF (docType="${doc.docType}", url="${doc.originalFileUrl}") — marking as needs_manual.`);
                    await prisma.document.update({
                        where: { id: doc.id },
                        data: { translation_status: 'needs_manual' }
                    });
                    continue;
                }

                if (!extractedText || extractedText.trim().length === 0) {
                    console.warn(`[AutoTranslation] No text extracted from Doc #${doc.id} — likely a scanned image PDF. Marking as needs_manual.`);
                    await prisma.document.update({
                        where: { id: doc.id },
                        data: { translation_status: 'needs_manual' }
                    });
                    continue;
                }

                // 3. Translate to American English
                const result = await translator.translateText(extractedText, null, 'en-US');
                const translatedText = Array.isArray(result) ? result.map(r => r.text).join('\n') : result.text;

                // 4. Save Draft — also set translation_status so the Workbench
                //    badge shows the correct "TRANSLATED" state (not "PENDING").
                await prisma.document.update({
                    where: { id: doc.id },
                    data: {
                        translatedText,
                        translation_status: 'translated',
                    }
                });

                completedCount++;
                console.log(`[AutoTranslation] Saved draft for Doc #${doc.id}`);

            } catch (err) {
                console.error(`[AutoTranslation] Error processing document #${doc.id}:`, err);
                await prisma.document.update({
                    where: { id: doc.id },
                    data: { translation_status: 'error' }
                }).catch(updateErr => console.error(`[AutoTranslation] Failed to mark doc #${doc.id} as error:`, updateErr));
                errorCount++;
            }
        }

        // Final Status Update
        if (completedCount > 0) {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'READY_FOR_REVIEW' }
            });
            console.log(`[AutoTranslation] ✅ Order #${orderId} → READY_FOR_REVIEW (${completedCount} docs, ${errorCount} errors)`);
            return { success: true, count: completedCount };
        } else {
            console.error(`[AutoTranslation] ❌ Order #${orderId} — no documents processed (${errorCount} errors). Marking MANUAL_TRANSLATION_NEEDED.`);
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'MANUAL_TRANSLATION_NEEDED' }
            });
            return { success: false, error: 'No documents processed' };
        }

    } catch (error) {
        console.error("[AutoTranslation] Critical Error:", error);
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'MANUAL_TRANSLATION_NEEDED' }
        });
        return { success: false, error: String(error) };
    }
}
