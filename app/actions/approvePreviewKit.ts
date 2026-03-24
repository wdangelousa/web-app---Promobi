'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export interface ApprovePreviewKitResult {
    success: boolean
    error?: string
}

export async function approvePreviewKit(
    orderId: number,
    documentId: number,
    previewUrl: string,
): Promise<ApprovePreviewKitResult> {
    try {
        if (!previewUrl || typeof previewUrl !== 'string') {
            return { success: false, error: 'Preview URL is required.' }
        }

        const doc = await prisma.document.findUnique({
            where: { id: documentId },
            select: { id: true, orderId: true },
        })

        if (!doc) {
            return { success: false, error: 'Documento não encontrado.' }
        }
        if (doc.orderId !== orderId) {
            return { success: false, error: 'Documento não pertence a este pedido.' }
        }

        await prisma.document.update({
            where: { id: documentId },
            data: { approvedKitUrl: previewUrl },
        })

        console.log(
            `[approvePreviewKit] ✅ Order #${orderId} Doc #${documentId} kit frozen: ${previewUrl}`
        )

        revalidatePath(`/admin/orders/${orderId}`)
        return { success: true }

    } catch (error: any) {
        console.error('[approvePreviewKit] Error:', error)
        return { success: false, error: error?.message ?? 'Erro ao aprovar kit.' }
    }
}
