'use server'

import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/app/actions/auth'
import { parseOrderMetadata, upsertExternalPdfAuditRecord } from '@/lib/translationArtifactSource'

export async function uploadExternalTranslation(formData: FormData) {
    const file = formData.get('file') as File
    const docId = Number(formData.get('documentId'))

    if (!file || !docId) {
        return { success: false, error: 'Arquivo inválido ou ID do documento em falta.' }
    }

    // Non-null assertions: resolve string | undefined → string for createClient
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const supabase = createClient(supabaseUrl, supabaseKey)

    try {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const safeName = `external_translation_${docId}_${Date.now()}.pdf`

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(`orders/external/${safeName}`, buffer, {
                contentType: file.type,
                upsert: false,
            })

        if (uploadError) {
            return { success: false, error: `Falha no upload: ${uploadError.message}` }
        }

        const { data } = supabase.storage
            .from('documents')
            .getPublicUrl(`orders/external/${safeName}`)

        const publicUrl = data.publicUrl

        // Fetch user + doc in parallel for audit trail
        const [user, existingDoc] = await Promise.all([
            getCurrentUser(),
            prisma.document.findUnique({ where: { id: docId }, select: { orderId: true } }),
        ])
        const actedBy = user?.email ?? null

        if (existingDoc) {
            const order = await prisma.order.findUnique({
                where: { id: existingDoc.orderId },
                select: { metadata: true },
            })
            const parsedMetadata = parseOrderMetadata(order?.metadata as string | null | undefined)
            const nextMetadata = upsertExternalPdfAuditRecord(parsedMetadata, docId, {
                action: 'upload',
                actedAt: new Date().toISOString(),
                actedBy,
                externalPdfUrl: publicUrl,
            })

            await prisma.$transaction([
                prisma.document.update({
                    where: { id: docId },
                    // externalTranslationUrl exists in DB; cast silences stale Prisma client cache
                    data: {
                        externalTranslationUrl: publicUrl,
                        translation_status: 'translated',
                    } as any,
                }),
                prisma.order.update({
                    where: { id: existingDoc.orderId },
                    data: { metadata: JSON.stringify(nextMetadata) },
                }),
            ])
        } else {
            await prisma.document.update({
                where: { id: docId },
                data: {
                    externalTranslationUrl: publicUrl,
                    translation_status: 'translated',
                } as any,
            })
        }

        console.log(
            `[uploadExternal] Doc #${docId} — external PDF uploaded ` +
            `actedBy=${actedBy ?? 'unknown'} url=${publicUrl}`,
        )

        return { success: true, url: publicUrl }

    } catch (err: any) {
        console.error('[uploadExternal] Erro:', err)
        return { success: false, error: err.message || 'Erro interno ao processar o arquivo.' }
    }
}

export async function removeExternalTranslation(docId: number) {
    try {
        const [user, existingDoc] = await Promise.all([
            getCurrentUser(),
            prisma.document.findUnique({
                where: { id: docId },
                select: { orderId: true, externalTranslationUrl: true, translatedText: true },
            }),
        ])
        const actedBy = user?.email ?? null

        if (existingDoc) {
            const order = await prisma.order.findUnique({
                where: { id: existingDoc.orderId },
                select: { metadata: true },
            })
            const parsedMetadata = parseOrderMetadata(order?.metadata as string | null | undefined)
            const nextMetadata = upsertExternalPdfAuditRecord(parsedMetadata, docId, {
                action: 'remove',
                actedAt: new Date().toISOString(),
                actedBy,
                externalPdfUrl: null,
            })

            // Determine correct status after removal: if a text draft exists keep 'reviewed',
            // otherwise reset to 'pending' so the operator knows to re-run translation.
            const statusAfterRemoval = existingDoc.translatedText?.trim() ? 'reviewed' : 'pending'

            await prisma.$transaction([
                prisma.document.update({
                    where: { id: docId },
                    // externalTranslationUrl exists in DB; cast silences stale Prisma client cache
                    data: { externalTranslationUrl: null, translation_status: statusAfterRemoval } as any,
                }),
                prisma.order.update({
                    where: { id: existingDoc.orderId },
                    data: { metadata: JSON.stringify(nextMetadata) },
                }),
            ])
        } else {
            await prisma.document.update({
                where: { id: docId },
                data: { externalTranslationUrl: null } as any,
            })
        }

        console.log(`[uploadExternal] Doc #${docId} — external PDF removed actedBy=${actedBy ?? 'unknown'}`)

        return { success: true }
    } catch (err: any) {
        console.error('[removeExternal] Erro:', err)
        return { success: false, error: err.message || 'Erro ao remover a tradução externa.' }
    }
}
