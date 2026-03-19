'use server'

import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

export async function replaceOriginalDocument(formData: FormData) {
  const file = formData.get('file') as File
  const docId = Number(formData.get('documentId'))

  if (!file || !docId) {
    return { success: false, error: 'Arquivo inválido ou ID do documento em falta.' }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { success: false, error: 'Configuração de storage ausente.' }
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const safeName = `original_${docId}_${Date.now()}.${ext}`
    const storagePath = `orders/originals/${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      return { success: false, error: `Falha no upload: ${uploadError.message}` }
    }

    const { data } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath)

    await prisma.document.update({
      where: { id: docId },
      data: {
        originalFileUrl: data.publicUrl,
        pageRotations: Prisma.DbNull,
      },
    })

    return { success: true, url: data.publicUrl }
  } catch (err: any) {
    console.error('[replaceOriginalDocument] Erro:', err)
    return { success: false, error: err.message || 'Erro interno ao processar o arquivo.' }
  }
}

