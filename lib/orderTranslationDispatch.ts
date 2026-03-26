'use server'

import prisma from '@/lib/prisma'
import { resolveDocumentSourceFileUrl } from '@/lib/documentSource'

function resolveApiBaseUrl(): string {
  const envBase =
    process.env.INTERNAL_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  return (envBase || 'http://localhost:3000').replace(/\/$/, '')
}

export async function triggerAnthropicTranslationForOrder(orderId: number): Promise<{
  success: boolean
  translatedDocs: number
  attemptedDocs: number
  errorCount: number
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      documents: {
        select: {
          id: true,
          originalFileUrl: true,
          scopedFileUrl: true,
          translatedText: true,
          externalTranslationUrl: true,
          sourceLanguage: true,
          excludedFromScope: true,
        },
        orderBy: { id: 'asc' },
      },
    },
  })

  if (!order) {
    return { success: false, translatedDocs: 0, attemptedDocs: 0, errorCount: 1 }
  }

  const endpoint = `${resolveApiBaseUrl()}/api/translate/claude`
  const eligibleDocs = order.documents.filter((doc) => {
    if (doc.excludedFromScope) return false
    if (doc.externalTranslationUrl) return false
    if (doc.translatedText && doc.translatedText.trim().length > 0) return false
    return Boolean(resolveDocumentSourceFileUrl(doc))
  })

  let translatedDocs = 0
  let errorCount = 0

  for (const doc of eligibleDocs) {
    const fileUrl = resolveDocumentSourceFileUrl(doc)
    if (!fileUrl) continue

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl,
          documentId: doc.id,
          orderId,
          sourceLanguage: doc.sourceLanguage || 'pt',
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data?.translatedText !== 'string' || data.translatedText.trim().length === 0) {
        errorCount += 1
        await prisma.document.update({
          where: { id: doc.id },
          data: { translation_status: 'error' },
        })
        continue
      }

      await prisma.document.update({
        where: { id: doc.id },
        data: {
          translatedText: data.translatedText,
          translation_status: 'ai_draft',
        },
      })
      translatedDocs += 1
    } catch (error) {
      console.error('[triggerAnthropicTranslationForOrder] dispatch failed for doc', doc.id, error)
      errorCount += 1
      await prisma.document.update({
        where: { id: doc.id },
        data: { translation_status: 'error' },
      })
    }
  }

  const readyDocCount = await prisma.document.count({
    where: {
      orderId,
      excludedFromScope: false,
      OR: [
        { externalTranslationUrl: { not: null } },
        { translatedText: { not: null } },
      ],
    },
  })

  if (readyDocCount > 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'READY_FOR_REVIEW' as any },
    })
  } else if (eligibleDocs.length > 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'MANUAL_TRANSLATION_NEEDED' as any },
    })
  }

  return {
    success: readyDocCount > 0,
    translatedDocs,
    attemptedDocs: eligibleDocs.length,
    errorCount,
  }
}
