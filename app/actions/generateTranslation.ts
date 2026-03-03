'use server'

import * as deepl from 'deepl-node'
import prisma from '../../lib/prisma'

// ─── Azure Document Intelligence ─────────────────────────────────────────────

async function analyzeDocument(fileUrl: string): Promise<string> {
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  const endpointRaw = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || ''
  const baseUrl = endpointRaw.replace(/\/$/, '')

  if (!baseUrl || !apiKey) {
    throw new Error('Missing AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT or AZURE_DOCUMENT_INTELLIGENCE_KEY')
  }

  // FormRecognizer resources (kind: FormRecognizer) require the /formrecognizer prefix + v3.1 GA version
  const analyzeUrl = `${baseUrl}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`

  console.log(`[AzureDI] URL → ${analyzeUrl}`)

  const submitRes = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ urlSource: fileUrl }),
  })

  if (!submitRes.ok) {
    const errText = await submitRes.text()
    throw new Error(`Azure DI submit failed [${submitRes.status}]: ${errText}`)
  }

  const operationLocation = submitRes.headers.get('Operation-Location')
  if (!operationLocation) {
    throw new Error('Azure DI: missing Operation-Location header in submit response')
  }

  // Poll until succeeded or failed (max 60s at 2s intervals)
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise<void>(r => setTimeout(r, 2000))

    const pollRes = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    })
    if (!pollRes.ok) {
      throw new Error(`Azure DI poll failed [${pollRes.status}]`)
    }

    const result = await pollRes.json() as {
      status: string
      analyzeResult?: any
      error?: any
    }

    if (result.status === 'succeeded') {
      return buildHtml(result.analyzeResult)
    }
    if (result.status === 'failed') {
      throw new Error(`Azure DI analysis failed: ${JSON.stringify(result.error)}`)
    }
    // status: 'running' | 'notStarted' — keep polling
  }

  throw new Error('Azure DI analysis timed out after 60s')
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function firstOffset(el: { spans?: { offset: number }[] }): number {
  return el.spans?.[0]?.offset ?? 0
}

function buildHtml(analyzeResult: any): string {
  const paragraphs: any[] = analyzeResult.paragraphs ?? []
  const tables: any[] = analyzeResult.tables ?? []

  // Compute table span ranges to skip paragraph elements that live inside a table
  const tableRanges = tables.map((t: any) => ({
    start: firstOffset(t),
    end: firstOffset(t) + (t.spans?.[0]?.length ?? 0),
  }))

  function isInsideTable(offset: number): boolean {
    return tableRanges.some(r => offset >= r.start && offset < r.end)
  }

  type HtmlElement = { offset: number; html: string }
  const elements: HtmlElement[] = []

  // Paragraphs → <p>
  for (const para of paragraphs) {
    const offset = firstOffset(para)
    if (isInsideTable(offset)) continue
    // Skip running headers / footers — reduces noise in Quill
    if (para.role === 'pageHeader' || para.role === 'pageFooter') continue
    const content = (para.content as string | undefined)?.trim()
    if (!content) continue
    elements.push({ offset, html: `<p>${content}</p>` })
  }

  // Tables → <table>
  for (const table of tables) {
    const offset = firstOffset(table)
    const rows = new Map<number, string[]>()

    for (const cell of (table.cells ?? [])) {
      if (!rows.has(cell.rowIndex)) rows.set(cell.rowIndex, [])
      const tag = cell.kind === 'columnHeader' ? 'th' : 'td'
      const colspan = cell.columnSpan > 1 ? ` colspan="${cell.columnSpan}"` : ''
      const rowspan = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''
      rows
        .get(cell.rowIndex)!
        .push(`<${tag}${colspan}${rowspan} style="padding:4px;border:1px solid #ccc;">${cell.content}</${tag}>`)
    }

    const rowsHtml = Array.from(rows.entries())
      .sort(([a], [b]) => a - b)
      .map(([, cells]) => `<tr>${cells.join('')}</tr>`)
      .join('')

    elements.push({
      offset,
      html: `<table style="border-collapse:collapse;width:100%;margin-bottom:1em;">${rowsHtml}</table>`,
    })
  }

  elements.sort((a, b) => a.offset - b.offset)
  return elements.map(e => e.html).join('\n')
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateTranslationDraft(orderId: number) {
  console.log(`[AzureTranslation] Starting for Order #${orderId}`)

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { documents: true },
    })
    if (!order) return { success: false, error: 'Order not found' }

    const authKey = process.env.DEEPL_API_KEY
    if (!authKey) return { success: false, error: 'Missing DEEPL_API_KEY' }

    const translator = new deepl.Translator(authKey)
    let completedCount = 0
    let lastTranslatedText = ''

    for (const doc of order.documents) {
      try {
        if (!doc.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') continue

        console.log(`[AzureTranslation] Doc #${doc.id} → ${doc.exactNameOnDoc}`)

        // Step A: Extract structured HTML via Azure Document Intelligence
        const htmlSource = await analyzeDocument(doc.originalFileUrl)
        console.log(`[AzureTranslation] Azure extracted ${htmlSource.length} chars for doc #${doc.id}`)

        if (!htmlSource || htmlSource.trim().length < 20) {
          console.warn(`[AzureTranslation] Doc #${doc.id} yielded empty content — skipping`)
          continue
        }

        // Step B: Translate HTML via DeepL, preserving layout tags
        const result = await translator.translateText(htmlSource, null, 'en-US', {
          tagHandling: 'html',
        })
        const translatedHtml = Array.isArray(result)
          ? result.map(r => r.text).join('\n')
          : result.text

        console.log(`[AzureTranslation] DeepL translated ${translatedHtml.length} chars for doc #${doc.id}`)

        await prisma.document.update({
          where: { id: doc.id },
          data: { translatedText: translatedHtml },
        })

        lastTranslatedText = translatedHtml
        completedCount++
      } catch (docErr: any) {
        console.error(`[AzureTranslation] Error on doc #${doc.id}:`, docErr.message)
      }
    }

    if (completedCount > 0) {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'READY_FOR_REVIEW' },
      })
      return { success: true, count: completedCount, text: lastTranslatedText }
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'MANUAL_TRANSLATION_NEEDED' },
    })
    return { success: false, error: 'Falha na extração de todos os documentos.' }
  } catch (error: any) {
    console.error('[AzureTranslation] Fatal error:', error)
    return { success: false, error: String(error) }
  }
}
