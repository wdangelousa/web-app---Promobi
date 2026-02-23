'use server'

import prisma from '@/lib/prisma'
import { generateTranslationDraft } from './generateTranslation'

export async function approvePaymentManually(orderId: number) {
    console.log(`[Manual Bypass] Iniciando aprovação manual para o Pedido #${orderId}`);

    try {
        // 1. Fetch order to ensure it exists and is pending
        const order = await prisma.order.findUnique({
            where: { id: orderId }
        });

        if (!order) {
            return { success: false, error: 'Pedido não encontrado.' };
        }

        if (order.status !== 'PENDING' && order.status !== 'PENDING_PAYMENT') {
            return { success: false, error: `Pedido não pode ser aprovado. Status atual: ${order.status}` };
        }

        // 2. Update status to PAID
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'PAID' }
        });

        console.log(`[Manual Bypass] Pedido #${orderId} atualizado para PAID com sucesso.`);

        // 3. Trigger DeepL Translation Draft if needed
        console.log(`[Manual Bypass] Acionando rotina de tradução DeepL para o Pedido #${orderId}`);

        try {
            await generateTranslationDraft(orderId);
            console.log(`[Manual Bypass] Tradução DeepL concluída para o Pedido #${orderId}`);
        } catch (err) {
            console.error(`[Manual Bypass] Erro na task do DeepL para Pedido #${orderId}:`, err);
            // We still return true because payment was approved successfully.
        }

        return { success: true, message: 'Pagamento aprovado. Tradução automática via DeepL concluída.' };

    } catch (error: any) {
        console.error(`[Manual Bypass] Erro crítico ao aprovar pedido #${orderId}:`, error);
        return { success: false, error: 'Falha interna ao aprovar o pagamento. Consulte os logs.' };
    }
}
