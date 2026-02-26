/**
 * app/api/notifications/route.ts
 * Internal API endpoint to trigger transactional emails.
 *
 * POST body: { trigger, ...props }
 *
 * Triggers:
 *   - "order_received"      → sendOrderReceivedEmail (to client)
 *   - "payment_confirmed"   → sendPaymentConfirmedEmail (to client)
 *   - "translation_started" → sendTranslationStartedEmail (to client)
 *   - "delivery"            → sendDeliveryEmail (to client)
 *   - "brl_admin_alert"     → internal admin alert with full client contact data
 */
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import {
    sendOrderReceivedEmail,
    sendPaymentConfirmedEmail,
    sendTranslationStartedEmail,
    sendDeliveryEmail,
} from '@/lib/mail';

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'belebmd@gmail.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://promobi.vercel.app';

// ── BRL Admin Alert (inline — no extra file needed) ───────────────────────────
async function sendBrlAdminAlert(props: {
    orderId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    pageCount: number;
    serviceType: string;
    urgency: string;
    totalAmount: number;
}) {
    const brlEstimate = (props.totalAmount * 5.2).toFixed(2);
    const urgencyMap: Record<string, string> = {
        normal: 'Standard (2–3 days)',
        urgent: 'Urgent (24h)',
        super_urgent: 'Super Urgent (12h)',
    };
    const serviceLabel = props.serviceType === 'notarization' ? 'Notarization Only' : 'Certified Translation';

    const html = `<!DOCTYPE html>
<html>
<head><style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f1f5f9;margin:0;padding:0;}
  .card{max-width:560px;margin:40px auto;background:#fff;border-radius:14px;overflow:hidden;
        box-shadow:0 4px 20px rgba(0,0,0,0.1);}
  .hdr{background:#0f172a;padding:22px 32px;text-align:center;}
  .hdr-title{color:#f59e0b;font-size:18px;font-weight:800;margin:0;}
  .hdr-sub{color:#64748b;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:4px;}
  .body{padding:32px;}
  h3{font-size:16px;color:#0f172a;margin:0 0 16px;}
  .row{display:flex;justify-content:space-between;align-items:center;
       padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;}
  .row:last-child{border-bottom:none;}
  .label{color:#94a3b8;font-weight:500;}
  .val{color:#0f172a;font-weight:700;}
  .contact-box{background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;
               padding:18px 22px;margin:20px 0;}
  .contact-box h4{color:#92400e;font-size:13px;font-weight:800;margin:0 0 10px;
                  text-transform:uppercase;letter-spacing:1px;}
  .contact-row{font-size:14px;color:#78350f;margin:6px 0;}
  .contact-row a{color:#b45309;font-weight:700;}
  .wa-btn{display:inline-block;margin-top:14px;background:#25d366;color:#fff!important;
          text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;}
  .email-btn{display:inline-block;margin-top:8px;margin-left:8px;background:#f58220;color:#fff!important;
             text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;}
  .footer{background:#f1f5f9;padding:16px 32px;text-align:center;
          font-size:11px;color:#94a3b8;}
</style></head>
<body>
<div class="card">
  <div class="hdr">
    <div class="hdr-title">⚡ New BRL Order Request</div>
    <div class="hdr-sub">Action Required — Send Payment Link</div>
  </div>
  <div class="body">
    <h3>Order Summary</h3>
    <div class="row"><span class="label">Order ID</span><span class="val">${props.orderId}</span></div>
    <div class="row"><span class="label">Service</span><span class="val">${serviceLabel}</span></div>
    <div class="row"><span class="label">Pages</span><span class="val">${props.pageCount}</span></div>
    <div class="row"><span class="label">Urgency</span><span class="val">${urgencyMap[props.urgency] || props.urgency}</span></div>
    <div class="row">
      <span class="label">Amount</span>
      <span class="val" style="color:#f58220;">$${props.totalAmount.toFixed(2)} USD (≈ R$ ${brlEstimate})</span>
    </div>

    <!-- Contact info box — the critical fallback if WhatsApp is wrong -->
    <div class="contact-box">
      <h4>📋 Client Contact Details (Use If WhatsApp Fails)</h4>
      <div class="contact-row">👤 <strong>${props.customerName}</strong></div>
      <div class="contact-row">📱 Phone: <a href="https://wa.me/${props.customerPhone.replace(/\D/g, '')}">${props.customerPhone}</a></div>
      <div class="contact-row">📧 Email: <a href="mailto:${props.customerEmail}">${props.customerEmail}</a></div>
    </div>

    <div style="text-align:center;margin-top:8px;">
      <a href="https://wa.me/${props.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Olá ${props.customerName}! Aqui é da Promobi. Recebi seu pedido de tradução certificada e vou te enviar o link de pagamento agora. 😊`
    )}" class="wa-btn">📱 Reply on WhatsApp</a>
      <a href="mailto:${props.customerEmail}?subject=Seu Pedido ${props.orderId} - Promobi&body=Olá ${props.customerName}, aqui é da Promobi..." class="email-btn">📧 Send Email Instead</a>
    </div>
  </div>
  <div class="footer">Promobi Services LLC · Winter Garden, FL · Sent automatically from ${APP_URL}</div>
</div>
</body></html>`;

    return resend.emails.send({
        from: 'Promobi System <onboarding@resend.dev>',
        to: [ADMIN_EMAIL],
        subject: `⚠️ BRL Order ${props.orderId} — Send Payment Link to ${props.customerName}`,
        html,
    });
}

// ── Main handler ──────────────────────────────────────────────────────────────
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
            case 'brl_admin_alert':
                result = await sendBrlAdminAlert(props);
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
