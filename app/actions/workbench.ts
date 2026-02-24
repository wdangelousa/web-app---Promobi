'use server'

// app/actions/workbench.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server actions for the Workbench (Isabele's translation desk).
//
//   saveTranslationDraft(docId, text)  → save edited DeepL text to DB
//   approveDocument(docId, finalText) → mark doc as approved
//   releaseToClient(orderId, by)      → mark order COMPLETED + email client
// ─────────────────────────────────────────────────────────────────────────────

import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/app/actions/auth'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// ─── saveTranslationDraft ─────────────────────────────────────────────────────

export async function saveTranslationDraft(
  docId: number,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    await prisma.document.update({
      where: { id: docId },
      data: {
        translatedText: text,
        translation_status: 'reviewed',
      },
    })

    return { success: true }
  } catch (err: any) {
    console.error('[saveTranslationDraft]', err)
    return { success: false, error: err.message ?? 'Erro ao salvar rascunho.' }
  }
}

// ─── approveDocument ──────────────────────────────────────────────────────────

export async function approveDocument(
  docId: number,
  finalText: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    await prisma.document.update({
      where: { id: docId },
      data: {
        translatedText: finalText,
        translation_status: 'approved',
      },
    })

    return { success: true }
  } catch (err: any) {
    console.error('[approveDocument]', err)
    return { success: false, error: err.message ?? 'Erro ao aprovar documento.' }
  }
}

// ─── releaseToClient ──────────────────────────────────────────────────────────

export async function releaseToClient(
  orderId: number,
  releasedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    // Load order with documents and user
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        documents: {
          select: {
            id: true,
            fileName: true,
            delivery_pdf_url: true,
            translation_status: true,
          },
        },
      },
    })

    if (!order) return { success: false, error: `Pedido #${orderId} não encontrado.` }

    // Safety check: all docs must be approved with PDFs
    const notReady = order.documents.filter(
      d => d.translation_status !== 'approved' || !d.delivery_pdf_url
    )
    if (notReady.length > 0) {
      return {
        success: false,
        error: `${notReady.length} documento(s) ainda não estão aprovados com PDF.`,
      }
    }

    // Update order status → COMPLETED, record who released
    let meta: Record<string, any> = {}
    try {
      meta = typeof order.metadata === 'string'
        ? JSON.parse(order.metadata as string)
        : (order.metadata as any ?? {})
    } catch { /* keep empty */ }

    meta.delivery = {
      releasedBy,
      releasedAt: new Date().toISOString(),
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'COMPLETED',
        metadata: JSON.stringify(meta),
      },
    })

    // Send delivery email to client (non-blocking)
    if (order.user?.email) {
      sendDeliveryEmail(order).catch(err =>
        console.error('[releaseToClient] Delivery email failed:', err)
      )
    }

    console.log(`[releaseToClient] ✅ Order #${orderId} COMPLETED by ${releasedBy}`)
    return { success: true }

  } catch (err: any) {
    console.error('[releaseToClient]', err)
    return { success: false, error: err.message ?? 'Erro ao liberar pedido.' }
  }
}

// ─── Delivery email to client ─────────────────────────────────────────────────

