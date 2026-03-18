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
import { PDFDocument } from 'pdf-lib'
import { classifyDocument } from '@/services/documentClassifier'
import { detectDocumentFamily } from '@/services/documentFamilyRegistry'
import {
  getStructuredRendererName,
  isSupportedStructuredDocumentType,
} from '@/services/structuredDocumentRenderer'

const resend = new Resend(process.env.RESEND_API_KEY)

function isStructuredDeliveryArtifactUrl(url: string | null | undefined, orderId: number, docId: number): boolean {
  if (!url) return false
  const normalized = url.trim()
  if (!normalized) return false

  const hasCompletedPath = normalized.includes('/orders/completed/')
  const hasTranslationsBucket = normalized.includes('/translations/')
  const expectedFilename = `promobidocs-order-${orderId}-doc-${docId}.pdf`
  const hasExpectedFilename = normalized.includes(expectedFilename)

  return hasCompletedPath && hasTranslationsBucket && hasExpectedFilename
}

interface ReleasePageParityDiagnostics {
  orderId: number
  docId: number
  detected_family: string
  source_page_count: number | null
  translated_page_count: number | null
  parity_status: 'pass' | 'fail'
  blocking_reason: string
  renderer_used: string
  orientation_used: string
  compaction_attempted: boolean
  certification_generation_blocked: boolean
  release_blocked: boolean
}

function logReleasePageParityDiagnostics(diagnostics: ReleasePageParityDiagnostics) {
  console.log(`[releaseToClient] page parity diagnostics: ${JSON.stringify(diagnostics)}`)
}

