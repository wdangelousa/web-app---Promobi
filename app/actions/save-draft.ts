'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function saveDocumentDraft(docId: number, text: string, orderId: number) {
    try {
        await prisma.document.update({
            where: { id: docId },
            data: {
                translatedText: text,
                translation_status: 'REVISED' // Mark as revised when manually saved in workbench
            }
        })

        revalidatePath(`/admin/orders/${orderId}`)
        return { success: true }
    } catch (error) {
        console.error('Error saving document draft:', error)
        return { success: false, error: 'Failed to save draft' }
    }
}
