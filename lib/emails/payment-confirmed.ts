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
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://promobidocs.com';
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
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr>
            <td align="center">
                <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" style="background:#4ade80; border-radius:50%;">
                    <tr>
                        <td align="center" valign="middle" style="font-size:32px; color:#ffffff; line-height:1;">✓</td>
                    </tr>
                </table>
                <p style="font-size:22px;font-weight:800;color:${brand.dark};margin:14px 0 0 0;">
                    Payment Received!
                </p>
            </td>
        </tr>
    </table>

    <p class="para" style="text-align:center;">
        Hi <strong>${customerName}</strong>, your payment has been confirmed and your order
        is now <strong>officially in our queue</strong>. Our expert linguists are being assigned right now.
    </p>

    <div class="box" style="background:#f8fafc;border:1px solid #e2e8f0;padding:15px;margin-bottom:28px;">
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
            <span class="box-value" style="color:${brand.primary};font-weight:bold;">
                ${eta}
            </span>
        </div>
        <div class="box-row">
            <span class="box-label">Amount Paid</span>
            <span class="box-value" style="color:#16a34a;font-size:16px;font-weight:bold;">
                $${totalAmount.toFixed(2)} USD ✓
            </span>
        </div>
    </div>

    <div style="margin:28px 0;">
        <p style="font-size:13px;font-weight:700;color:${brand.dark};margin:0 0 14px 0; text-transform:uppercase;letter-spacing:1px;">What Happens Next</p>
        
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${[
            ['🔍', 'Document Analysis', 'Our linguists review your files for complexity and context.'],
            ['✍️', 'Certified Translation', 'Your documents are translated by a certified ATA-member translator.'],
            ['⚖️', 'Quality Review', 'A second expert proofreads and certifies the final version.'],
            ['📧', 'Secure Delivery', 'You receive a certified PDF directly in your inbox.'],
        ].map(([icon, title, desc]) => `
            <tr>
                <td width="50" valign="top" style="padding-bottom:16px;">
                    <table width="36" height="36" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border-radius:50%;border:1px solid #fed7aa;">
                        <tr>
                            <td align="center" valign="middle" style="font-size:18px;">${icon}</td>
                        </tr>
                    </table>
                </td>
                <td valign="top" style="padding-bottom:16px;">
                    <p style="font-size:14px;font-weight:700;color:${brand.dark};margin:0 0 4px 0;">${title}</p>
                    <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0;">${desc}</p>
                </td>
            </tr>`).join('')}
        </table>
    </div>

    <div class="divider"></div>
    <p class="para" style="font-size:13px;color:#94a3b8;text-align:center;margin-top:20px;">
        You'll receive another email as soon as your documents are ready for download.
    </p>
</div>`;

    return wrapEmail(inner);
}