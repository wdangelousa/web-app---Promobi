'use server'

// app/actions/confirm-payment.ts
//
// ─── UNIFIED PAYMENT CONFIRMATION ─────────────────────────────────────────────
// Single action called by:
//   • Stripe webhook     → confirmPayment(orderId, 'STRIPE')
//   • Parcelado USA wh.  → confirmPayment(orderId, 'PARCELADO_USA')
//   • Walter (Zelle)     → confirmPayment(orderId, 'ZELLE', { ref, confirmedBy })
//
// Always does the same thing:
//   1. Mark order TRANSLATING + record payment details
//   2. Trigger DeepL Edge Function (non-blocking)
//   3. Notify Isabele (badge counter + email)
//   4. Send confirmation email to client

import prisma from '@/lib/prisma'
import { Resend } from 'resend'
import { getCurrentUser } from '@/app/actions/auth'

const resend = new Resend(process.env.RESEND_API_KEY)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'STRIPE' | 'PARCELADO_USA' | 'ZELLE'

export interface ZelleDetails {
  reference: string        // e.g. "ZL-2024-0001" or last 4 digits
  confirmedBy: string      // User name who clicked confirm
  confirmedAt?: string     // ISO string, defaults to now
  notes?: string
}

export interface ConfirmPaymentResult {
  success: boolean
  orderId?: number
  error?: string
}

// ─── Main action ──────────────────────────────────────────────────────────────

export async function confirmPayment(
  orderId: number,
  method: PaymentMethod,
  zelleDetails?: ZelleDetails
): Promise<ConfirmPaymentResult> {

  try {
    // 1. Load order with user and documents
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        documents: true,
      },
    })

    if (!order) {
      return { success: false, error: `Pedido #${orderId} não encontrado.` }
    }

    // Guard: don't double-process
    if (['TRANSLATING', 'READY_FOR_REVIEW', 'COMPLETED'].includes(order.status)) {
      return { success: false, error: `Pedido #${orderId} já está em status ${order.status}.` }
    }

    // 2. Parse existing metadata and add payment confirmation
    let meta: Record<string, any> = {}
    try { meta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : (order.metadata ?? {}) }
    catch { /* keep empty */ }

    const paymentRecord = {
      method,
      confirmedAt: zelleDetails?.confirmedAt ?? new Date().toISOString(),
      ...(method === 'ZELLE' && zelleDetails ? {
        zelleReference: zelleDetails.reference,
        confirmedBy: zelleDetails.confirmedBy,
        notes: zelleDetails.notes ?? null,
      } : {}),
    }
    meta.paymentConfirmation = paymentRecord

    // 3. Update order status → TRANSLATING
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'TRANSLATING',
        paymentMethod: method,
        metadata: JSON.stringify(meta),
      },
    })

    // 4. Trigger DeepL Edge Function (fire-and-forget, non-blocking)
    triggerDeepL(orderId).catch(err =>
      console.error(`[confirmPayment] DeepL trigger failed for order ${orderId}:`, err)
    )

    // 5. Notify Isabele
    notifyIsabele(order, method).catch(err =>
      console.error(`[confirmPayment] Isabele notification failed:`, err)
    )

    // 6. Confirm to client
    if (order.user?.email) {
      sendClientConfirmation(order).catch(err =>
        console.error(`[confirmPayment] Client email failed:`, err)
      )
    }

    console.log(`[confirmPayment] ✅ Order #${orderId} → TRANSLATING via ${method}`)
    return { success: true, orderId }

  } catch (err: any) {
    console.error('[confirmPayment] Error:', err)
    return { success: false, error: err?.message ?? 'Erro interno ao confirmar pagamento.' }
  }
}

// ─── DeepL trigger ────────────────────────────────────────────────────────────

async function triggerDeepL(orderId: number) {
  const edgeFnUrl = `${SUPABASE_URL}/functions/v1/translate-order`
  const res = await fetch(edgeFnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ orderId }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`DeepL edge function returned ${res.status}: ${txt}`)
  }
  console.log(`[triggerDeepL] ✅ Dispatched for order #${orderId}`)
}

// ─── Isabele notification ─────────────────────────────────────────────────────

