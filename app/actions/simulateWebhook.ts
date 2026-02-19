'use server'

import prisma from '../../lib/prisma';
import { generateTranslationDraft } from './generateTranslation';

export async function saveTranslationDraft(docId: number, content: string) {
    try {
        await prisma.document.update({
            where: { id: docId },
            data: { translatedText: content }
        });
        return { success: true };
    } catch (error) {
        console.error("Save Draft Error:", error);
        return { success: false, error: String(error) };
    }
}

export async function simulateWebhook(orderId: number) {
    try {
        console.log(`[Simulation] Simulating Payment Confirmation for Order #${orderId}`);

        // 1. Mark as PAID
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'PAID' }
        });

        // 2. Trigger Automation
        const result = await generateTranslationDraft(orderId);

        return { success: true, translationResult: result };
    } catch (error) {
        console.error("Simulation Error:", error);
        return { success: false, error: String(error) };
    }
}
