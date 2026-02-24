// app/api/workbench/upload-delivery/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// API Route: recebe o PDF traduzido formatado (upload de Isabele),
// salva no Supabase Storage e retorna a URL pública.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/app/actions/auth'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  try {
    // Auth check
    const user = await getCurrentUser()
    if (!user || !['OPERATIONS', 'TECHNICAL', 'ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    // Parse multipart form
    const form = await req.formData()
    const file = form.get('file') as File | null
    const docIdRaw = form.get('docId') as string | null
    const orderIdRaw = form.get('orderId') as string | null

    if (!file || !docIdRaw || !orderIdRaw) {
      return NextResponse.json({ error: 'Campos obrigatórios: file, docId, orderId.' }, { status: 400 })
    }

    const docId = parseInt(docIdRaw)
    const orderId = parseInt(orderIdRaw)
    if (isNaN(docId) || isNaN(orderId)) {
      return NextResponse.json({ error: 'docId e orderId devem ser números.' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Apenas arquivos PDF são aceitos.' }, { status: 400 })
    }

    // Max 50MB
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo excede o limite de 50MB.' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const storagePath = `deliveries/${orderId}/${docId}_${Date.now()}.pdf`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('[upload-delivery] Storage error:', uploadError)
      return NextResponse.json({ error: 'Falha no upload para o storage.' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath)

    const publicUrl = urlData.publicUrl

    // Save URL to Document record
    await prisma.document.update({
      where: { id: docId },
      data: { delivery_pdf_url: publicUrl },
    })

    console.log(`[upload-delivery] ✅ Doc #${docId} PDF uploaded → ${publicUrl}`)
    return NextResponse.json({ success: true, url: publicUrl })

  } catch (err: any) {
    console.error('[upload-delivery] Error:', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno.' }, { status: 500 })
  }
}
