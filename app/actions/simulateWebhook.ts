'use server'

import prisma from '../../lib/prisma';
import { confirmPayment } from './confirm-payment';

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
        // Forwards to the canonical payment confirmation path, which triggers
        // the Anthropic translation edge function — same as a real Stripe webhook.
        const result = await confirmPayment(orderId, 'STRIPE');
        return { success: result.success, translationResult: result };
    } catch (error) {
        console.error("Simulation Error:", error);
        return { success: false, error: String(error) };
    }
}
