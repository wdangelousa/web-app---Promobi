import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { generateTranslationDraft } from '../../../../app/actions/generateTranslation';
import Stripe from 'stripe';

// Initialize Stripe
// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
    apiVersion: '2024-12-18.acacia' as any, // Use latest or matching version
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
    const payload = await request.text();
    const sig = request.headers.get('stripe-signature');

    let event;

    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            console.error("Missing STRIPE_WEBHOOK_SECRET");
            return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
        }
        if (!sig) {
            return NextResponse.json({ error: "Missing Signature" }, { status: 400 });
        }
        event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object as Stripe.Checkout.Session;
            console.log('Payment checkout.session.completed:', session.id);

            // Retrieve Order ID from metadata
            const orderId = session.metadata?.orderId ? parseInt(session.metadata.orderId) : null;
            if (orderId) {
                console.log(`Processing Order #${orderId} payment confirmation.`);
                const { confirmPayment } = await import('@/app/actions/confirm-payment');
                await confirmPayment(orderId, 'STRIPE');
            }
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    return NextResponse.json({ received: true });
}
