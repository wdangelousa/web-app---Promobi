import { PDFDocument } from 'pdf-lib'
import { createClient } from '@/lib/supabase'

export interface DocumentForScoping {
  id: number
  orderId: number
  originalFileUrl: string
  billablePages: number | null
  totalPages: number | null
  excludedFromScope: boolean
}

export interface ScopeMaterializationResult {
  documentId: number
  action: 'scoped' | 'skipped' | 'error'
  scopedFileUrl?: string
  includedPages?: number[]
  originalPageCount?: number
  scopedPageCount?: number
  error?: string
}

interface MetadataAnalysisPage {
  included?: boolean
}

interface MetadataDocumentLike {
  analysis?: {
    pages?: MetadataAnalysisPage[]
  } | null
}

function isPdfUrl(url: string): boolean {
  return /\.pdf($|\?)/i.test(url)
}

function normalizeMetadataDocuments(orderMetadata: Record<string, unknown> | null | undefined): MetadataDocumentLike[] {
  const docs = orderMetadata?.documents
  return Array.isArray(docs) ? (docs as MetadataDocumentLike[]) : []
}

function readIncludedPageIndexesFromMetadataDoc(metaDoc: MetadataDocumentLike | null | undefined): number[] {
  const pages = metaDoc?.analysis?.pages
  if (!Array.isArray(pages) || pages.length === 0) return []
  return pages
    .map((page, index) => (page?.included !== false ? index : -1))
    .filter((index) => index >= 0)
}

function buildLeadingPageIndexes(pageCount: number): number[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, index) => index)
}

function resolveMetadataDocumentByTotalPages(
  document: DocumentForScoping,
  metadataDocuments: MetadataDocumentLike[],
  usedIndexes: Set<number>,
  documentIndex: number,
): MetadataDocumentLike | null {
  if (typeof document.totalPages === 'number' && document.totalPages > 0) {
    const exactMatchIndex = metadataDocuments.findIndex((metaDoc, index) => {
      if (usedIndexes.has(index)) return false
      const pages = metaDoc?.analysis?.pages
      return Array.isArray(pages) && pages.length === document.totalPages
    })

    if (exactMatchIndex >= 0) {
      usedIndexes.add(exactMatchIndex)
      return metadataDocuments[exactMatchIndex] ?? null
    }
  }

  const indexedFallback = metadataDocuments[documentIndex]
  if (indexedFallback) {
    usedIndexes.add(documentIndex)
    return indexedFallback
  }

  return null
}

