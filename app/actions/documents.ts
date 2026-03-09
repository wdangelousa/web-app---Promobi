'use server'

import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

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
                pageRotations: Prisma.DbNull,
            },
        })

        return { success: true, url: publicUrl }

    } catch (err: any) {
        console.error('[replaceOriginalDocument] Erro:', err)
        return { success: false, error: err.message || 'Erro interno ao processar o arquivo.' }
    }
}

// ─── addDocumentToOrder ───────────────────────────────────────────────────────
// Uploads a new document file and links it to an existing order.
// Must only be called for orders that have NOT yet been paid.
export async function addDocumentToOrder(formData: FormData) {
    const file = formData.get('file') as File
    const orderId = Number(formData.get('orderId'))

    if (!file || !orderId) {
        return { success: false, error: 'Arquivo inválido ou ID do pedido em falta.' }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    try {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
        const safeName = `original_order${orderId}_${Date.now()}.${ext}`

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

        const docType = file.name.replace(/\.[^/.]+$/, '')

        const document = await prisma.document.create({
            data: {
                orderId,
                docType,
                originalFileUrl: data.publicUrl,
                translation_status: 'pending',
            },
        })

        // Reopen the budget: revert order to PENDING so a new proposal can be generated
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'PENDING' as any },
        })

        return { success: true, documentId: document.id, orderReopened: true }
    } catch (err: any) {
        console.error('[addDocumentToOrder] Erro:', err)
        return { success: false, error: err.message || 'Erro interno ao processar o arquivo.' }
    }
}

// ─── deleteDocumentFromOrder ──────────────────────────────────────────────────
// Removes a document record from the database.
// Must only be called for orders that have NOT yet been paid.
export async function deleteDocumentFromOrder(documentId: number) {
    if (!documentId) {
        return { success: false, error: 'ID do documento inválido.' }
    }

    try {
        await prisma.document.delete({ where: { id: documentId } })
        return { success: true }
    } catch (err: any) {
        console.error('[deleteDocumentFromOrder] Erro:', err)
        return { success: false, error: err.message || 'Erro interno ao remover o documento.' }
    }
}

// ─── repairDocumentLinks ──────────────────────────────────────────────────────
// Cura as URLs de documentos 404 refazendo o getPublicUrl com o Supabase.
// Especialmente util para IFrames que perderam contexto de URL ou de bucket.
export async function repairDocumentLinks(orderId: number) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { documents: true }
        });

        if (!order) return { success: false, error: 'Pedido não encontrado' };

        let repairedCount = 0;

        // Obter URL pública gerada na hora e atualizar banco onde der diferente
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const supabaseForRepair = createClient(supabaseUrl, supabaseKey);

        for (const doc of order.documents) {
            if (doc.originalFileUrl && doc.originalFileUrl.includes('/documents/')) {
                const urlParts = doc.originalFileUrl.split('/documents/');
                if (urlParts.length > 1) {
                    const filePath = urlParts[1].split('?')[0];
                    const { data } = supabaseForRepair.storage.from('documents').getPublicUrl(filePath);

                    if (data.publicUrl && data.publicUrl !== doc.originalFileUrl) {
                        await prisma.document.update({
                            where: { id: doc.id },
                            data: { originalFileUrl: data.publicUrl }
                        });
                        repairedCount++;
                    }
                }
            }
        }

        return { success: true, count: repairedCount }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
