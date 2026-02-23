import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import Stripe from 'stripe';
import { generateTranslationDraft } from '../../../../app/actions/generateTranslation';
import { NotificationService } from '../../../../lib/notification';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
    // Matching typical version used in other project files
    apiVersion: '2024-12-18.acacia' as any,
});

export async function POST(request: NextRequest) {
    console.log("[Stripe Webhook] 🔔 Webhook received!");

    const payload = await request.text();
    const sig = request.headers.get('stripe-signature');

    let event;

    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            console.error("[Stripe Webhook] ❌ Missing STRIPE_WEBHOOK_SECRET");
            return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
        }
        if (!sig) {
            console.error("[Stripe Webhook] ❌ Missing Signature");
            return NextResponse.json({ error: "Missing Signature" }, { status: 400 });
        }

        // 1. Validate signature
        event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log(`[Stripe Webhook] ✅ Signature verified for event: ${event.type}`);

    } catch (err: any) {
        console.error(`[Stripe Webhook] ❌ Signature verification failed: ${err.message}`);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    // 2. Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[Stripe Webhook] 💳 checkout.session.completed for session: ${session.id}`);

        // Extract Order ID from metadata
        const orderIdString = session.metadata?.orderId || session.client_reference_id;
        const orderId = orderIdString ? parseInt(orderIdString) : null;

        if (orderId && !isNaN(orderId)) {
            console.log(`[Stripe Webhook] 📦 Processing payment success for Order #${orderId}`);

            try {
                // 3. Mark as PAID in Supabase via Prisma
                const order = await prisma.order.update({
                    where: { id: orderId },
                    data: { status: 'PAID' },
                    include: { user: true }
                });

                console.log(`[Stripe Webhook] 💾 Order #${orderId} successfully updated to status PAID in Supabase.`);

                // (Optional) Notify Client 
                try {
                    await NotificationService.notifyOrderCreated(order);
                } catch (e) {
                    console.error("[Stripe Webhook] Warning: Failed to send confirmation email.", e);
                }

                // 4. Trigger DeepL Automation (Async)
                if (order.hasTranslation) {
                    console.log(`[Stripe Webhook] 🤖 Triggering generateTranslationDraft (DeepL) for Order #${orderId}...`);

                    // Fire and forget so we don't timeout the webhook
                    generateTranslationDraft(orderId)
                        .then(result => {
                            if (result.success) {
                                console.log(`[Stripe Webhook] ✅ DeepL Translation completed for Order #${orderId}.`);
                            } else {
                                console.error(`[Stripe Webhook] ⚠️ DeepL Translation failed for Order #${orderId}:`, result.error);
                            }
                        })
                        .catch(err => {
                            console.error(`[Stripe Webhook] ❌ Exception in DeepL trigger for Order #${orderId}:`, err);
                        });
                } else {
                    console.log(`[Stripe Webhook] ℹ️ Skipping DeepL: Order #${orderId} has no translations flag.`);
                }

            } catch (dbError) {
                console.error(`[Stripe Webhook] ❌ Failed to update Supabase for Order #${orderId}:`, dbError);
                return NextResponse.json({ error: "Database Update Error" }, { status: 500 });
            }

        } else {
            console.error(`[Stripe Webhook] ❌ No valid orderId found in session metadata or client_reference_id. Data:`, session.metadata);
        }
    } else {
        console.log(`[Stripe Webhook] ℹ️ Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
}
