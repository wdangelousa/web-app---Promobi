'use server'

import * as deepl from 'deepl-node';
const pdf = require('pdf-parse');
import prisma from '../../lib/prisma';
import { OrderStatus } from '@prisma/client';

// Helper to download file from URL to Buffer
async function downloadFile(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
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

        // Initialize DeepL
        const authKey = process.env.DEEPL_API_KEY;
        if (!authKey) {
            console.error("[AutoTranslation] Missing DEEPL_API_KEY");
            // We don't fail the whole flow, just mark as manual needed
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
                    console.log(`[AutoTranslation] Document #${doc.id} has no file yet.`);
                    continue;
                }

                console.log(`[AutoTranslation] Processing Document #${doc.id} (${doc.exactNameOnDoc})`);

                // 1. Download
                const dataBuffer = await downloadFile(doc.originalFileUrl);

                // 2. Extract Text
                // Check if it's a PDF
                let extractedText = '';
                if (doc.docType?.toLowerCase().includes('pdf') || doc.exactNameOnDoc?.toLowerCase().endsWith('.pdf')) {
                    const data = await pdf(dataBuffer);
                    extractedText = data.text;
                } else {
                    // TODO: Implement OCR for images if needed. For now, skip or use simple text if it supported.
                    // For now, only PDF text extraction is robustly supported via pdf-parse.
                    console.warn(`[AutoTranslation] Skipping non-PDF Text Extraction for Doc #${doc.id}`);
                    continue;
                }

                if (!extractedText || extractedText.trim().length === 0) {
                    console.warn(`[AutoTranslation] No text extracted from Doc #${doc.id}`);
                    continue;
                }

                // 3. Translate
                // target_lang: 'en-US' (American English)
                const result = await translator.translateText(extractedText, null, 'en-US');
                const translatedText = Array.isArray(result) ? result.map(r => r.text).join('\n') : result.text;

                // 4. Save Draft
                await prisma.document.update({
                    where: { id: doc.id },
                    data: { translatedText }
                });

                completedCount++;
                console.log(`[AutoTranslation] Saved draft for Doc #${doc.id}`);

            } catch (err) {
                console.error(`[AutoTranslation] Error processing document #${doc.id}:`, err);
                errorCount++;
            }
        }

        // Final Status Update
        if (completedCount > 0) {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'READY_FOR_REVIEW' }
            });
            return { success: true, count: completedCount };
        } else {
            // If failed to process any, mark manual
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
