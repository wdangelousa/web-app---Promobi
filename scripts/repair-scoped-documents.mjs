import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument } from 'pdf-lib'

const prisma = new PrismaClient()

function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar definidos no .env')
  }
  return createClient(url, key)
}

async function main() {
  const shouldApply = process.argv.includes('--apply')

  console.log(`\n=== Reparo de documentos com escopo parcial ===`)
  console.log(`Modo: ${shouldApply ? 'APLICAR' : 'DRY-RUN (use --apply para aplicar)'}\n`)

  const documents = await prisma.document.findMany({
    where: {
      scopedFileUrl: null,
      excludedFromScope: false,
      billablePages: { not: null },
      totalPages: { not: null },
    },
    select: {
      id: true,
      orderId: true,
      originalFileUrl: true,
      billablePages: true,
      totalPages: true,
    },
    orderBy: { id: 'asc' },
  })

  const candidates = documents.filter(
    (doc) => doc.billablePages < doc.totalPages,
  )

  console.log(`Encontrados: ${documents.length} documento(s) sem scopedFileUrl`)
  console.log(`Candidatos (billablePages < totalPages): ${candidates.length}\n`)

  if (candidates.length === 0) {
    console.log('Nenhum documento para reparar.')
    return
  }

  const supabase = createSupabaseAdmin()
  let repaired = 0
  let skipped = 0
  let errors = 0

  for (const doc of candidates) {
    const label = `order=${doc.orderId} doc=${doc.id} (${doc.billablePages}/${doc.totalPages} páginas)`

    if (!doc.originalFileUrl) {
      console.log(`[skip] ${label} — originalFileUrl vazio`)
      skipped++
      continue
    }

    try {
      const sourceRes = await fetch(doc.originalFileUrl)
      if (!sourceRes.ok) {
        console.log(`[erro] ${label} — fetch falhou (${sourceRes.status})`)
        errors++
        continue
      }

      const contentType = sourceRes.headers.get('content-type') || ''
      const isPdf = contentType.toLowerCase().includes('pdf') || /\.pdf($|\?)/i.test(doc.originalFileUrl)
      if (!isPdf) {
        console.log(`[skip] ${label} — não é PDF (${contentType})`)
        skipped++
        continue
      }

      const sourceBuffer = await sourceRes.arrayBuffer()
      const sourcePdf = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true })
      const sourcePageCount = sourcePdf.getPageCount()

      if (doc.billablePages >= sourcePageCount) {
        console.log(`[skip] ${label} — billablePages >= páginas reais do PDF (${sourcePageCount})`)
        skipped++
        continue
      }

      const pageIndexes = Array.from({ length: doc.billablePages }, (_, i) => i)
      const scopedPdf = await PDFDocument.create()
      const copiedPages = await scopedPdf.copyPages(sourcePdf, pageIndexes)
      copiedPages.forEach((page) => scopedPdf.addPage(page))
      const scopedBytes = await scopedPdf.save()

      const storagePath = `orders/scoped/order-${doc.orderId}-doc-${doc.id}-scoped.pdf`

      if (!shouldApply) {
        console.log(`[dry-run] ${label} — geraria PDF com ${doc.billablePages} páginas -> ${storagePath}`)
        repaired++
        continue
      }

      const { error: uploadError } = await supabase.storage
        .from('translations')
        .upload(storagePath, Buffer.from(scopedBytes), {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadError) {
        console.log(`[erro] ${label} — upload falhou: ${uploadError.message}`)
        errors++
        continue
      }

      const { data } = supabase.storage.from('translations').getPublicUrl(storagePath)

      await prisma.document.update({
        where: { id: doc.id },
        data: { scopedFileUrl: data.publicUrl },
      })

      console.log(`[reparado] ${label} -> ${data.publicUrl}`)
      repaired++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`[erro] ${label} — ${message}`)
      errors++
    }
  }

  console.log(`\n=== Resultado ===`)
  console.log(`Reparados: ${repaired}`)
  console.log(`Ignorados: ${skipped}`)
  console.log(`Erros:     ${errors}`)
  console.log(`Total:     ${candidates.length}\n`)
}

main()
  .catch((error) => {
    console.error('Reparo de documentos falhou:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
