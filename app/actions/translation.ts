
'use server'

import prisma from '@/lib/prisma';
import { translateDocument } from '@/lib/deepl';
import * as deepl from 'deepl-node';
import { NotificationService } from '@/lib/notification';

export async function initiateTranslation(orderId: number) {
    console.log(`[Translation] Initiating translation for Order #${orderId}`);

    try {
        // 1. Fetch Order and Documents
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { documents: true }
        });

        if (!order || !order.documents || order.documents.length === 0) {
            console.log(`[Translation] No documents found for Order #${orderId}`);
            return;
        }

        // 2. Determine Target Language
        // Logic: If user wants Notarization (US), target is English (en-US).
        // If user is just translating, we might need more logic or user input.
        // For now, default to en-US as per requirements for USCIS/Promobi context.
        const targetLang: deepl.TargetLanguageCode = 'en-US';

        // 3. Update Status to TRANSLATING
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'TRANSLATING' }
        });

        // 4. Translate Each Document
        let completedCount = 0;

        for (const doc of order.documents) {
            if (doc.translatedFileUrl) {
                console.log(`[Translation] Document #${doc.id} already translated. Skipping.`);
                completedCount++;
                continue;
            }

            console.log(`[Translation] Translating Document #${doc.id} (${doc.docType})...`);

            // Assume filename from URL or docType
            const filename = doc.exactNameOnDoc || `doc-${doc.id}.pdf`;

            try {
                const result = await translateDocument(doc.originalFileUrl, filename, targetLang);

                if (result.translatedUrl) {
                    await prisma.document.update({
                        where: { id: doc.id },
                        data: {
                            translatedFileUrl: result.translatedUrl,
                            // We could also store text if we did text translation, but we did document.
                        }
                    });
                    completedCount++;
                } else {
                    console.error(`[Translation] Failed to translate Document #${doc.id}: ${result.error}`);
                }

            } catch (err) {
                console.error(`[Translation] Exception processing Document #${doc.id}:`, err);
            }
        }

        // 5. Update Status based on completion
        // If at least one doc translated (or all), move to REVIEW.
        // If errors, maybe stay in TRANSLATING or MANUAL_INTERVENTION.

        // ... (existing imports)

        if (completedCount > 0) {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'READY_FOR_REVIEW' }
            });
            console.log(`[Translation] Order #${orderId} moved to READY_FOR_REVIEW.`);

            // Notify Admin
            await NotificationService.notifyTranslationReady(order);

        } else {
            console.warn(`[Translation] Order #${orderId} had no successful translations.`);
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'MANUAL_TRANSLATION_NEEDED' }
            });
        }

    } catch (error) {
        console.error(`[Translation] Critical error for Order #${orderId}:`, error);
    }
}