async function getPdfPageCountFromUrl(url: string): Promise<number | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
    return pdfDoc.getPageCount()
  } catch {
    return null
  }
}

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
  options: { sendToClient: boolean; sendToTranslator: boolean; isRetry?: boolean } = { sendToClient: true, sendToTranslator: false, isRetry: false }
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
            docType: true,
            originalFileUrl: true,
            translatedText: true,
            sourceLanguage: true,
            delivery_pdf_url: true,
            translation_status: true,
          },
        },
      },
    })

    if (!order) return { success: false, error: `Pedido #${orderId} não encontrado.` }

    // Safety check: all docs must be approved AND have structured-generated delivery artifacts.
    const notReady = order.documents.filter((d) => {
      if (d.translation_status !== 'approved') return true
      if (!d.delivery_pdf_url) return true
      return !isStructuredDeliveryArtifactUrl(d.delivery_pdf_url, orderId, d.id)
    })
    if (notReady.length > 0) {
      const missingStructured = notReady.filter(
        d => d.delivery_pdf_url && !isStructuredDeliveryArtifactUrl(d.delivery_pdf_url, orderId, d.id),
      ).length
      return {
        success: false,
        error:
          `${notReady.length} documento(s) não estão prontos para liberação estruturada. ` +
          `Aprovação e PDF estruturado são obrigatórios para todos os documentos.` +
          (missingStructured > 0
            ? ` ${missingStructured} documento(s) têm PDF fora do pipeline estruturado e foram bloqueados.`
            : ''),
      }
    }

    // Absolute page-parity release guard:
    // translated_page_count MUST equal source_page_count for every document.
    const parityFailures: Array<{
      docId: number
      reason: string
      sourcePageCount: number | null
      translatedPageCount: number | null
    }> = []

    for (const d of order.documents) {
      const documentLabelHint =
        [d.exactNameOnDoc, d.docType].filter(Boolean).join(' ').trim() || undefined
      const classification = classifyDocument({
        fileUrl: d.originalFileUrl ?? undefined,
        documentLabel: documentLabelHint,
        translatedText: d.translatedText ?? undefined,
        sourceLanguage: d.sourceLanguage ?? undefined,
      })
      const family = detectDocumentFamily({
        documentType: classification.documentType,
        documentLabel: documentLabelHint,
        fileUrl: d.originalFileUrl,
        translatedText: d.translatedText,
      }).family
      const rendererUsed = isSupportedStructuredDocumentType(classification.documentType)
        ? getStructuredRendererName(classification.documentType)
        : 'unknown'

      const sourcePageCount = d.originalFileUrl
        ? await getPdfPageCountFromUrl(d.originalFileUrl)
        : null
      const deliveryTotalPageCount = d.delivery_pdf_url
        ? await getPdfPageCountFromUrl(d.delivery_pdf_url)
        : null

      if (sourcePageCount === null || deliveryTotalPageCount === null) {
        const diagnostics: ReleasePageParityDiagnostics = {
          orderId,
          docId: d.id,
          detected_family: family,
          source_page_count: sourcePageCount,
          translated_page_count: null,
          parity_status: 'fail',
          blocking_reason: 'page_parity_unverifiable_source_or_delivery_page_count',
          renderer_used: rendererUsed,
          orientation_used: 'unknown-at-release-guard',
          compaction_attempted: false,
          certification_generation_blocked: false,
          release_blocked: true,
        }
        logReleasePageParityDiagnostics(diagnostics)
        parityFailures.push({
          docId: d.id,
          reason: diagnostics.blocking_reason,
          sourcePageCount,
          translatedPageCount: null,
        })
        continue
      }

      // Final kit shape: cover(1) + translated(T) + original(source_page_count)
      const translatedPageCount = deliveryTotalPageCount - 1 - sourcePageCount

      if (translatedPageCount !== sourcePageCount) {
        const diagnostics: ReleasePageParityDiagnostics = {
          orderId,
          docId: d.id,
          detected_family: family,
          source_page_count: sourcePageCount,
          translated_page_count: translatedPageCount,
          parity_status: 'fail',
          blocking_reason: 'page_parity_mismatch',
          renderer_used: rendererUsed,
          orientation_used: 'unknown-at-release-guard',
          compaction_attempted: false,
          certification_generation_blocked: false,
          release_blocked: true,
        }
        logReleasePageParityDiagnostics(diagnostics)
        parityFailures.push({
          docId: d.id,
          reason: diagnostics.blocking_reason,
          sourcePageCount,
          translatedPageCount,
        })
        continue
      }

      const diagnostics: ReleasePageParityDiagnostics = {
        orderId,
        docId: d.id,
        detected_family: family,
        source_page_count: sourcePageCount,
        translated_page_count: translatedPageCount,
        parity_status: 'pass',
        blocking_reason: 'none',
        renderer_used: rendererUsed,
        orientation_used: 'unknown-at-release-guard',
        compaction_attempted: false,
        certification_generation_blocked: false,
        release_blocked: false,
      }
      logReleasePageParityDiagnostics(diagnostics)
    }

    if (parityFailures.length > 0) {
      const details = parityFailures
        .map(
          f =>
            `doc#${f.docId} reason=${f.reason} source=${f.sourcePageCount ?? 'n/a'} translated=${f.translatedPageCount ?? 'n/a'}`,
        )
        .join('; ')
      return {
        success: false,
        error:
          `Release blocked by absolute page-parity rule. ${parityFailures.length} document(s) failed parity validation. ` +
          details,
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
      structuredOnly: true,
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

    console.log(`[releaseToClient] ✅ Order #${orderId} ${options.isRetry ? 'RESENT' : 'COMPLETED'} by ${releasedBy}`)
    return { success: true }

  } catch (err: any) {
    console.error('[releaseToClient]', err)
    return { success: false, error: err.message ?? 'Erro ao liberar pedido.' }
  }
}

// ─── Delivery email to client ─────────────────────────────────────────────────

