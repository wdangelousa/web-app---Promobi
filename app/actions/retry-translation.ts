'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { triggerAnthropicTranslationForOrder } from '@/lib/orderTranslationDispatch'
import { parseOrderMetadata } from '@/lib/translationArtifactSource'
import { getTranslationLockState } from '@/lib/translationLock'

export async function retryTranslation(orderId: number) {
  try {
    console.log(`[retryTranslation] Resetting error documents for order #${orderId}`)

    await prisma.document.updateMany({
      where: {
        orderId,
        translation_status: 'error',
      },
      data: {
        translation_status: 'pending',
      },
    })

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        metadata: true,
        documents: {
          where: { translation_status: 'processing' },
          select: { id: true },
        },
      },
    })

    const metadata = parseOrderMetadata(order?.metadata as string | null | undefined)
    const staleDocIds =
      order?.documents
        .map((doc) => {
          const lockState = getTranslationLockState(metadata, doc.id)
          if (
            !lockState.isStale ||
            !lockState.translationStartedAt ||
            lockState.staleDurationMs === null
          ) {
            return null
          }

          console.warn(
            `[retryTranslation] ${JSON.stringify({
              action: 'stale_lock_released',
              orderId,
              docId: doc.id,
              translationStartedAt: lockState.translationStartedAt,
              staleDurationMs: lockState.staleDurationMs,
            })}`,
          )
          return doc.id
        })
        .filter((docId): docId is number => Number.isInteger(docId)) ?? []

    if (staleDocIds.length > 0) {
      await prisma.document.updateMany({
        where: {
          id: { in: staleDocIds },
          orderId,
          translation_status: 'processing',
        },
        data: {
          translation_status: 'pending',
        },
      })
    }

    console.log(`[retryTranslation] Triggering Anthropic translation for order #${orderId}`)
    const result = await triggerAnthropicTranslationForOrder(orderId)
    if (!result.success && result.attemptedDocs === 0) {
      throw new Error('Nenhum documento elegível para reprocessamento.')
    }

    revalidatePath(`/admin/orders/${orderId}`)
    return { success: true }
  } catch (error: any) {
    console.error(`[retryTranslation] Failed for order ${orderId}:`, error)
    return {
      success: false,
      error: error.message || 'Falha ao acionar tradução automática.',
    }
  }
}
