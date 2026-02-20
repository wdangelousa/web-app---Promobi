/**
 * lib/emails/delivery.ts
 * The FINAL email — certified documents are ready.
 * Must be the most premium, action-driving template we have.
 */
import { wrapEmail, brand } from './base';

export interface DeliveryProps {
    orderId: number;
    customerName: string;
    deliveryUrl: string;
    pageCount?: number;
    serviceType?: 'translation' | 'notarization';
    expiresInDays?: number; // optional: link expiry notice
}

export function renderDelivery({
    orderId,
    customerName,
    deliveryUrl,
    pageCount = 1,
    serviceType = 'translation',
    expiresInDays = 30,
}: DeliveryProps): string {
    const serviceLabel = serviceType === 'notarization' ? 'Notarization Certificate' : 'Certified Translation';

    const inner = `
<div class="hdr" style="background:linear-gradient(135deg, ${brand.dark} 0%, #1e1b4b 100%);">
    <div class="hdr-logo">Promobi</div>
    <div class="hdr-sub" style="color:#a5b4fc;">Your Documents Are Ready</div>
</div>
<div class="body">
    <!-- Hero celebration -->
    <div style="text-align:center;padding:8px 0 28px;">
        <div style="font-size:56px;margin-bottom:16px;">🎉</div>
        <p style="font-size:24px;font-weight:800;color:${brand.dark};line-height:1.2;margin-bottom:8px;">
            Your ${serviceLabel}<br>is Ready!
        </p>
        <p style="font-size:14px;color:#64748b;">Order #${orderId} · ${pageCount} page${pageCount !== 1 ? 's' : ''}</p>
    </div>

    <p class="para" style="text-align:center;">
        Hi <strong>${customerName}</strong>! Your certified document has passed our
        rigorous quality review and is legally accepted by <strong>USCIS, federal courts,
        and official institutions</strong> across the United States.
    </p>

    <!-- Big download CTA -->
    <div class="cta-wrap" style="margin:32px 0;">
        <a href="${deliveryUrl}" class="btn" style="font-size:17px;padding:18px 44px;">
            ⬇ Download Certified Documents
        </a>
        <p style="font-size:12px;color:#94a3b8;margin-top:14px;">
            This secure link is active for ${expiresInDays} days.
        </p>
    </div>

    <!-- What's included -->
    <div class="box" style="background:#f8fafc;border:1px solid #e2e8f0;">
        <p style="font-size:13px;font-weight:700;color:${brand.dark};margin-bottom:12px;
                  text-transform:uppercase;letter-spacing:1px;">
            What's Included in Your Package
        </p>
        ${serviceType === 'translation' ? `
        <div class="box-row">
            <span style="font-size:14px;color:${brand.slate};">📄 Certified Translation (PDF)</span>
            <span class="pill" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;">✓ Included</span>
        </div>
        <div class="box-row">
            <span style="font-size:14px;color:${brand.slate};">🏛️ Certification Letter</span>
            <span class="pill" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;">✓ Included</span>
        </div>
        <div class="box-row">
            <span style="font-size:14px;color:${brand.slate};">⚖️ USCIS Compliance Seal</span>
            <span class="pill" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;">✓ Included</span>
        </div>` : `
        <div class="box-row">
            <span style="font-size:14px;color:${brand.slate};">📜 Notarized Document (PDF)</span>
            <span class="pill" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;">✓ Included</span>
        </div>
        <div class="box-row">
            <span style="font-size:14px;color:${brand.slate};">✍️ Notary Certificate & Seal</span>
            <span class="pill" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;">✓ Included</span>
        </div>`}
    </div>

    <!-- Social proof / referral nudge -->
    <div style="background:linear-gradient(135deg,#fff7ed,#fff);border:1px solid #fed7aa;
                border-radius:10px;padding:20px 24px;margin:20px 0;text-align:center;">
        <p style="font-size:14px;font-weight:700;color:${brand.dark};margin-bottom:6px;">
            Satisfied with your experience?
        </p>
        <p style="font-size:13px;color:#64748b;line-height:1.6;">
            Share Promobi with friends who need certified translations.
            Your referral means the world to our small business. 🙏
        </p>
        <a href="https://wa.me/?text=I%20used%20Promobi%20for%20my%20certified%20translation%20and%20it%20was%20amazing!%20Check%20them%20out%3A%20https%3A%2F%2Fpromobi.vercel.app"
           style="display:inline-block;margin-top:14px;padding:10px 24px;background:${brand.primary};
                  color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;">
            Share on WhatsApp 📱
        </a>
    </div>

    <div class="divider"></div>
    <p class="para" style="font-size:12px;color:#94a3b8;text-align:center;">
        <strong style="color:${brand.slate};">Need a copy in the future?</strong>
        All delivered documents are securely archived for 12 months.
        Simply contact us and we'll resend them at no cost.
    </p>
</div>`;

    return wrapEmail(inner);
}
