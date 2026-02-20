
'use server'

import prisma from '@/lib/prisma';
import { translateDocument } from '@/lib/deepl';
import * as deepl from 'deepl-node';
import { sendAdminReviewEmail } from '@/lib/mail';

export async function initiateTranslation(orderId: number) {
    console.log(`[Translation] Initiating for Order #${orderId}`);

    try {
        // 1. Fetch order + documents
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { documents: true, user: true },
        });

        if (!order) {
            console.warn(`[Translation] Order #${orderId} not found.`);
            return;
        }

        // 2. Filter out PENDING_UPLOAD or empty URLs
        const translatableDoc = order.documents.filter(
            (d) => d.originalFileUrl && d.originalFileUrl !== 'PENDING_UPLOAD'
        );

        if (translatableDoc.length === 0) {
            console.warn(`[Translation] Order #${orderId} has no uploaded documents. Marking MANUAL_TRANSLATION_NEEDED.`);
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'MANUAL_TRANSLATION_NEEDED' },
            });
            // Notify admin so they can handle it manually
            await sendAdminReviewEmail({
                orderId,
                customerName: order.user.fullName,
            });
            return;
        }

        // 3. Mark order as TRANSLATING
        await prisma.order.update({ where: { id: orderId }, data: { status: 'TRANSLATING' } });

        const targetLang: deepl.TargetLanguageCode = 'en-US';
        let completedCount = 0;

        // 4. Translate each document (skip already-translated)
        for (const doc of translatableDoc) {
            if (doc.translatedFileUrl) {
                console.log(`[Translation] Doc #${doc.id} already translated — skipping.`);
                completedCount++;
                continue;
            }

            const filename = doc.exactNameOnDoc || `doc-${doc.id}.pdf`;
            console.log(`[Translation] Translating Doc #${doc.id} (${filename})…`);

            try {
                const result = await translateDocument(doc.originalFileUrl, filename, targetLang);

                if (result.translatedUrl) {
                    await prisma.document.update({
                        where: { id: doc.id },
                        data: { translatedFileUrl: result.translatedUrl },
                    });
                    completedCount++;
                    console.log(`[Translation] Doc #${doc.id} ✓`);
                } else {
                    console.error(`[Translation] Doc #${doc.id} failed: ${result.error}`);
                }
            } catch (err) {
                console.error(`[Translation] Exception on Doc #${doc.id}:`, err);
            }
        }

        // 5. Update order status based on results
        if (completedCount > 0) {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'READY_FOR_REVIEW' },
            });
            console.log(`[Translation] Order #${orderId} → READY_FOR_REVIEW (${completedCount}/${translatableDoc.length} docs)`);

            // Notify admin to review
            await sendAdminReviewEmail({
                orderId,
                customerName: order.user.fullName,
            });

        } else {
            console.warn(`[Translation] Order #${orderId} — all translations failed. → MANUAL_TRANSLATION_NEEDED`);
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'MANUAL_TRANSLATION_NEEDED' },
            });
            await sendAdminReviewEmail({
                orderId,
                customerName: order.user.fullName,
            });
        }

    } catch (error) {
        console.error(`[Translation] Critical error for Order #${orderId}:`, error);
    }
}