export async function materializeScopedDocuments(
  orderId: number,
  documents: DocumentForScoping[],
  orderMetadata: Record<string, unknown> | null,
): Promise<ScopeMaterializationResult[]> {
  const metadataDocuments = normalizeMetadataDocuments(orderMetadata)
  const usedMetadataIndexes = new Set<number>()
  const supabase = await createClient()

  const results = await Promise.all(
    documents.map(async (document, documentIndex): Promise<ScopeMaterializationResult> => {
      if (document.excludedFromScope) {
        console.log(`[scopeMaterialization] order=${orderId} doc=${document.id} skipped: excludedFromScope=true`)
        return { documentId: document.id, action: 'skipped' }
      }

      try {
        const metadataDoc = resolveMetadataDocumentByTotalPages(
          document,
          metadataDocuments,
          usedMetadataIndexes,
          documentIndex,
        )

        let includedPages = readIncludedPageIndexesFromMetadataDoc(metadataDoc)
        const originalPageCountFromMetadata = metadataDoc?.analysis?.pages?.length
        const originalPageCount =
          typeof document.totalPages === 'number' && document.totalPages > 0
            ? document.totalPages
            : Array.isArray(metadataDoc?.analysis?.pages)
              ? metadataDoc.analysis.pages.length
              : undefined

        if (
          includedPages.length === 0 &&
          typeof document.billablePages === 'number' &&
          typeof document.totalPages === 'number' &&
          document.billablePages > 0 &&
          document.totalPages > document.billablePages
        ) {
          includedPages = buildLeadingPageIndexes(document.billablePages)
        }

        if (includedPages.length === 0) {
          console.log(`[scopeMaterialization] order=${orderId} doc=${document.id} skipped: no partial scope detected`)
          return {
            documentId: document.id,
            action: 'skipped',
            originalPageCount,
          }
        }

        const allIncludedCount =
          typeof originalPageCount === 'number' && originalPageCount > 0
            ? originalPageCount
            : originalPageCountFromMetadata

        if (typeof allIncludedCount === 'number' && includedPages.length >= allIncludedCount) {
          console.log(`[scopeMaterialization] order=${orderId} doc=${document.id} skipped: all pages included`)
          return {
            documentId: document.id,
            action: 'skipped',
            includedPages,
            originalPageCount: allIncludedCount,
            scopedPageCount: includedPages.length,
          }
        }

        const originalFileUrl = String(document.originalFileUrl || '').trim()
        if (!originalFileUrl) {
          console.log(`[scopeMaterialization] order=${orderId} doc=${document.id} error: missing originalFileUrl`)
          return {
            documentId: document.id,
            action: 'error',
            error: 'Missing originalFileUrl',
          }
        }

        const sourceRes = await fetch(originalFileUrl)
        if (!sourceRes.ok) {
          console.log(`[scopeMaterialization] order=${orderId} doc=${document.id} error: fetch failed ${sourceRes.status}`)
          return {
            documentId: document.id,
            action: 'error',
            error: `Failed to fetch original document (${sourceRes.status})`,
          }
        }

        const contentType = sourceRes.headers.get('content-type') || ''
        const isPdf = contentType.toLowerCase().includes('pdf') || isPdfUrl(originalFileUrl)
        if (!isPdf) {
          console.log(`[scopeMaterialization] order=${orderId} doc=${document.id} skipped: source is not PDF`)
          return {
            documentId: document.id,
            action: 'skipped',
            includedPages,
            originalPageCount,
          }
        }

        const sourceBuffer = await sourceRes.arrayBuffer()
        const sourcePdf = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true })
        const sourcePageCount = sourcePdf.getPageCount()

        const validIncludedPages = includedPages.filter((pageIndex) => pageIndex >= 0 && pageIndex < sourcePageCount)
        if (validIncludedPages.length === 0) {
          console.log(`[scopeMaterialization] order=${orderId} doc=${document.id} skipped: no valid included PDF pages`)
          return {
            documentId: document.id,
            action: 'skipped',
            originalPageCount: sourcePageCount,
          }
        }

        if (validIncludedPages.length >= sourcePageCount) {
          console.log(`[scopeMaterialization] order=${orderId} doc=${document.id} skipped: PDF already fully included`)
          return {
            documentId: document.id,
            action: 'skipped',
            includedPages: validIncludedPages,
            originalPageCount: sourcePageCount,
            scopedPageCount: validIncludedPages.length,
          }
        }

        const scopedPdf = await PDFDocument.create()
        const copiedPages = await scopedPdf.copyPages(sourcePdf, validIncludedPages)
        copiedPages.forEach((page) => scopedPdf.addPage(page))

        const scopedBytes = await scopedPdf.save()
        const storagePath = `orders/scoped/order-${orderId}-doc-${document.id}-scoped.pdf`
        const uploadRes = await supabase.storage
          .from('translations')
          .upload(storagePath, Buffer.from(scopedBytes), {
            contentType: 'application/pdf',
            upsert: true,
          })

        if (uploadRes.error) {
          console.log(`[scopeMaterialization] order=${orderId} doc=${document.id} error: upload failed ${uploadRes.error.message}`)
          return {
            documentId: document.id,
            action: 'error',
            includedPages: validIncludedPages,
            originalPageCount: sourcePageCount,
            scopedPageCount: validIncludedPages.length,
            error: uploadRes.error.message,
          }
        }

        const { data } = supabase.storage.from('translations').getPublicUrl(storagePath)
        console.log(
          `[scopeMaterialization] order=${orderId} doc=${document.id} scoped: ` +
          `${validIncludedPages.length}/${sourcePageCount} pages -> ${data.publicUrl}`
        )

        return {
          documentId: document.id,
          action: 'scoped',
          scopedFileUrl: data.publicUrl,
          includedPages: validIncludedPages,
          originalPageCount: sourcePageCount,
          scopedPageCount: validIncludedPages.length,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.log(`[scopeMaterialization] order=${orderId} doc=${document.id} error: ${message}`)
        return {
          documentId: document.id,
          action: 'error',
          error: message,
        }
      }
    }),
  )

  return results
}
