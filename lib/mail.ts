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
import { renderDeliveryActionRequired, type DeliveryActionRequiredProps } from './emails/delivery-action';

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');

// Alterado para o domínio verificado da Promobidocs
const FROM = process.env.EMAIL_FROM || 'Promobidocs <desk@promobidocs.com>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'wdangelo81@gmail.com';

// ── Helper (Atualizado para suportar Array de Destinatários) ───────────────────
async function send(to: string | string[], subject: string, html: string, bcc?: string[]) {
    // Garante que 'to' seja sempre um array para o Resend não falhar
    const toArray = Array.isArray(to) ? to : [to];

    try {
        const data = await resend.emails.send({
            from: FROM,
            to: toArray,
            subject,
            html,
            ...(bcc ? { bcc } : {})
        });
        console.log(`[mail] ✉ Sent to ${toArray.join(', ')}: "${subject}"${bcc ? ` (BCC: ${bcc.join(', ')})` : ''}`);
        return { success: true, data };
    } catch (error) {
        console.error(`[mail] ✗ Failed "${subject}" → ${toArray.join(', ')}:`, error);
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

// ── 4. Delivery (ATUALIZADO: HTML s/ Flexbox e E-mails do Tradutor inclusos) ───
export async function sendDeliveryEmail(props: {
    orderId: number;
    customerName: string;
    customerEmail: string;
    deliveryUrl: string;
    serviceType?: string;
}) {
    // Adiciona o cliente e os e-mails obrigatórios do tradutor/admin no array de envio
    const toEmails = [
        props.customerEmail,
        'belebmd@gmail.com',
        'desk@promobidocs.com'
    ];

    const subject = `📩 [VALIDAÇÃO] Sua tradução certificada está pronta — Pedido #${props.orderId}`;

    // HTML blindado com Tabelas (sem flexbox) gerado diretamente aqui
    const html = `<!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; padding: 20px; color: #333;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <tr>
          <td style="background: #0F1117; padding: 30px; text-align: center;">
            <img src="https://promobidocs.com/logo-promobidocs.png" width="180" alt="Promobidocs" style="margin-bottom: 10px;" />
            <p style="color: #f5b000; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 6px;">PROMOBIDOCS · TRADUÇÃO CERTIFICADA</p>
            <h1 style="color: white; font-size: 22px; margin: 0; font-weight: bold;">Sua tradução está pronta! 🎉</h1>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px; background: #ffffff;">
            <h2 style="color: #111827; margin-top: 0;">Kit de Tradução Disponível</h2>
            <p style="margin: 0 0 12px; color: #374151;">Olá, <strong>${props.customerName}</strong>,</p>
            <p style="margin: 0 0 12px; line-height: 1.6; color: #374151;">Temos o prazer de entregar o seu Kit de Tradução Oficial, processado e revisado por nossa equipe especializada.</p>

            <div style="margin: 24px 0;">
              <table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #E5E7EB; border-radius:8px; margin-bottom:8px; background:#F9FAFB;">
                <tr>
                  <td style="font-size:13px; color:#374151; font-weight:600;">📄 Acessar Documentos do Pedido #${props.orderId}</td>
                  <td align="right">
                    <a href="${props.deliveryUrl}" style="background:#f5b000; color:#111827; text-decoration:none; padding:8px 16px; border-radius:8px; font-size:12px; font-weight:bold; display:inline-block;">Baixar Kit</a>
                  </td>
                </tr>
              </table>
            </div>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
              <p style="margin: 0 0 4px; color: #374151; font-size: 14px;">Atenciosamente,</p>
              <p style="margin: 0; color: #111827; font-weight: bold; font-size: 15px;">Equipe Promobidocs</p>
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

    return send(toEmails, subject, html);
}

// ── 5. Delivery Action Required ────────────────────────────────────────────────
export async function sendDeliveryActionRequiredEmail(
    props: DeliveryActionRequiredProps & { customerEmail: string }
) {
    const html = renderDeliveryActionRequired(props);
    return send(
        props.customerEmail,
        `⚠️ Action Required: Documents Ready for Download — Order #${props.orderId} | Promobi`,
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
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://promobidocs.com';
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