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
//   1. Register the settlement through the shared manual-payment workflow
//   2. Trigger post-payment auto translation when production is released
//   3. Notify Isabele (badge counter + email)
//   4. Send confirmation email to client

import prisma from '@/lib/prisma'
import { Resend } from 'resend'
import { autoTranslateOrder } from '@/app/actions/autoTranslateOrder'
import { registerManualPayment } from '@/app/actions/manualPaymentBypass'
import { readFinancialLedger, roundMoney } from '@/lib/manualPayment'
import { parseOrderMetadata } from '@/lib/translationArtifactSource'

const resend = new Resend(process.env.RESEND_API_KEY)

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
  financialStatus?: string
  operationalStatus?: string
  productionReleased?: boolean
}

// ─── Main action ──────────────────────────────────────────────────────────────

export async function confirmPayment(
  orderId: number,
  method: PaymentMethod,
  zelleDetails?: ZelleDetails
): Promise<ConfirmPaymentResult> {

  try {
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

    if (order.status === 'CANCELLED') {
      return { success: false, error: `Pedido #${orderId} está cancelado.` }
    }

    const metadata = parseOrderMetadata(order.metadata as string | null | undefined)
    const ledger = readFinancialLedger(
      metadata,
      order.totalAmount ?? 0,
      typeof order.finalPaidAmount === 'number' ? order.finalPaidAmount : null,
    )
    const remainingBalance = roundMoney(Math.max((order.totalAmount ?? 0) - ledger.amountReceived, 0))

    if (remainingBalance <= 0) {
      return { success: false, error: `Pedido #${orderId} já está totalmente liquidado.` }
    }

    const confirmedAt = zelleDetails?.confirmedAt ?? new Date().toISOString()
    const noteParts = [
      `Auto-confirmed via ${method}`,
      method === 'ZELLE' && zelleDetails?.reference ? `reference=${zelleDetails.reference}` : null,
      method === 'ZELLE' && zelleDetails?.confirmedBy ? `confirmedBy=${zelleDetails.confirmedBy}` : null,
      method === 'ZELLE' && zelleDetails?.notes ? zelleDetails.notes : null,
    ].filter(Boolean)

    const paymentResult = await registerManualPayment(orderId, {
      amountReceived: remainingBalance,
      paymentDate: confirmedAt,
      paymentMethod: method,
      notes: noteParts.join(' | ') || null,
      skipAutoTranslate: true,
    })

    if (!paymentResult.success) {
      return { success: false, error: paymentResult.message || 'Erro interno ao confirmar pagamento.' }
    }

    const refreshedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        documents: true,
      },
    })

    if (!refreshedOrder) {
      return { success: false, error: `Pedido #${orderId} não encontrado após confirmação.` }
    }

    const refreshedMetadata = parseOrderMetadata(refreshedOrder.metadata as string | null | undefined)
    const paymentRecord = {
      method,
      confirmedAt,
      amountReceived: paymentResult.amountReceived ?? remainingBalance,
      remainingBalance: paymentResult.remainingBalance ?? 0,
      financialStatus: paymentResult.financialStatus ?? null,
      operationalStatus: paymentResult.operationalStatus ?? refreshedOrder.status,
      productionReleased: paymentResult.productionReleased === true,
      ...(method === 'ZELLE' && zelleDetails ? {
        zelleReference: zelleDetails.reference,
        confirmedBy: zelleDetails.confirmedBy,
        notes: zelleDetails.notes ?? null,
      } : {}),
    }

    const confirmationHistory = Array.isArray(refreshedMetadata.paymentConfirmations)
      ? [...refreshedMetadata.paymentConfirmations, paymentRecord]
      : [paymentRecord]
    const nextMetadata = {
      ...refreshedMetadata,
      paymentConfirmation: paymentRecord,
      paymentConfirmations: confirmationHistory,
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { metadata: JSON.stringify(nextMetadata) },
    })

    if (paymentResult.productionReleased === true) {
      autoTranslateOrder(orderId).catch(err =>
        console.error('[confirmPayment] Auto-translate failed:', err)
      )
    }

    notifyIsabele(refreshedOrder, method, {
      productionReleased: paymentResult.productionReleased === true,
      remainingBalance: paymentResult.remainingBalance ?? 0,
      financialStatus: paymentResult.financialStatus ?? 'paid',
    }).catch(err =>
      console.error(`[confirmPayment] Ops notification failed:`, err)
    )

    if (refreshedOrder.user?.email) {
      sendClientConfirmation(refreshedOrder, {
        productionReleased: paymentResult.productionReleased === true,
        remainingBalance: paymentResult.remainingBalance ?? 0,
      }).catch(err =>
        console.error(`[confirmPayment] Client email failed:`, err)
      )
    }

    console.log(
      `[confirmPayment] ✅ Order #${orderId} settled via ${method}; ` +
      `financial=${paymentResult.financialStatus} operational=${paymentResult.operationalStatus}`
    )
    return {
      success: true,
      orderId,
      financialStatus: paymentResult.financialStatus,
      operationalStatus: paymentResult.operationalStatus,
      productionReleased: paymentResult.productionReleased,
    }

  } catch (err: any) {
    console.error('[confirmPayment] Error:', err)
    return { success: false, error: err?.message ?? 'Erro interno ao confirmar pagamento.' }
  }
}