async function sendDeliveryEmail(order: any) {
  const clientName = order.user?.fullName ?? 'Cliente'
  const clientEmail = order.user?.email
  const docs = order.documents as Array<{ id: number; fileName: string | null; delivery_pdf_url: string | null }>

  // Build download links list
  const docLinks = docs
    .filter(d => d.delivery_pdf_url)
    .map((d, i) => {
      const name = (d.fileName ?? `Documento ${i + 1}`).split(/[/\\]/).pop() ?? `Documento ${i + 1}`
      return `
        <div style="display:flex; align-items:center; justify-content:space-between;
                    border:1px solid #E5E7EB; border-radius:8px; padding:12px 16px;
                    margin-bottom:8px; background:#F9FAFB;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:18px;">📄</span>
            <span style="font-size:13px; color:#374151; font-weight:600;">${name}</span>
          </div>
          <a href="${d.delivery_pdf_url}"
             style="background:#E8751A; color:white; text-decoration:none;
                    padding:8px 16px; border-radius:8px; font-size:12px; font-weight:bold;">
            Baixar PDF
          </a>
        </div>
      `
    })
    .join('')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://promobi.us'

  await resend.emails.send({
    from: 'Promobi <entrega@promobi.us>',
    to: [clientEmail],
    subject: `📩 Sua tradução certificada está pronta — Pedido #${order.id}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px; margin: 0;">
        <div style="max-width: 560px; margin: 0 auto; background: white;
                    border-radius: 12px; overflow: hidden;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <div style="background: #0F1117; padding: 28px 32px;">
            <p style="color: #E8751A; font-size: 11px; font-weight: bold;
                      letter-spacing: 2px; margin: 0 0 6px;">PROMOBI · TRADUÇÃO CERTIFICADA</p>
            <h1 style="color: white; font-size: 24px; margin: 0; font-weight: bold;">
              Sua tradução está pronta! 🎉
            </h1>
          </div>
          <div style="height: 3px; background: #E8751A;"></div>

          <!-- Body -->
          <div style="padding: 28px 32px;">
            <p style="color: #374151; font-size: 15px; margin: 0 0 6px;">
              Olá, <strong>${clientName}</strong>!
            </p>
            <p style="color: #6B7280; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
              Sua tradução certificada (USCIS accepted) foi revisada pela nossa equipe e
              está pronta para download. Abaixo você encontra todos os documentos traduzidos.
            </p>

            <!-- Document links -->
            <div style="margin-bottom: 24px;">
              <p style="font-size: 12px; font-weight: bold; color: #6B7280;
                        letter-spacing: 1px; margin-bottom: 12px;">
                ${docs.filter(d => d.delivery_pdf_url).length} DOCUMENTOS TRADUZIDOS
              </p>
              ${docLinks}
            </div>

            <!-- Steps complete -->
            <div style="border-left: 3px solid #059669; padding-left: 16px; margin-bottom: 24px;">
              <div style="margin-bottom: 8px; color: #374151; font-size: 13px;">
                <span style="color: #059669; font-weight: bold; margin-right: 8px;">✅</span>
                Pagamento confirmado
              </div>
              <div style="margin-bottom: 8px; color: #374151; font-size: 13px;">
                <span style="color: #059669; font-weight: bold; margin-right: 8px;">✅</span>
                Tradução realizada pela nossa equipe certificada
              </div>
              <div style="color: #374151; font-size: 13px;">
                <span style="color: #059669; font-weight: bold; margin-right: 8px;">✅</span>
                <strong>Revisão de qualidade concluída — entrega realizada</strong>
              </div>
            </div>

            <!-- Portal link -->
            <a href="${appUrl}/meu-pedido"
               style="display: block; background: #0F1117; color: white;
                      text-align: center; padding: 14px; border-radius: 8px;
                      text-decoration: none; font-weight: bold; font-size: 14px;
                      margin-bottom: 16px;">
              Acessar meu painel de pedidos →
            </a>

            <!-- Important note -->
            <div style="background: #F0FDF4; border: 1px solid #6EE7B7; border-radius: 8px;
                        padding: 14px 18px;">
              <p style="color: #065F46; font-size: 13px; margin: 0; line-height: 1.6;">
                <strong>Importante:</strong> Seus documentos são traduções certificadas aceitas
                pelo USCIS. Guarde os PDFs em local seguro. Em caso de dúvidas, entre em
                contato conosco antes de submeter seu processo.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #F3F4F6; border-top: 1px solid #E5E7EB;
                      padding: 18px 32px; text-align: center;">
            <p style="color: #9CA3AF; font-size: 11px; margin: 0 0 4px;">
              4700 Millenia Blvd, Orlando, FL 32839, USA
            </p>
            <p style="color: #9CA3AF; font-size: 11px; margin: 0;">
              (321) 324-5851 · info@promobi.us ·
              <a href="${appUrl}" style="color: #E8751A; text-decoration: none;">www.promobi.us</a>
            </p>
          </div>

        </div>
      </body>
      </html>
    `,
  })

  console.log(`[sendDeliveryEmail] ✅ Sent to ${clientEmail} for order #${order.id}`)
}
