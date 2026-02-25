'use server'

import { confirmPayment } from './confirm-payment'

export async function approvePaymentManually(orderId: number, confirmedByName: string = 'Isabele') {
    console.log(`[Manual Bypass] Iniciando aprovação manual para o Pedido #${orderId} por ${confirmedByName}`);

    // Delegate to the unified confirmPayment action (ZELLE path) which:
    //   1. Sets order status → TRANSLATING
    //   2. Triggers DeepL via Supabase Edge Function (non-blocking)
    //   3. Notifies Isabele via email
    //   4. Sends client confirmation email
    const result = await confirmPayment(orderId, 'ZELLE', {
        reference: 'MANUAL-BYPASS',
        confirmedBy: confirmedByName,
        notes: 'Aprovação manual pelo painel de administração',
    });

    if (result.success) {
        console.log(`[Manual Bypass] ✅ Pedido #${orderId} aprovado com sucesso via confirmPayment.`);
        return { success: true, message: 'Pagamento aprovado. Tradução automática via DeepL acionada.' };
    } else {
        console.error(`[Manual Bypass] ❌ Falha ao aprovar Pedido #${orderId}:`, result.error);
        return { success: false, message: result.error ?? 'Falha interna ao aprovar o pagamento. Consulte os logs da Vercel.' };
    }
}
