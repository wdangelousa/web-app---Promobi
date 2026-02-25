import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED — Este handler foi desativado.
 *
 * O webhook ativo do Stripe está em:
 *   /api/webhooks/payment-confirmation/route.ts
 *
 * Configure apenas esse endpoint no Stripe Dashboard.
 * Manter este arquivo evita erros 404, mas ele não processa nenhum evento.
 */
export async function POST(_request: NextRequest) {
    console.warn("[Stripe Webhook /stripe] ⚠️  Deprecated endpoint recebeu uma chamada. Configure o Stripe para usar /api/webhooks/payment-confirmation.");
    return NextResponse.json({ received: true, deprecated: true });
}