async function notifyIsabele(order: any, method: PaymentMethod) {
  // Find all OPERATIONS users to notify (Isabele + Walter)
  const ops = await prisma.user.findMany({
    where: { role: { in: ['OPERATIONS', 'TECHNICAL'] } },
    select: { email: true, fullName: true },
  })

  const methodLabel: Record<PaymentMethod, string> = {
    STRIPE: 'Stripe (cartão)',
    PARCELADO_USA: 'Parcelado USA (Pix/boleto)',
    ZELLE: 'Zelle',
  }

  const toList = ops
    .filter(u => u.email)
    .map(u => ({ email: u.email, name: u.fullName }))

  if (toList.length === 0) return

  await resend.emails.send({
    from: 'Promobi Ops <ops@promobi.us>',
    to: toList.map(u => u.email),
    subject: `🟡 Novo pedido para traduzir — #${order.id} (${order.user?.fullName ?? 'Cliente'})`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <div style="background: #0F1117; padding: 24px 32px;">
            <p style="color: #E8751A; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 4px;">PROMOBI OPS</p>
            <h1 style="color: white; font-size: 22px; margin: 0;">Novo pedido pronto para tradução</h1>
          </div>
          <div style="height: 3px; background: #E8751A;"></div>

          <!-- Body -->
          <div style="padding: 28px 32px;">
            <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
              O pagamento do pedido <strong>#${order.id}</strong> foi confirmado via <strong>${methodLabel[method]}</strong>.
              O DeepL já está processando os documentos — em breve os rascunhos estarão disponíveis no Workbench.
            </p>

            <!-- Order summary -->
            <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #6B7280; font-size: 12px; padding: 4px 0;">Cliente</td>
                  <td style="color: #111827; font-weight: bold; font-size: 14px; text-align: right;">${order.user?.fullName ?? '—'}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 12px; padding: 4px 0;">E-mail</td>
                  <td style="color: #111827; font-size: 13px; text-align: right;">${order.user?.email ?? '—'}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 12px; padding: 4px 0;">Documentos</td>
                  <td style="color: #111827; font-weight: bold; font-size: 14px; text-align: right;">${order.documents?.length ?? 0}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 12px; padding: 4px 0;">Valor total</td>
                  <td style="color: #E8751A; font-weight: bold; font-size: 16px; text-align: right;">$${(order.totalAmount ?? 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 12px; padding: 4px 0;">Urgência</td>
                  <td style="color: #111827; font-size: 13px; text-align: right; text-transform: capitalize;">${order.urgency ?? 'standard'}</td>
                </tr>
              </table>
            </div>

            <!-- CTA -->
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://promobi.us'}/admin/orders/${order.id}"
               style="display: block; background: #E8751A; color: white; text-align: center; padding: 14px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
              Abrir no Workbench →
            </a>
          </div>

          <!-- Footer -->
          <div style="background: #F3F4F6; border-top: 1px solid #E5E7EB; padding: 16px 32px; text-align: center;">
            <p style="color: #9CA3AF; font-size: 11px; margin: 0;">Promobi · 4700 Millenia Blvd, Orlando FL 32839 · ops@promobi.us</p>
          </div>
        </div>
      </body>
      </html>
    `,
  })
  console.log(`[notifyIsabele] ✅ Notified ${toList.length} ops user(s) for order #${order.id}`)
}

// ─── Client confirmation email ─────────────────────────────────────────────────

async function sendClientConfirmation(order: any) {
  const clientName = order.user?.fullName ?? 'Cliente'
  const clientEmail = order.user?.email

  await resend.emails.send({
    from: 'Promobi <noreply@promobi.us>',
    to: [clientEmail],
    subject: `✅ Pagamento confirmado — Pedido #${order.id} em tradução`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

          <div style="background: #0F1117; padding: 24px 32px;">
            <p style="color: #E8751A; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 4px;">PROMOBI</p>
            <h1 style="color: white; font-size: 22px; margin: 0;">Seu pagamento foi confirmado!</h1>
          </div>
          <div style="height: 3px; background: #E8751A;"></div>

          <div style="padding: 28px 32px;">
            <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
              Olá, <strong>${clientName}</strong>! Recebemos seu pagamento e sua tradução certificada já está sendo processada pela nossa equipe.
            </p>

            <!-- Status steps -->
            <div style="border-left: 3px solid #E8751A; padding-left: 16px; margin-bottom: 24px;">
              <div style="margin-bottom: 12px; display: flex; align-items: center;">
                <span style="color: #059669; font-weight: bold; margin-right: 8px;">✅</span>
                <span style="color: #111827;">Pagamento confirmado</span>
              </div>
              <div style="margin-bottom: 12px;">
                <span style="color: #E8751A; font-weight: bold; margin-right: 8px;">🔄</span>
                <span style="color: #111827; font-weight: bold;">Em tradução — nossa equipe está trabalhando agora</span>
              </div>
              <div style="color: #9CA3AF; margin-bottom: 12px;">
                <span style="margin-right: 8px;">⏳</span> Revisão de qualidade
              </div>
              <div style="color: #9CA3AF;">
                <span style="margin-right: 8px;">📩</span> Entrega por e-mail
              </div>
            </div>

            <div style="background: #F0FDF4; border: 1px solid #6EE7B7; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
              <p style="color: #065F46; font-size: 13px; margin: 0;">
                <strong>Pedido #${order.id}</strong> · ${order.documents?.length ?? 0} documentos ·
                Você receberá um e-mail assim que a tradução estiver pronta.
              </p>
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://promobi.us'}/meu-pedido"
               style="display: block; background: #E8751A; color: white; text-align: center; padding: 14px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
              Acompanhar meu pedido →
            </a>
          </div>

          <div style="background: #F3F4F6; border-top: 1px solid #E5E7EB; padding: 16px 32px; text-align: center;">
            <p style="color: #9CA3AF; font-size: 11px; margin: 0;">
              Dúvidas? (321) 324-5851 · info@promobi.us · www.promobi.us
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  })
  console.log(`[sendClientConfirmation] ✅ Email sent to ${clientEmail} for order #${order.id}`)
}
