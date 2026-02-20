/**
 * app/api/notifications/route.ts
 * Internal API endpoint to trigger transactional emails.
 * Called from Server Actions or admin UI — NOT exposed publicly.
 *
 * POST body: { trigger, ...props }
 *
 * Triggers:
 *   - "order_received"        → sendOrderReceivedEmail
 *   - "payment_confirmed"     → sendPaymentConfirmedEmail
 *   - "translation_started"   → sendTranslationStartedEmail
 *   - "delivery"              → sendDeliveryEmail
 */
import { NextRequest, NextResponse } from 'next/server';
import {
    sendOrderReceivedEmail,
    sendPaymentConfirmedEmail,
    sendTranslationStartedEmail,
    sendDeliveryEmail,
} from '@/lib/mail';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { trigger, ...props } = body;

        if (!trigger) {
            return NextResponse.json({ error: 'Missing trigger' }, { status: 400 });
        }

        let result;

        switch (trigger) {
            case 'order_received':
                result = await sendOrderReceivedEmail(props);
                break;
            case 'payment_confirmed':
                result = await sendPaymentConfirmedEmail(props);
                break;
            case 'translation_started':
                result = await sendTranslationStartedEmail(props);
                break;
            case 'delivery':
                result = await sendDeliveryEmail(props);
                break;
            default:
                return NextResponse.json({ error: `Unknown trigger: ${trigger}` }, { status: 400 });
        }

        return NextResponse.json({ ok: true, result });

    } catch (error: any) {
        console.error('[notifications] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
