/**
 * lib/mail.ts
 * Centralised Resend email sender.
 * All business logic lives in lib/emails/*.ts templates.
 */
import { Resend } from 'resend';
import { renderOrderReceived, type OrderReceivedProps } from './emails/order-received';
import { renderPaymentConfirmed, type PaymentConfirmedProps } from './emails/payment-confirmed';
import { renderTranslationStarted, type TranslationStartedProps } from './emails/translation-started';
import { renderDelivery, type DeliveryProps } from './emails/delivery';

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');

// Sender address – change to your verified domain once set up
const FROM = 'Promobi <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'wdangelo81@gmail.com';

// ── Helper ─────────────────────────────────────────────────────────────────────
async function send(to: string, subject: string, html: string) {
    try {
        const data = await resend.emails.send({ from: FROM, to: [to], subject, html });
        console.log(`[mail] ✉ Sent to ${to}: "${subject}"`);
        return { success: true, data };
    } catch (error) {
        console.error(`[mail] ✗ Failed "${subject}" → ${to}:`, error);
        return { success: false, error };
    }
}

// ── 1. Order Received (pending payment) ───────────────────────────────────────
export async function sendOrderReceivedEmail(props: OrderReceivedProps) {
    const html = renderOrderReceived(props);
    return send(
        props.customerEmail as string,
        `Order #${props.orderId} Received — Promobi`,
        html
    );
}

// ── 2. Payment Confirmed ───────────────────────────────────────────────────────
export async function sendPaymentConfirmedEmail(props: PaymentConfirmedProps) {
    const html = renderPaymentConfirmed(props);
    return send(
        props.customerEmail,
        `✅ Payment Confirmed — Order #${props.orderId} | Promobi`,
        html
    );
}

// ── 3. Translation Started ─────────────────────────────────────────────────────
export async function sendTranslationStartedEmail(
    props: TranslationStartedProps & { customerEmail: string }
) {
    const html = renderTranslationStarted(props);
    return send(
        props.customerEmail,
        `⚙️ We've Started Your Order #${props.orderId} — Promobi`,
        html
    );
}

// ── 4. Delivery ────────────────────────────────────────────────────────────────
export async function sendDeliveryEmail(props: DeliveryProps & { customerEmail: string }) {
    const html = renderDelivery(props);
    return send(
        props.customerEmail,
        `🎉 Your Documents Are Ready — Order #${props.orderId} | Promobi`,
        html
    );
}

// ── Admin: Translation ready for review ───────────────────────────────────────
interface AdminReviewEmailProps {
    orderId: number;
    customerName: string;
    adminEmail?: string;
}

export async function sendAdminReviewEmail({
    orderId,
    customerName,
    adminEmail = ADMIN_EMAIL,
}: AdminReviewEmailProps) {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://promobi.vercel.app';
    const dashboardUrl = `${APP_URL}/admin/orders/${orderId}`;

    const html = `<!DOCTYPE html><html><head><style>
        body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f8fafc;margin:0;padding:0;}
        .card{max-width:560px;margin:40px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);}
        .hdr{background:#1e293b;padding:24px 32px;text-align:center;}
        .hdr h2{color:#f59e0b;margin:0;font-size:18px;}
        .body{padding:36px 32px;color:#334155;line-height:1.6;}
        .details{background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;padding:18px 22px;margin:20px 0;}
        .btn{display:inline-block;background:#3b82f6;color:#fff!important;text-decoration:none;
             padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;}
    </style></head><body>
    <div class="card">
        <div class="hdr"><h2>⚡ Admin Action Required</h2></div>
        <div class="body">
            <p><strong>A translation is ready for your review:</strong></p>
            <div class="details">
                <p style="margin:0"><strong>Order:</strong> #${orderId}</p>
                <p style="margin:6px 0 0"><strong>Client:</strong> ${customerName}</p>
                <p style="margin:6px 0 0"><strong>Status:</strong> Awaiting Review</p>
            </div>
            <p style="text-align:center;margin-top:28px;">
                <a href="${dashboardUrl}" class="btn">Review Now →</a>
            </p>
        </div>
    </div></body></html>`;

    return send(adminEmail, `[Action Required] Review Translation #${orderId}`, html);
}

// ── Order confirmation (legacy alias kept for existing callers) ────────────────
export async function sendOrderConfirmationEmail({
    orderId, customerName, customerEmail, hasTranslation, hasNotary
}: {
    orderId: number; customerName: string; customerEmail: string;
    hasTranslation: boolean; hasNotary: boolean;
}) {
    return sendPaymentConfirmedEmail({
        orderId,
        customerName,
        customerEmail,
        serviceType: hasNotary ? 'notarization' : 'translation',
        totalAmount: 0,
    });
}