async function sendDeliveryEmail(order: any, options: { sendToClient: boolean; sendToTranslator: boolean; isRetry?: boolean }) {
  const clientName = order.user?.fullName ?? 'Cliente'
  const clientEmail = order.user?.email

  const recipients: string[] = []

  if (options.sendToClient) {
    if (clientEmail) {
      recipients.push(clientEmail)
    } else {
      console.error(
        `[sendDeliveryEmail] ❌ sendToClient=true but clientEmail is missing for Order #${order.id}. ` +
        `order.user=${JSON.stringify(order.user)}. Client will NOT receive the delivery email.`
      )
      throw new Error(
        `Client email not found for Order #${order.id}. ` +
        `Check that the order is linked to the correct user in the database.`
      )
    }
  }
  if (options.sendToTranslator) {
    recipients.push('belebmd@gmail.com')
    recipients.push('desk@promobidocs.com')
  }

  if (recipients.length === 0) return

  console.log(`[sendDeliveryEmail] ${options.isRetry ? 'REENVIO MANUAL' : 'DISPARO INICIAL'} - Disparando e-mail para: ${recipients.join(', ')}`)

  const docs = order.documents as Array<{ id: number; exactNameOnDoc: string | null; delivery_pdf_url: string | null }>

  // Build download links list substituindo Flexbox por Tabelas
  const docLinks = docs
    .filter(d => d.delivery_pdf_url)
    .map((d, i) => {
      const name = (d.exactNameOnDoc ?? `Documento ${i + 1}`).split(/[/\\]/).pop() ?? `Documento ${i + 1}`
      return `
        <table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #E5E7EB; border-radius:8px; margin-bottom:8px; background:#F9FAFB;">
          <tr>
            <td width="30" style="font-size:18px; text-align:center; padding-right:0;">📄</td>
            <td style="font-size:13px; color:#374151; font-weight:600;">${name}</td>
            <td align="right">
              <a href="${d.delivery_pdf_url}"
                 style="background:#f5b000; color:#111827; text-decoration:none;
                        padding:8px 16px; border-radius:8px; font-size:12px; font-weight:bold; display:inline-block;">
                Baixar PDF
              </a>
            </td>
          </tr>
        </table>
      `
    })
    .join('')

  const { data, error } = await resend.emails.send({
    from: 'Promobidocs <desk@promobidocs.com>',
    to: recipients,
    subject: `📩 [VALIDAÇÃO] Sua tradução certificada está pronta — Pedido #${order.id + 1000}`,
    html: `
      <!DOCTYPE html>
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
              <p style="margin: 0 0 12px; color: #374151;">Olá, <strong>${clientName}</strong>,</p>
              <p style="margin: 0 0 12px; line-height: 1.6; color: #374151;">
                Temos o prazer de entregar o seu Kit de Tradução Oficial, processado e revisado por nossa equipe especializada.
              </p>

              <div style="margin: 24px 0;">
                <p style="font-size: 11px; font-weight: bold; color: #9ca3af; letter-spacing: 1px; margin-bottom: 12px; text-transform: uppercase;">
                  ${docs.filter(d => d.delivery_pdf_url).length} Documento(s) Liberado(s)
                </p>
                ${docLinks}
              </div>

              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                <p style="margin: 0 0 4px; color: #374151; font-size: 14px;">Atenciosamente,</p>
                <p style="margin: 0; color: #111827; font-weight: bold; font-size: 15px;">Equipe Promobidocs</p>
                <p style="margin: 0; color: #f5b000; font-size: 13px; font-weight: bold;">www.promobidocs.com</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 20px; text-align: center; color: #9ca3af; font-size: 11px; border-top: 1px solid #f3f4f6;">
              © 2026 Promobidocs Services · Orlando, FL · Tradução e Notarização
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  })

  if (error) {
    console.error(`[sendDeliveryEmail] ❌ Falha no Resend:`, JSON.stringify(error, null, 2))
    throw new Error(`Resend Error: ${error.message} (${(error as any).name || 'Unknown'})`)
  } else {
    console.log(`[sendDeliveryEmail] ✅ Enviado com sucesso!`, JSON.stringify(data, null, 2))
  }
}
