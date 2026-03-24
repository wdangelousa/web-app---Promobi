'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import {
    parseOrderMetadata,
    resolveTranslationArtifactSelection,
    upsertApprovedPreviewArtifactRegistryRecord,
} from '@/lib/translationArtifactSource'

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
            select: {
                id: true,
                orderId: true,
                translatedText: true,
                translatedFileUrl: true,
                externalTranslationUrl: true,
                order: {
                    select: {
                        metadata: true,
                    },
                },
            },
        })

        if (!doc) {
            return { success: false, error: 'Documento não encontrado.' }
        }
        if (doc.orderId !== orderId) {
            return { success: false, error: 'Documento não pertence a este pedido.' }
        }

        const artifactSelection = resolveTranslationArtifactSelection({
            externalTranslationUrl: doc.externalTranslationUrl,
            translatedText: doc.translatedText,
            translatedFileUrl: doc.translatedFileUrl,
        })
        const parsedOrderMetadata = parseOrderMetadata(
            doc.order?.metadata as string | null | undefined,
        )
        const nextMetadata = upsertApprovedPreviewArtifactRegistryRecord(
            parsedOrderMetadata,
            documentId,
            {
                source: artifactSelection.source,
                selectedArtifactUrl: artifactSelection.selectedArtifactUrl,
                previewPdfUrl: previewUrl,
                approvedAt: new Date().toISOString(),
            },
        )

        await prisma.$transaction([
            prisma.document.update({
                where: { id: documentId },
                data: { approvedKitUrl: previewUrl },
            }),
            prisma.order.update({
                where: { id: orderId },
                data: { metadata: JSON.stringify(nextMetadata) },
            }),
        ])

        console.log(
            `[approvePreviewKit] ✅ Order #${orderId} Doc #${documentId} kit frozen: ${JSON.stringify({
                previewUrl,
                selectedTranslationArtifactSource: artifactSelection.source,
                selectedArtifactUrlOrPath: artifactSelection.selectedArtifactUrl,
            })}`
        )

        revalidatePath(`/admin/orders/${orderId}`)
        return { success: true }

    } catch (error: any) {
        console.error('[approvePreviewKit] Error:', error)
        return { success: false, error: error?.message ?? 'Erro ao aprovar kit.' }
    }
}
