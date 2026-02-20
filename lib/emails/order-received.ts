/**
 * lib/emails/order-received.ts
 * Triggered when a client submits an order (BRL WhatsApp or Stripe form)
 * before payment is confirmed. Sets expectations & builds trust.
 */
import { wrapEmail, brand } from './base';

export interface OrderReceivedProps {
    orderId: number | string;
    customerName: string;
    customerEmail: string;
    pageCount?: number;
    serviceType?: 'translation' | 'notarization';
    urgency?: 'normal' | 'urgent' | 'super_urgent';
    totalAmount: number;
    paymentMethod: 'USD_STRIPE' | 'BRL_WHATSAPP';
}

export function renderOrderReceived({
    orderId,
    customerName,
    pageCount = 1,
    serviceType = 'translation',
    urgency = 'normal',
    totalAmount,
    paymentMethod,
}: OrderReceivedProps): string {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://promobi.vercel.app';
    const isWhatsApp = paymentMethod === 'BRL_WHATSAPP';
    const urgencyMap = {
        normal: { label: 'Standard (2–3 business days)', color: '#64748b' },
        urgent: { label: 'Urgent (24 hours)', color: '#f59e0b' },
        super_urgent: { label: 'Super Urgent (12 hours)', color: '#ef4444' },
    };
    const serviceLabel = serviceType === 'notarization' ? 'Notarization Only' : 'Certified Translation';
    const urgencyInfo = urgencyMap[urgency];
    const brlEstimate = (totalAmount * 5.2).toFixed(2);

    const paymentInstructions = isWhatsApp
        ? `<div class="box" style="background:#f0fdf4;border-left:4px solid #22c55e;">
            <p style="font-size:14px;font-weight:700;color:#166534;margin-bottom:8px;">📱 Next Step: Complete Your Payment</p>
            <p style="font-size:13px;color:#15803d;line-height:1.6;">
                Your consultant will send you a Pix or installment payment link via WhatsApp shortly.
                Once confirmed, we will begin processing your documents immediately.
            </p>
           </div>`
        : `<div class="box" style="background:#eff6ff;border-left:4px solid #3b82f6;">
            <p style="font-size:14px;font-weight:700;color:#1e40af;margin-bottom:8px;">💳 Complete Your Stripe Payment</p>
            <p style="font-size:13px;color:#1d4ed8;line-height:1.6;">
                If you haven't been redirected yet, use the button below to complete checkout.
            </p>
           </div>`;

    const inner = `
<div class="hdr">
    <div class="hdr-logo">Promobi</div>
    <div class="hdr-sub">Certified Translation &amp; Notarization</div>
</div>
<div class="body">
    <p class="greeting">Hi, ${customerName}! 👋</p>
    <p class="para">
        We've received your order and our team is ready to get started.
        Here's a summary of what you requested:
    </p>

    <!-- Order details box -->
    <div class="box" style="background:#f8fafc;border:1px solid #e2e8f0;">
        <div class="box-row">
            <span class="box-label">Order ID</span>
            <span class="box-value">#${orderId}</span>
        </div>
        <div class="box-row">
            <span class="box-label">Service</span>
            <span class="box-value">${serviceLabel}</span>
        </div>
        <div class="box-row">
            <span class="box-label">Pages / Documents</span>
            <span class="box-value">${pageCount}</span>
        </div>
        <div class="box-row">
            <span class="box-label">Turnaround</span>
            <span class="box-value" style="color:${urgencyInfo.color};">${urgencyInfo.label}</span>
        </div>
        <div class="box-row">
            <span class="box-label">Total</span>
            <span class="box-value" style="color:${brand.primary};font-size:16px;">
                $${totalAmount.toFixed(2)} USD
                ${isWhatsApp ? `<span style="font-size:11px;color:#64748b;"> (≈ R$ ${brlEstimate})</span>` : ''}
            </span>
        </div>
    </div>

    ${paymentInstructions}

    ${isWhatsApp ? '' : `
    <div class="cta-wrap">
        <a href="${APP_URL}/meu-pedido" class="btn">View My Order</a>
    </div>`}

    <div class="divider"></div>
    <p class="para" style="font-size:13px;color:#94a3b8;">
        <strong style="color:${brand.slate};">Questions?</strong> Simply reply to this email or
        reach us on WhatsApp at +1 (407) 639-6154. We typically respond within 30 minutes during business hours.
    </p>
</div>`;

    return wrapEmail(inner);
}
