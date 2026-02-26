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

// ─── updateDocumentName ───────────────────────────────────────────────────────

export async function updateDocumentName(
  docId: number,
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    await prisma.document.update({
      where: { id: docId },
      data: { exactNameOnDoc: name.trim() || null },
    })

    return { success: true }
  } catch (err: any) {
    console.error('[updateDocumentName]', err)
    return { success: false, error: err.message ?? 'Erro ao salvar nome.' }
  }
}

// ─── setDocumentReviewed ──────────────────────────────────────────────────────

export async function setDocumentReviewed(
  docId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    await prisma.document.update({
      where: { id: docId },
      data: { isReviewed: true },
    })

    return { success: true }
  } catch (err: any) {
    console.error('[setDocumentReviewed]', err)
    return { success: false, error: err.message ?? 'Erro ao marcar documento como revisado.' }
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
  releasedBy: string,
  options: { sendToClient: boolean; sendToTranslator: boolean } = { sendToClient: true, sendToTranslator: false }
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
            exactNameOnDoc: true,
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

    // Send delivery email to selected recipients (AWAIT for better reliability during verification)
    if (options.sendToClient || options.sendToTranslator) {
      try {
        await sendDeliveryEmail(order, options)
      } catch (err) {
        console.error('[releaseToClient] Critical failure calling sendDeliveryEmail:', err)
      }
    }

    console.log(`[releaseToClient] ✅ Order #${orderId} COMPLETED by ${releasedBy}`)
    return { success: true }

  } catch (err: any) {
    console.error('[releaseToClient]', err)
    return { success: false, error: err.message ?? 'Erro ao liberar pedido.' }
  }
}

// ─── Delivery email to client ─────────────────────────────────────────────────

async function sendDeliveryEmail(order: any, options: { sendToClient: boolean; sendToTranslator: boolean }) {
  const clientName = order.user?.fullName ?? 'Cliente'
  const clientEmail = order.user?.email
  const translatorEmail = 'belebmd@gmail.com'

  const recipients: string[] = []
  if (options.sendToClient && clientEmail) recipients.push(clientEmail)
  if (options.sendToTranslator) recipients.push(translatorEmail)

  if (recipients.length === 0) return

  console.log(`[sendDeliveryEmail] Disparando e-mail para: ${recipients.join(', ')}`)

  const docs = order.documents as Array<{ id: number; exactNameOnDoc: string | null; delivery_pdf_url: string | null }>

  // Build download links list
  const docLinks = docs
    .filter(d => d.delivery_pdf_url)
    .map((d, i) => {
      const name = (d.exactNameOnDoc ?? `Documento ${i + 1}`).split(/[/\\]/).pop() ?? `Documento ${i + 1}`
      return `
          <!-- Header -->
          <div style="background: #0F1117; padding: 28px 32px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <p style="color: #f5b000; font-size: 11px; font-weight: bold;
                        letter-spacing: 2px; margin: 0 0 6px;">PROMOBI · TRADUÇÃO CERTIFICADA</p>
              <h1 style="color: white; font-size: 24px; margin: 0; font-weight: bold;">
                Sua tradução está pronta! 🎉
              </h1>
            </div>
            <img src="https://web-app-promobi.vercel.app/logo_abelha.png" alt="Promobi" style="height: 45px; width: auto;" />
          </div>
        <div style="display:flex; align-items:center; justify-content:space-between;
                    border:1px solid #E5E7EB; border-radius:8px; padding:12px 16px;
                    margin-bottom:8px; background:#F9FAFB;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:18px;">📄</span>
            <span style="font-size:13px; color:#374151; font-weight:600;">${name}</span>
          </div>
          <a href="${d.delivery_pdf_url}"
             style="background:#f5b000; color:#111827; text-decoration:none;
                    padding:8px 16px; border-radius:8px; font-size:12px; font-weight:bold;">
            Baixar PDF
          </a>
        </div>
      `
    })
    .join('')

  // TEST MODE: activate via EMAIL_TEST_MODE=true in .env.local while domain is unverified.
  // In production (EMAIL_TEST_MODE unset or false), emails go to real recipients.
  const isTestMode = process.env.EMAIL_TEST_MODE === 'true'
  const testRecipient = process.env.EMAIL_TEST_RECIPIENT || 'wdangelo81@gmail.com'

  const { data, error } = await resend.emails.send({
    from: 'Promobi <onboarding@resend.dev>',
    to: isTestMode ? [testRecipient] : recipients,
    subject: (isTestMode ? `[TESTE] ` : '') + `📩 Sua tradução certificada está pronta — Pedido #${order.id + 1000}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; padding: 20px; color: #333;">
        <table width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border-bottom: 4px solid #111827; overflow: hidden;">
          <tr>
            <td style="text-align: center; padding: 30px; background: #fff;">
              <img src="https://web-app-promobi.vercel.app/logo_abelha.png" width="200" alt="Promobi" />
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #111827; margin-top: 0;">Sua Tradução Certificada está pronta! 🎉</h2>
              <p style="margin: 0 0 12px; color: #374151;">Olá, <strong>${clientName}</strong>,</p>
              <p style="margin: 0 0 12px; line-height: 1.6; color: #374151;">
                Entregamos em anexo o seu Kit de Tradução Oficial, certificado pelos padrões da <strong>ATA (American Translators Association)</strong>.
              </p>

              <!-- Document download links -->
              <div style="margin: 24px 0;">
                <p style="font-size: 12px; font-weight: bold; color: #6b7280; letter-spacing: 1px; margin-bottom: 12px;">
                  ${docs.filter(d => d.delivery_pdf_url).length} DOCUMENTO(S) TRADUZIDO(S)
                </p>
                ${docLinks}
              </div>

              <p style="margin: 0 0 4px; color: #374151;">Atenciosamente,<br><strong>Isabele Bandeira de Moraes D'Angelo</strong><br><span style="color: #f5b000; font-weight: bold;">Promobi Translation Services</span></p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  })

  if (error) {
    console.error(`[sendDeliveryEmail] ❌ Falha no Resend para [${recipients.join(', ')}]:`, error)
    throw new Error(`Resend: ${error.message}`)
  } else {
    console.log(`[sendDeliveryEmail] ✅ Enviado com sucesso! ID: ${data?.id} | Recipientes: ${recipients.join(', ')}`)
  }
}
