'use server'

import prisma from '@/lib/prisma'

function resolveApiBaseUrl(): string {
  const envBase =
    process.env.INTERNAL_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  return (envBase || 'http://localhost:3000').replace(/\/$/, '')
}

export async function autoTranslateOrder(orderId: number): Promise<{
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
    console.log(`[autoTranslateOrder] order=${orderId} error: order not found`)
    return { success: false, translatedDocs: 0, attemptedDocs: 0, errorCount: 1 }
  }

  const endpoint = `${resolveApiBaseUrl()}/api/translate/claude`
  const eligibleDocs = order.documents.filter((doc) => {
    if (!doc.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') return false
    if (doc.externalTranslationUrl) return false
    if (doc.translatedText && doc.translatedText.trim().length > 0) return false
    if (doc.excludedFromScope) return false
    return true
  })

  let translatedDocs = 0
  let errorCount = 0

  for (const doc of eligibleDocs) {
    const fileUrl = doc.scopedFileUrl || doc.originalFileUrl

    try {
      console.log(`[autoTranslateOrder] order=${orderId} doc=${doc.id} dispatching ${fileUrl}`)

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
        console.log(`[autoTranslateOrder] order=${orderId} doc=${doc.id} error: translation failed`)
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
      console.log(`[autoTranslateOrder] order=${orderId} doc=${doc.id} success`)
    } catch (error) {
      errorCount += 1
      console.log(
        `[autoTranslateOrder] order=${orderId} doc=${doc.id} error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
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
    console.log(`[autoTranslateOrder] order=${orderId} -> READY_FOR_REVIEW`)
  } else if (eligibleDocs.length > 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'MANUAL_TRANSLATION_NEEDED' as any },
    })
    console.log(`[autoTranslateOrder] order=${orderId} -> MANUAL_TRANSLATION_NEEDED`)
  }

  return {
    success: readyDocCount > 0,
    translatedDocs,
    attemptedDocs: eligibleDocs.length,
    errorCount,
  }
}
