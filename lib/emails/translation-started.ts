/**
 * lib/emails/translation-started.ts
 * Triggered when an admin starts working on the order (status → IN_PROGRESS).
 * Keeps the client informed and confident.
 */
import { wrapEmail, brand } from './base';

export interface TranslationStartedProps {
    orderId: number;
    customerName: string;
    pageCount?: number;
    urgency?: 'normal' | 'urgent' | 'super_urgent';
}

export function renderTranslationStarted({
    orderId,
    customerName,
    pageCount = 1,
    urgency = 'normal',
}: TranslationStartedProps): string {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://promobidocs.com';
    const urgencyMap = {
        normal: { label: '2–3 business days', color: '#64748b' },
        urgent: { label: '24 hours', color: '#f59e0b' },
        super_urgent: { label: '12 hours', color: '#ef4444' },
    };
    const eta = urgencyMap[urgency];

    const inner = `
<div class="hdr">
    <div class="hdr-logo">Promobi</div>
    <div class="hdr-sub">Translation In Progress</div>
</div>
<div class="body">
    <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:48px;line-height:1;">⚙️</div>
        <p style="font-size:20px;font-weight:800;color:${brand.dark};margin:12px 0 0 0;">
            We've Started!
        </p>
        <p style="font-size:14px;color:#64748b;margin:4px 0 0 0;">
            Your documents are now in our translation pipeline.
        </p>
    </div>

    <p class="para">
        Hi <strong>${customerName}</strong>, great news — our certified linguist has begun
        working on your documents for Order <strong>#${orderId}</strong>.
    </p>

    <div class="box" style="background:#f8fafc;border:1px solid #e2e8f0;padding:15px;margin-bottom:20px;">
        <div class="box-row">
            <span class="box-label">Order</span>
            <span class="box-value">#${orderId}</span>
        </div>
        <div class="box-row">
            <span class="box-label">Volume</span>
            <span class="box-value">${pageCount} page${pageCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="box-row">
            <span class="box-label">Current Status</span>
            <span class="pill" style="background:#fef8ee;color:${brand.primary};border:1px solid #fed7aa;padding:4px 10px;border-radius:20px;font-size:12px;display:inline-block;">
                ✍️ In Translation
            </span>
        </div>
        <div class="box-row">
            <span class="box-label">Expected Delivery</span>
            <span class="box-value" style="color:${eta.color};font-weight:bold;">${eta.label}</span>
        </div>
    </div>

    <div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin:20px 0;">
        <p style="font-size:13px;font-weight:700;color:${brand.dark};margin:0 0 8px 0;">
            🔒 Quality Guarantee
        </p>
        <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0;">
            Every document is translated by a certified ATA-member linguist and reviewed by a
            second expert before delivery. Your USCIS documents are handled with the highest
            level of care and precision.
        </p>
    </div>

    <div class="divider"></div>
    <p class="para" style="font-size:13px;color:#94a3b8;text-align:center;margin-top:20px;">
        We'll send you an email the moment your certified documents are ready for download.
        No action is needed from you right now.
    </p>
</div>`;

    return wrapEmail(inner);
}