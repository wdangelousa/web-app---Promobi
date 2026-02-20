/**
 * lib/emails/payment-confirmed.ts
 * Triggered after Stripe webhook success or manual admin mark-as-paid.
 * This is the "money shot" email that reassures and excites the client.
 */
import { wrapEmail, brand } from './base';

export interface PaymentConfirmedProps {
    orderId: number;
    customerName: string;
    customerEmail: string;
    pageCount?: number;
    serviceType?: 'translation' | 'notarization';
    totalAmount: number;
    urgency?: 'normal' | 'urgent' | 'super_urgent';
}

export function renderPaymentConfirmed({
    orderId,
    customerName,
    pageCount = 1,
    serviceType = 'translation',
    totalAmount,
    urgency = 'normal',
}: PaymentConfirmedProps): string {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://promobi.vercel.app';
    const serviceLabel = serviceType === 'notarization' ? 'Notarization Only' : 'Certified Translation';
    const urgencyMap = {
        normal: '2–3 business days',
        urgent: '24 hours',
        super_urgent: '12 hours',
    };
    const eta = urgencyMap[urgency];

    const inner = `
<div class="hdr">
    <div class="hdr-logo">Promobi</div>
    <div class="hdr-sub">Payment Confirmed</div>
</div>
<div class="body">
    <!-- Big success indicator -->
    <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;
                    width:64px;height:64px;border-radius:50%;
                    background:linear-gradient(135deg,#bbf7d0,#4ade80);">
            <span style="font-size:32px;line-height:1;">✓</span>
        </div>
        <p style="font-size:22px;font-weight:800;color:${brand.dark};margin-top:14px;">
            Payment Received!
        </p>
    </div>

    <p class="para" style="text-align:center;">
        Hi <strong>${customerName}</strong>, your payment has been confirmed and your order
        is now <strong>officially in our queue</strong>. Our expert linguists are being assigned right now.
    </p>

    <!-- Order summary -->
    <div class="box" style="background:#f8fafc;border:1px solid #e2e8f0;">
        <div class="box-row">
            <span class="box-label">Order</span>
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
            <span class="box-label">Estimated Delivery</span>
            <span class="box-value" style="color:${brand.primary};">
                ${eta}
            </span>
        </div>
        <div class="box-row">
            <span class="box-label">Amount Paid</span>
            <span class="box-value" style="color:#16a34a;font-size:16px;">
                $${totalAmount.toFixed(2)} USD ✓
            </span>
        </div>
    </div>

    <!-- Process timeline -->
    <div style="margin:28px 0;">
        <p style="font-size:13px;font-weight:700;color:${brand.dark};margin-bottom:14px;
                  text-transform:uppercase;letter-spacing:1px;">What Happens Next</p>
        <div style="display:flex;flex-direction:column;gap:12px;">
            ${[
            ['🔍', 'Document Analysis', 'Our linguists review your files for complexity and context.'],
            ['✍️', 'Certified Translation', 'Your documents are translated by a certified ATA-member translator.'],
            ['⚖️', 'Quality Review', 'A second expert proofreads and certifies the final version.'],
            ['📧', 'Secure Delivery', 'You receive a certified PDF directly in your inbox.'],
        ].map(([icon, title, desc]) => `
            <div style="display:flex;gap:14px;align-items:flex-start;">
                <div style="flex-shrink:0;width:36px;height:36px;border-radius:50%;
                            background:#fff7ed;display:flex;align-items:center;
                            justify-content:center;font-size:18px;border:1px solid #fed7aa;">
                    ${icon}
                </div>
                <div>
                    <p style="font-size:14px;font-weight:700;color:${brand.dark};margin-bottom:2px;">${title}</p>
                    <p style="font-size:13px;color:#64748b;line-height:1.5;">${desc}</p>
                </div>
            </div>`).join('')}
        </div>
    </div>

    <div class="cta-wrap">
        <a href="${APP_URL}/meu-pedido" class="btn">Track My Order</a>
    </div>

    <div class="divider"></div>
    <p class="para" style="font-size:13px;color:#94a3b8;text-align:center;">
        You'll receive another email as soon as your documents are ready for download.
    </p>
</div>`;

    return wrapEmail(inner);
}
