'use server'

import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'

export async function uploadExternalTranslation(formData: FormData) {
    const file = formData.get('file') as File
    const docId = Number(formData.get('documentId'))

    if (!file || !docId) {
        return { success: false, error: 'Arquivo inválido ou ID do documento em falta.' }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
        return { success: false, error: 'Credenciais do Supabase não configuradas no servidor.' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    try {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        // Cria um nome único para o arquivo
        const safeName = `external_translation_${docId}_${Date.now()}.pdf`

        // Faz o upload para o bucket 'documents' na pasta 'orders/external'
        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(`orders/external/${safeName}`, buffer, {
                contentType: file.type,
                upsert: false
            })

        if (uploadError) {
            return { success: false, error: `Falha no upload: ${uploadError.message}` }
        }

        // Pega a URL pública do arquivo que acabou de subir
        const { data } = supabase.storage
            .from('documents')
            .getPublicUrl(`orders/external/${safeName}`)

        const publicUrl = data.publicUrl

        // Atualiza o banco de dados do Prisma com a nova URL
        await prisma.document.update({
            where: { id: docId },
            data: {
                externalTranslationUrl: publicUrl,
                translation_status: 'translated'
            } as any
        })

        return { success: true, url: publicUrl }

    } catch (err: any) {
        console.error('[uploadExternal] Erro:', err)
        return { success: false, error: err.message || 'Erro interno ao processar o arquivo.' }
    }
}

export async function removeExternalTranslation(docId: number) {
    try {
        // Apenas limpa o campo no banco de dados para voltar a usar o editor de texto
        await prisma.document.update({
            where: { id: docId },
            data: { externalTranslationUrl: null }
        })
        return { success: true }
    } catch (err: any) {
        console.error('[removeExternal] Erro:', err)
        return { success: false, error: err.message || 'Erro ao remover a tradução externa.' }
    }
}