'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { triggerAnthropicTranslationForOrder } from '@/lib/orderTranslationDispatch'

export async function retryTranslation(orderId: number) {
    try {
        console.log(`[retryTranslation] Resetting error documents for order #${orderId}`)

        // Reset any documents in 'error' status back to 'pending'
        await prisma.document.updateMany({
            where: {
                orderId: orderId,
                translation_status: 'error'
            },
            data: {
                translation_status: 'pending'
            }
        })

        console.log(`[retryTranslation] Triggering Anthropic translation for order #${orderId}`)
        const result = await triggerAnthropicTranslationForOrder(orderId)
        if (!result.success && result.attemptedDocs === 0) {
            throw new Error('Nenhum documento elegível para reprocessamento.')
        }

        revalidatePath(`/admin/orders/${orderId}`)
        return { success: true }
    } catch (error: any) {
        console.error(`[retryTranslation] Failed for order ${orderId}:`, error)
        return { success: false, error: error.message || 'Falha ao acionar tradução automática.' }
    }
}
