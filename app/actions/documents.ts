'use server'

import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'

// ─── replaceOriginalDocument ──────────────────────────────────────────────────
// Uploads a new file to replace the client's original document.
// Intentionally preserves translatedText and externalTranslationUrl so the
// operator doesn't lose their translation work after swapping the source file.
// pageRotations is reset to null because the new file has its own orientation.

export async function replaceOriginalDocument(formData: FormData) {
    const file = formData.get('file') as File
    const docId = Number(formData.get('documentId'))

    if (!file || !docId) {
        return { success: false, error: 'Arquivo inválido ou ID do documento em falta.' }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const supabase = createClient(supabaseUrl, supabaseKey)

    try {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
        const safeName = `original_${docId}_${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(`orders/originals/${safeName}`, buffer, {
                contentType: file.type || 'application/octet-stream',
                upsert: false,
            })

        if (uploadError) {
            return { success: false, error: `Falha no upload: ${uploadError.message}` }
        }

        const { data } = supabase.storage
            .from('documents')
            .getPublicUrl(`orders/originals/${safeName}`)

        const publicUrl = data.publicUrl

        // Update originalFileUrl and clear per-page rotations.
        // translatedText and externalTranslationUrl are NOT touched.
        await prisma.document.update({
            where: { id: docId },
            data: {
                originalFileUrl: publicUrl,
                pageRotations: null,
            },
        })

        return { success: true, url: publicUrl }

    } catch (err: any) {
        console.error('[replaceOriginalDocument] Erro:', err)
        return { success: false, error: err.message || 'Erro interno ao processar o arquivo.' }
    }
}