// ─── Isabele notification ─────────────────────────────────────────────────────

async function notifyIsabele(
  order: any,
  method: PaymentMethod,
  paymentSummary: { productionReleased: boolean; remainingBalance: number; financialStatus: string },
) {
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

  let recipientEmails = toList.map(u => u.email).filter(Boolean) as string[];
  if (process.env.NODE_ENV === 'development') {
    recipientEmails = ['wdangelo81@gmail.com'];
    console.log(`[notifyIsabele] Development mode: Redirecting ops notification to ${recipientEmails[0]}`);
  }

  if (recipientEmails.length === 0) return

  await resend.emails.send({
    from: 'Promobidocs <desk@promobidocs.com>',
    to: recipientEmails,
    subject: paymentSummary.productionReleased
      ? `🟡 Novo pedido para traduzir — #${order.id} (${order.user?.fullName ?? 'Cliente'})`
      : `💰 Pagamento registrado — #${order.id} (${order.user?.fullName ?? 'Cliente'})`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <div style="background: #0F1117; padding: 24px 32px; text-align: center;">
            <img src="https://promobidocs.com/logo-promobidocs.png" width="180" alt="Promobidocs" style="margin-bottom: 10px;">
            <p style="color: #B8763E; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 4px;">PROMOBIDOCSDOCS OPS</p>
            <h1 style="color: white; font-size: 22px; margin: 0;">Novo pedido pronto para tradução</h1>
          </div>
          <div style="height: 3px; background: #B8763E;"></div>

          <!-- Body -->
          <div style="padding: 28px 32px;">
            <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
              O pagamento do pedido <strong>#${order.id}</strong> foi confirmado via <strong>${methodLabel[method]}</strong>.
              ${
                paymentSummary.productionReleased
                  ? 'A tradução já está sendo processada — em breve os rascunhos estarão disponíveis no Workbench.'
                  : `O fluxo operacional segue aguardando a política de liberação. Saldo restante: <strong>$${paymentSummary.remainingBalance.toFixed(2)}</strong>.`
              }
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
                  <td style="color: #B8763E; font-weight: bold; font-size: 16px; text-align: right;">$${(order.totalAmount ?? 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 12px; padding: 4px 0;">Urgência</td>
                  <td style="color: #111827; font-size: 13px; text-align: right; text-transform: capitalize;">${order.urgency ?? 'standard'}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; font-size: 12px; padding: 4px 0;">Financeiro</td>
                  <td style="color: #111827; font-size: 13px; text-align: right;">${paymentSummary.financialStatus}</td>
                </tr>
              </table>
            </div>

            <!-- CTA -->
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://promobidocs.com'}/admin/orders/${order.id}"
               style="display: block; background: #B8763E; color: #ffffff; text-align: center; padding: 14px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
              Abrir no Workbench →
            </a>
          </div>

          <!-- Footer -->
          <div style="background: #F3F4F6; border-top: 1px solid #E5E7EB; padding: 16px 32px; text-align: center;">
            <p style="color: #9CA3AF; font-size: 11px; margin: 0;">Promobi · 4700 Millenia Blvd, Orlando FL 32839 · desk@promobidocs.com</p>
          </div>
        </div>
      </body>
      </html>
    `,
  })
  console.log(`[notifyIsabele] ✅ Notified ${toList.length} ops user(s) for order #${order.id}`)
}

// ─── Client confirmation email ─────────────────────────────────────────────────

async function sendClientConfirmation(
  order: any,
  paymentSummary: { productionReleased: boolean; remainingBalance: number },
) {
  const clientName = order.user?.fullName ?? 'Cliente'
  const clientEmail = order.user?.email

  let recipient = clientEmail;
  if (process.env.NODE_ENV === 'development') {
    recipient = 'wdangelo81@gmail.com';
    console.log(`[sendClientConfirmation] Development mode: Redirecting client confirmation from ${clientEmail} to ${recipient}`);
  }

  await resend.emails.send({
    from: 'Promobidocs <desk@promobidocs.com>',
    to: [recipient],
    subject: paymentSummary.productionReleased
      ? `✅ Pagamento confirmado — Pedido #${order.id} em tradução`
      : `✅ Pagamento recebido — Pedido #${order.id}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

          <div style="background: #0F1117; padding: 24px 32px; text-align: center;">
            <img src="https://promobidocs.com/logo-promobidocs.png" width="200" alt="Promobidocs" style="margin-bottom: 10px;">
            <p style="color: #B8763E; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 4px;">PROMOBIDOCS</p>
            <h1 style="color: white; font-size: 22px; margin: 0;">Seu pagamento foi confirmado!</h1>
          </div>
          <div style="height: 3px; background: #B8763E;"></div>

          <div style="padding: 28px 32px;">
            <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
              Olá, <strong>${clientName}</strong>! Recebemos seu pagamento.
              ${
                paymentSummary.productionReleased
                  ? 'Sua tradução certificada já está sendo processada pela nossa equipe.'
                  : `Seu pedido permanece em acompanhamento financeiro, com saldo restante de <strong>$${paymentSummary.remainingBalance.toFixed(2)}</strong>.`
              }
            </p>

            <!-- Status steps -->
            <div style="border-left: 3px solid #B8763E; padding-left: 16px; margin-bottom: 24px;">
              <div style="margin-bottom: 12px; display: flex; align-items: center;">
                <span style="color: #059669; font-weight: bold; margin-right: 8px;">✅</span>
                <span style="color: #111827;">Pagamento confirmado</span>
              </div>
              <div style="margin-bottom: 12px;">
                <span style="color: #B8763E; font-weight: bold; margin-right: 8px;">🔄</span>
                <span style="color: #111827; font-weight: bold;">${
                  paymentSummary.productionReleased
                    ? 'Em tradução — nossa equipe está trabalhando agora'
                    : 'Pagamento registrado — aguardando próxima etapa operacional'
                }</span>
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

            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://promobidocs.com'}/meu-pedido"
               style="display: block; background: #B8763E; color: #ffffff; text-align: center; padding: 14px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
              Acompanhar meu pedido →
            </a>
          </div>

          <div style="background: #F3F4F6; border-top: 1px solid #E5E7EB; padding: 16px 32px; text-align: center;">
            <p style="color: #9CA3AF; font-size: 11px; margin: 0;">
              Dúvidas? (321) 324-5851 · desk@promobidocs.com · www.promobidocs.com
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  })
  console.log(`[sendClientConfirmation] ✅ Email sent to ${clientEmail} for order #${order.id}`)
}
