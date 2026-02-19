import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import Stripe from 'stripe';
import { sendOrderConfirmationEmail } from '@/lib/mail';

// Initialize Stripe
// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
    apiVersion: '2025-01-27.acacia' as any, // Updated to latest or prompt-compatible
});

export async function POST(request: NextRequest) {
    const payload = await request.text();
    const sig = request.headers.get('stripe-signature');

    // --- STRIPE HANDLER ---
    if (sig) {
        let event;

        try {
            if (!process.env.STRIPE_WEBHOOK_SECRET) {
                console.error("Missing STRIPE_WEBHOOK_SECRET");
                return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
            }
            event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
        } catch (err: any) {
            console.error(`Webhook signature verification failed: ${err.message}`);
            return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;
            console.log('Stripe Payment checkout.session.completed:', session.id);

            const orderId = session.metadata?.orderId ? parseInt(session.metadata.orderId) : null;

            if (orderId) {
                await processPaymentSuccess(orderId, 'STRIPE');
            }
        }

        return NextResponse.json({ received: true });
    }

    // --- PARCELADO USA HANDLER (No Stripe Signature) ---
    // Assuming Parcelado sends a JSON body with 'status' and 'order_id' or similar.
    // We parse the payload as JSON for this check.
    try {
        const body = JSON.parse(payload);

        // Simple check for Parcelado structure (adjust based on actual API docs)
        // User request: "receber a confirmação de status de pagamento aprovado"
        if (body.status === 'approved' && body.external_reference) {
            const orderId = parseInt(body.external_reference); // Assuming external_reference is our orderId

            if (!isNaN(orderId)) {
                console.log('Parcelado USA Payment approved:', orderId);
                await processPaymentSuccess(orderId, 'PARCELADO_USA');
                return NextResponse.json({ status: 'success' });
            }
        }
    } catch (e) {
        // Not a JSON body or not Parcelado
    }

    // Default fallback
    return NextResponse.json({ received: false, message: "Unrecognized webhook source" }, { status: 400 });
}

async function processPaymentSuccess(orderId: number, provider: string) {
    console.log(`Processing ${provider} success for Order #${orderId}`);

    try {
        // 1. Update Order Status in Prisma
        const order = await prisma.order.update({
            where: { id: orderId },
            data: { status: 'PAID' },
            include: { user: true } // Include user to get email/name
        });

        console.log(`Order #${orderId} marked as PAID.`);

        // 2. Action Post-Payment: Send Confirmation Email
        if (order.user?.email) {
            await sendOrderConfirmationEmail({
                orderId: order.id,
                customerName: order.user.fullName,
                customerEmail: order.user.email,
                hasTranslation: order.hasTranslation,
                hasNotary: order.hasNotary
            });
        }

        // 3. Trigger Automated Translation (Async)
        // We don't await this to avoid blocking the webhook response
        if (order.hasTranslation) {
            const { initiateTranslation } = await import('@/app/actions/translation');
            initiateTranslation(order.id).catch(err => console.error("Async translation trigger failed:", err));
        }

    } catch (error) {
        console.error(`Error processing payment for Order #${orderId}:`, error);
    }
}
