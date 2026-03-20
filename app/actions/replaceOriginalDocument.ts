'use server'

import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/app/actions/auth'
import { clearPageParityRegistryRecord, parseOrderMetadata, upsertPlanoBRecord } from '@/lib/translationArtifactSource'

export async function replaceOriginalDocument(formData: FormData) {
  const file = formData.get('file') as File
  const docId = Number(formData.get('documentId'))
  // preserveTranslation=true means cosmetic replacement — skip clearing translation fields.
  // preserveTranslation=false (default) means content changed — clear minimum required fields.
  const preserveTranslation = formData.get('preserveTranslation') === 'true'

  if (!file || !docId) {
    return { success: false, error: 'Arquivo inválido ou ID do documento em falta.' }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { success: false, error: 'Configuração de storage ausente.' }
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Fetch existing document state for audit trail + to derive orderId
    const existingDoc = await prisma.document.findUnique({
      where: { id: docId },
      select: { orderId: true, originalFileUrl: true },
    })

    if (!existingDoc) {
      return { success: false, error: 'Documento não encontrado.' }
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const safeName = `original_${docId}_${Date.now()}.${ext}`
    const storagePath = `orders/originals/${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      return { success: false, error: `Falha no upload: ${uploadError.message}` }
    }

    const { data } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath)

    // Build document update — minimum required fields cleared on content-changing replacements
    const docUpdate: Record<string, unknown> = {
      originalFileUrl: data.publicUrl,
      pageRotations: Prisma.DbNull,
    }
    if (!preserveTranslation) {
      docUpdate.translatedText = null
      docUpdate.translation_status = 'pending'
      docUpdate.isReviewed = false
      docUpdate.delivery_pdf_url = null
    }

    // Fetch user + order metadata in parallel for the audit trail
    const [user, order] = await Promise.all([
      getCurrentUser(),
      prisma.order.findUnique({
        where: { id: existingDoc.orderId },
        select: { metadata: true },
      }),
    ])

    const replacedBy = user?.email ?? null
    const parsedMetadata = parseOrderMetadata(order?.metadata as string | null | undefined)
    let nextMetadata = upsertPlanoBRecord(parsedMetadata, docId, {
      replacedAt: new Date().toISOString(),
      replacedBy,
      previousUrl: existingDoc.originalFileUrl ?? null,
      newUrl: data.publicUrl,
      preserveTranslation,
      translationCleared: !preserveTranslation,
    })
    // Content-changing replacement: stale parity decision (from the old file) must
    // not carry over to the new translation run.
    if (!preserveTranslation) {
      nextMetadata = clearPageParityRegistryRecord(nextMetadata, docId)
    }

    // Atomically update document + order metadata
    await prisma.$transaction([
      prisma.document.update({ where: { id: docId }, data: docUpdate as any }),
      prisma.order.update({
        where: { id: existingDoc.orderId },
        data: { metadata: JSON.stringify(nextMetadata) },
      }),
    ])

    console.log(
      `[replaceOriginalDocument] Doc #${docId} Order #${existingDoc.orderId} — ` +
      `preserveTranslation=${preserveTranslation} translationCleared=${!preserveTranslation} ` +
      `replacedBy=${replacedBy ?? 'unknown'}`,
    )

    return { success: true, url: data.publicUrl, translationCleared: !preserveTranslation }
  } catch (err: any) {
    console.error('[replaceOriginalDocument] Erro:', err)
    return { success: false, error: err.message || 'Erro interno ao processar o arquivo.' }
  }
}
