'use server'

import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'

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

        await prisma.document.update({
            where: { id: docId },
            // externalTranslationUrl exists in DB; cast silences stale Prisma client cache
            data: {
                externalTranslationUrl: publicUrl,
                translation_status: 'translated',
            } as any,
        })

        return { success: true, url: publicUrl }

    } catch (err: any) {
        console.error('[uploadExternal] Erro:', err)
        return { success: false, error: err.message || 'Erro interno ao processar o arquivo.' }
    }
}

export async function removeExternalTranslation(docId: number) {
    try {
        await prisma.document.update({
            where: { id: docId },
            // externalTranslationUrl exists in DB; cast silences stale Prisma client cache
            data: { externalTranslationUrl: null } as any,
        })
        return { success: true }
    } catch (err: any) {
        console.error('[removeExternal] Erro:', err)
        return { success: false, error: err.message || 'Erro ao remover a tradução externa.' }
    }
}
