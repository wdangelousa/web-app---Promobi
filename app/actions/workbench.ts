'use server'

// app/actions/workbench.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server actions for the Workbench (Isabele's translation desk).
//
//   saveTranslationDraft(docId, text)  → save edited translation text to DB
//   approveDocument(docId, finalText) → mark doc as approved
//   releaseToClient(orderId, by)      → mark order COMPLETED + email client
// ─────────────────────────────────────────────────────────────────────────────

import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/app/actions/auth'
import { Resend } from 'resend'
import { PDFDocument } from 'pdf-lib'
import { classifyDocument } from '@/services/documentClassifier'
import { detectDocumentFamily } from '@/services/documentFamilyRegistry'
import {
  getStructuredRendererName,
  isSupportedStructuredDocumentType,
} from '@/services/structuredDocumentRenderer'
import {
  getDeliveryArtifactRegistryRecord,
  getPageParityRegistryRecord,
  getTranslationModeRegistryRecord,
  parseOrderMetadata,
  readDocumentDeliveryStatusRegistry,
  resolveTranslationPipelineForMode,
  resolveTranslationArtifactSelection,
  type TranslationModeRegistryRecord,
  type TranslationModeSelected,
  upsertDocumentDeliveryStatusRecord,
  upsertTranslationModeRegistryRecord,
} from '@/lib/translationArtifactSource'
import {
  isLikelyImageSource,
  resolveGroupedSourceImageCountHintFromOrderMetadata,
  resolveSourcePageCount,
  type SourcePageCountResolution,
} from '@/lib/sourcePageCountResolver'

const resend = new Resend(process.env.RESEND_API_KEY)

function isStructuredDeliveryArtifactUrl(url: string | null | undefined, orderId: number, docId: number): boolean {
  if (!url) return false
  const normalized = url.trim()
  if (!normalized) return false

  const hasCompletedPath = normalized.includes('/orders/completed/')
  const hasTranslationsBucket = normalized.includes('/translations/')
  const expectedFilename = `promobidocs-order-${orderId}-doc-${docId}.pdf`
  const hasExpectedFilename = normalized.includes(expectedFilename)

  return hasCompletedPath && hasTranslationsBucket && hasExpectedFilename
}

function normalizeNullableUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

interface ReleasePageParityDiagnostics {
  orderId: number
  docId: number
  detected_family: string
  page_parity_mode: string
  source_artifact_type: string
  source_page_count_strategy: string
  resolved_source_page_count: number | null
  source_page_count: number | null
  source_relevant_page_count: number | null
  translated_page_count: number | null
  parity_status: 'pass' | 'fail'
  blocking_reason: string
  renderer_used: string
  orientation_used: string
  compaction_attempted: boolean
  certification_generation_blocked: boolean
  release_blocked: boolean
}

interface ReleaseToClientOptions {
  sendToClient: boolean
  sendToTranslator: boolean
  isRetry?: boolean
  selectedDocumentIds?: number[]
}

function logReleasePageParityDiagnostics(diagnostics: ReleasePageParityDiagnostics) {
  console.log(`[releaseToClient] page parity diagnostics: ${JSON.stringify(diagnostics)}`)
}

async function getPdfPageCountFromUrl(url: string): Promise<number | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
    return pdfDoc.getPageCount()
  } catch {
    return null
  }
}

async function resolveSourcePageCountFromUrl(input: {
  fileUrl: string | null | undefined
  groupedSourceImageCountHint?: number | null
}): Promise<SourcePageCountResolution> {
  if (!input.fileUrl) {
    return {
      sourceArtifactType: 'unknown',
      sourcePageCountStrategy: 'undetermined',
      resolvedSourcePageCount: null,
      parityVerifiable: false,
    }
  }

  try {
    const res = await fetch(input.fileUrl)
    if (!res.ok) {
      return await resolveSourcePageCount({
        fileUrl: input.fileUrl,
        groupedSourceImageCountHint: input.groupedSourceImageCountHint ?? null,
        hybridSinglePageEvidence: input.groupedSourceImageCountHint === 1,
      })
    }

    const contentType = res.headers.get('content-type') ?? undefined
    const fileBuffer = await res.arrayBuffer()
    return await resolveSourcePageCount({
      fileUrl: input.fileUrl,
      contentType,
      fileBuffer,
      groupedSourceImageCountHint: input.groupedSourceImageCountHint ?? null,
      hybridSinglePageEvidence:
        input.groupedSourceImageCountHint === 1 &&
        !isLikelyImageSource(input.fileUrl, contentType),
    })
  } catch {
    return await resolveSourcePageCount({
      fileUrl: input.fileUrl,
      groupedSourceImageCountHint: input.groupedSourceImageCountHint ?? null,
      hybridSinglePageEvidence: input.groupedSourceImageCountHint === 1,
    })
  }
}

const IA_PROMOBI_SELECTION_SOURCE = 'ia_promobi_modal' as const

function sanitizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveApiBaseUrl(): string {
  const envBase =
    process.env.INTERNAL_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  return (envBase || 'http://localhost:3000').replace(/\/$/, '')
}

function resolveTriggeredBy(user: Awaited<ReturnType<typeof getCurrentUser>>): string | null {
  if (!user) return null
  return (
    sanitizeOptionalText(user.fullName) ??
    sanitizeOptionalText(user.email) ??
    (typeof user.id === 'number' ? String(user.id) : null)
  )
}

function buildTranslationModeRecord(params: {
  mode: TranslationModeSelected
  translationStatus: string
  translationTriggeredBy: string | null
  translationStartedAt: string | null
  translationCompletedAt: string | null
  translationError: string | null
}): TranslationModeRegistryRecord {
  const now = new Date().toISOString()
  return {
    translationModeSelected: params.mode,
    translationPipeline: resolveTranslationPipelineForMode(params.mode),
    translationSelectionSource: IA_PROMOBI_SELECTION_SOURCE,
    translationStatus: params.translationStatus,
    translationTriggeredBy: params.translationTriggeredBy,
    translationStartedAt: params.translationStartedAt,
    translationCompletedAt: params.translationCompletedAt,
    translationError: params.translationError,
    updatedAt: now,
  }
}

function normalizeTranslationModeInput(value: unknown): TranslationModeSelected | null {
  if (
    value === 'standard' ||
    value === 'faithful_layout' ||
    value === 'external_pdf'
  ) {
    return value
  }
  return null
}

// ─── saveTranslationDraft ─────────────────────────────────────────────────────

export async function saveTranslationDraft(
  docId: number,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    await prisma.document.update({
      where: { id: docId },
      data: {
        translatedText: text,
        translation_status: 'reviewed',
      },
    })

    return { success: true }
  } catch (err: any) {
    console.error('[saveTranslationDraft]', err)
    return { success: false, error: err.message ?? 'Erro ao salvar rascunho.' }
  }
}

// ─── updateDocumentName ───────────────────────────────────────────────────────

export async function updateDocumentName(
  docId: number,
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    await prisma.document.update({
      where: { id: docId },
      data: { exactNameOnDoc: name.trim() || null },
    })

    return { success: true }
  } catch (err: any) {
    console.error('[updateDocumentName]', err)
    return { success: false, error: err.message ?? 'Erro ao salvar nome.' }
  }
}

// ─── setDocumentReviewed ──────────────────────────────────────────────────────

export async function setDocumentReviewed(
  docId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    await prisma.document.update({
      where: { id: docId },
      data: { isReviewed: true },
    })

    return { success: true }
  } catch (err: any) {
    console.error('[setDocumentReviewed]', err)
    return { success: false, error: err.message ?? 'Erro ao marcar documento como revisado.' }
  }
}

// ─── approveDocument ──────────────────────────────────────────────────────────

export async function approveDocument(
  docId: number,
  finalText: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    await prisma.document.update({
      where: { id: docId },
      data: {
        translatedText: finalText,
        translation_status: 'approved',
      },
    })

    return { success: true }
  } catch (err: any) {
    console.error('[approveDocument]', err)
    return { success: false, error: err.message ?? 'Erro ao aprovar documento.' }
  }
}

export async function saveIAPromobiTranslationModality(
  orderId: number,
  docId: number,
  mode: TranslationModeSelected,
): Promise<{
  success: boolean
  error?: string
  selectedMode?: TranslationModeSelected
  selectedPipeline?: ReturnType<typeof resolveTranslationPipelineForMode>
}> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    const normalizedMode = normalizeTranslationModeInput(mode)
    if (!normalizedMode) {
      return { success: false, error: 'Modalidade de tradução inválida.' }
    }

    const doc = await prisma.document.findFirst({
      where: { id: docId, orderId },
      select: {
        id: true,
        orderId: true,
        externalTranslationUrl: true,
        order: {
          select: {
            metadata: true,
          },
        },
      },
    })

    if (!doc) {
      return { success: false, error: `Documento #${docId} não encontrado para o pedido #${orderId}.` }
    }

    const metadata = parseOrderMetadata(doc.order?.metadata as string | null | undefined)
    const translationPipeline = resolveTranslationPipelineForMode(normalizedMode)
    const record = buildTranslationModeRecord({
      mode: normalizedMode,
      translationStatus: 'modality_saved',
      translationTriggeredBy: null,
      translationStartedAt: null,
      translationCompletedAt: null,
      translationError: null,
    })
    const nextMetadata = upsertTranslationModeRegistryRecord(metadata, docId, record)

    await prisma.order.update({
      where: { id: orderId },
      data: { metadata: JSON.stringify(nextMetadata) },
    })

    console.log(
      `[iaPromobiTranslation] ${JSON.stringify({
        orderId,
        docId,
        selectedModality: normalizedMode,
        selectedPipeline: translationPipeline,
        selectionSource: IA_PROMOBI_SELECTION_SOURCE,
        triggerImmediately: false,
        externalPdfAvailable: Boolean(doc.externalTranslationUrl),
      })}`,
    )

    return {
      success: true,
      selectedMode: normalizedMode,
      selectedPipeline: translationPipeline,
    }
  } catch (err: any) {
    console.error('[saveIAPromobiTranslationModality]', err)
    return { success: false, error: err.message ?? 'Erro ao salvar modalidade de tradução.' }
  }
}

export async function saveAndGenerateIAPromobiTranslation(
  orderId: number,
  docId: number,
  mode?: TranslationModeSelected,
): Promise<{
  success: boolean
  error?: string
  translatedText?: string
  selectedMode?: TranslationModeSelected
  selectedPipeline?: ReturnType<typeof resolveTranslationPipelineForMode>
}> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { success: false, error: 'Não autorizado.' }
  const loadLatestMetadata = async () => {
    const latestOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: { metadata: true },
    })
    return parseOrderMetadata(latestOrder?.metadata as string | null | undefined)
  }

  const triggeredBy = resolveTriggeredBy(currentUser)
  let lockAcquired = false
  let startedAtForError: string | null = null
  let selectedModeForError: TranslationModeSelected =
    normalizeTranslationModeInput(mode) ?? 'standard'
  let selectedPipelineForError = resolveTranslationPipelineForMode(selectedModeForError)

  try {
    const doc = await prisma.document.findFirst({
      where: { id: docId, orderId },
      select: {
        id: true,
        orderId: true,
        originalFileUrl: true,
        sourceLanguage: true,
        externalTranslationUrl: true,
        translation_status: true,
        order: {
          select: {
            metadata: true,
          },
        },
      },
    })

    if (!doc) {
      return { success: false, error: `Documento #${docId} não encontrado para o pedido #${orderId}.` }
    }

    const metadata = await loadLatestMetadata()
    const persistedRecord = getTranslationModeRegistryRecord(metadata, docId)
    const requestedMode = normalizeTranslationModeInput(mode)
    const selectedMode: TranslationModeSelected =
      requestedMode ??
      persistedRecord?.translationModeSelected ??
      'standard'
    const selectedPipeline = resolveTranslationPipelineForMode(selectedMode)
    selectedModeForError = selectedMode
    selectedPipelineForError = selectedPipeline
    const externalPdfAvailable = Boolean(sanitizeOptionalText(doc.externalTranslationUrl))

    console.log(
      `[iaPromobiTranslation] ${JSON.stringify({
        orderId,
        docId,
        selectedModality: selectedMode,
        selectedPipeline,
        selectionSource: IA_PROMOBI_SELECTION_SOURCE,
        triggerImmediately: true,
        externalPdfAvailable,
      })}`,
    )

    if (selectedMode === 'external_pdf') {
      if (!externalPdfAvailable) {
        const latestMetadata = await loadLatestMetadata()
        const blockedRecord = buildTranslationModeRecord({
          mode: selectedMode,
          translationStatus: 'blocked_external_pdf_missing',
          translationTriggeredBy: triggeredBy,
          translationStartedAt: new Date().toISOString(),
          translationCompletedAt: new Date().toISOString(),
          translationError: 'External PDF is required for this modality.',
        })
        const blockedMetadata = upsertTranslationModeRegistryRecord(latestMetadata, docId, blockedRecord)
        await prisma.order.update({
          where: { id: orderId },
          data: { metadata: JSON.stringify(blockedMetadata) },
        })
        return {
          success: false,
          error: 'Use external PDF requires an active external PDF for this document.',
          selectedMode,
          selectedPipeline,
        }
      }

      const latestMetadata = await loadLatestMetadata()
      const completedRecord = buildTranslationModeRecord({
        mode: selectedMode,
        translationStatus: 'generation_completed',
        translationTriggeredBy: triggeredBy,
        translationStartedAt: new Date().toISOString(),
        translationCompletedAt: new Date().toISOString(),
        translationError: null,
      })
      const completedMetadata = upsertTranslationModeRegistryRecord(latestMetadata, docId, completedRecord)

      await prisma.$transaction([
        prisma.order.update({
          where: { id: orderId },
          data: { metadata: JSON.stringify(completedMetadata) },
        }),
        prisma.document.update({
          where: { id: docId },
          data: { translation_status: 'translated' },
        }),
      ])

      return {
        success: true,
        selectedMode,
        selectedPipeline,
      }
    }

    if (!doc.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') {
      return {
        success: false,
        error: 'Documento original indisponível.',
        selectedMode,
        selectedPipeline,
      }
    }

    const startedAt = new Date().toISOString()
    startedAtForError = startedAt
    const startedRecord = buildTranslationModeRecord({
      mode: selectedMode,
      translationStatus: 'generation_started',
      translationTriggeredBy: triggeredBy,
      translationStartedAt: startedAt,
      translationCompletedAt: null,
      translationError: null,
    })
    const startedMetadata = upsertTranslationModeRegistryRecord(metadata, docId, startedRecord)

    await prisma.$transaction(async (tx) => {
      const lock = await tx.document.updateMany({
        where: {
          id: docId,
          orderId,
          NOT: { translation_status: 'processing' },
        },
        data: { translation_status: 'processing' },
      })

      if (lock.count === 0) {
        throw new Error('__TRANSLATION_ALREADY_IN_PROGRESS__')
      }

      await tx.order.update({
        where: { id: orderId },
        data: { metadata: JSON.stringify(startedMetadata) },
      })
    })
    lockAcquired = true

    const { FEATURE_FLAGS } = await import('@/lib/featureFlags')
    const translatePath = FEATURE_FLAGS.USE_TRANSLATION_V2 ? '/api/translate/v2' : '/api/translate/claude'
    const endpoint = `${resolveApiBaseUrl()}${translatePath}`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileUrl: doc.originalFileUrl,
        documentId: docId,
        orderId,
        sourceLanguage: doc.sourceLanguage || 'pt',
        translationMode: selectedMode,
        translationPipeline: selectedPipeline,
        translationSelectionSource: IA_PROMOBI_SELECTION_SOURCE,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    const translatedText =
      typeof payload?.translatedText === 'string' ? payload.translatedText : ''

    if (!response.ok || translatedText.trim().length === 0) {
      const latestMetadata = await loadLatestMetadata()
      const errorMessage =
        sanitizeOptionalText(payload?.error) ??
        'Falha ao gerar tradução via IA Promobi.'
      const failedRecord = buildTranslationModeRecord({
        mode: selectedMode,
        translationStatus: 'generation_error',
        translationTriggeredBy: triggeredBy,
        translationStartedAt: startedAt,
        translationCompletedAt: new Date().toISOString(),
        translationError: errorMessage,
      })
      const failedMetadata = upsertTranslationModeRegistryRecord(latestMetadata, docId, failedRecord)

      await prisma.$transaction([
        prisma.document.update({
          where: { id: docId },
          data: { translation_status: 'error' },
        }),
        prisma.order.update({
          where: { id: orderId },
          data: { metadata: JSON.stringify(failedMetadata) },
        }),
      ])

      return {
        success: false,
        error: errorMessage,
        selectedMode,
        selectedPipeline,
      }
    }

    const completedRecord = buildTranslationModeRecord({
      mode: selectedMode,
      translationStatus: 'generation_completed',
      translationTriggeredBy: triggeredBy,
      translationStartedAt: startedAt,
      translationCompletedAt: new Date().toISOString(),
      translationError: null,
    })
    const latestMetadata = await loadLatestMetadata()
    const completedMetadata = upsertTranslationModeRegistryRecord(
      latestMetadata,
      docId,
      completedRecord,
    )

    await prisma.$transaction([
      prisma.document.update({
        where: { id: docId },
        data: {
          translatedText,
          translation_status: 'ai_draft',
        },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { metadata: JSON.stringify(completedMetadata) },
      }),
    ])

    return {
      success: true,
      translatedText,
      selectedMode,
      selectedPipeline,
    }
  } catch (err: any) {
    if (err?.message === '__TRANSLATION_ALREADY_IN_PROGRESS__') {
      return {
        success: false,
        error: 'Translation already in progress for this document.',
      }
    }

    if (lockAcquired) {
      try {
        const latestMetadata = await loadLatestMetadata()
        const failedRecord = buildTranslationModeRecord({
          mode: selectedModeForError,
          translationStatus: 'generation_error',
          translationTriggeredBy: triggeredBy,
          translationStartedAt: startedAtForError,
          translationCompletedAt: new Date().toISOString(),
          translationError: err?.message ?? 'Unexpected translation failure.',
        })
        const failedMetadata = upsertTranslationModeRegistryRecord(
          latestMetadata,
          docId,
          failedRecord,
        )
        await prisma.$transaction([
          prisma.document.update({
            where: { id: docId },
            data: { translation_status: 'error' },
          }),
          prisma.order.update({
            where: { id: orderId },
            data: { metadata: JSON.stringify(failedMetadata) },
          }),
        ])
      } catch (rollbackErr) {
        console.error('[saveAndGenerateIAPromobiTranslation] rollback error', rollbackErr)
      }
    }

    console.error('[saveAndGenerateIAPromobiTranslation]', err)
    return {
      success: false,
      error: err?.message ?? 'Erro ao gerar tradução pela IA Promobi.',
      selectedMode: selectedModeForError,
      selectedPipeline: selectedPipelineForError,
    }
  }
}

// ─── releaseToClient / sendSelectedDocuments ─────────────────────────────────

export async function sendSelectedDocuments(
  orderId: number,
  documentIds: number[],
  releasedBy: string,
  options: Omit<ReleaseToClientOptions, 'selectedDocumentIds'> = {
    sendToClient: true,
    sendToTranslator: false,
    isRetry: false,
  },
): Promise<{
  success: boolean
  error?: string
  lifecycleStatus?: 'sent' | 'partially_sent'
  sentDocumentCount?: number
  totalDocumentCount?: number
}> {
  const selectedDocumentIds = [...new Set(documentIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (selectedDocumentIds.length === 0) {
    return {
      success: false,
      error: 'Selecione pelo menos 1 documento para envio.',
    }
  }

  return releaseToClient(orderId, releasedBy, {
    ...options,
    selectedDocumentIds,
  })
}

export async function releaseToClient(
  orderId: number,
  releasedBy: string,
  options: ReleaseToClientOptions = { sendToClient: true, sendToTranslator: false, isRetry: false },
): Promise<{
  success: boolean
  error?: string
  lifecycleStatus?: 'sent' | 'partially_sent'
  sentDocumentCount?: number
  totalDocumentCount?: number
}> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Não autorizado.' }

    if (!options.sendToClient && !options.sendToTranslator) {
      return { success: false, error: 'Selecione ao menos um destinatário para envio.' }
    }

    // Load order with documents and user.
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        documents: {
          select: {
            id: true,
            exactNameOnDoc: true,
            docType: true,
            originalFileUrl: true,
            translatedText: true,
            translatedFileUrl: true,
            externalTranslationUrl: true,
            sourceLanguage: true,
            delivery_pdf_url: true,
            translation_status: true,
            isReviewed: true,
            excludedFromScope: true,
          },
        },
      },
    })

    if (!order) return { success: false, error: `Pedido #${orderId} não encontrado.` }

    const parsedOrderMetadata = parseOrderMetadata(order.metadata as string | null | undefined)

    const uniqueSelectedDocumentIds = options.selectedDocumentIds
      ? [...new Set(options.selectedDocumentIds.filter((id) => Number.isInteger(id) && id > 0))]
      : []
    const selectedDocumentIds =
      uniqueSelectedDocumentIds.length > 0
        ? uniqueSelectedDocumentIds
        : order.documents.map((d) => d.id)
    const selectedDocIdSet = new Set(selectedDocumentIds)
    const docsToRelease = order.documents.filter((d) => selectedDocIdSet.has(d.id))

    if (docsToRelease.length === 0) {
      return {
        success: false,
        error: 'Nenhum documento selecionado para envio.',
      }
    }

    const invalidSelectionIds = selectedDocumentIds.filter(
      (docId) => !order.documents.some((d) => d.id === docId),
    )
    if (invalidSelectionIds.length > 0) {
      return {
        success: false,
        error: `Documento(s) inválido(s) para o pedido #${orderId}: ${invalidSelectionIds.join(', ')}`,
      }
    }

    // Safety check: selected docs must be reviewed/approved and have structured delivery artifacts.
    const notReady = docsToRelease.filter((d) => {
      // External PDF: operator explicitly provided the final artifact — treat as reviewed.
      const isExternalPdfActive = Boolean(normalizeNullableUrl(d.externalTranslationUrl))
      const reviewApproved = d.isReviewed || d.translation_status === 'approved'
        || (isExternalPdfActive && d.translation_status === 'translated')
      if (!reviewApproved) return true
      if (!d.delivery_pdf_url) return true
      return !isStructuredDeliveryArtifactUrl(d.delivery_pdf_url, orderId, d.id)
    })
    if (notReady.length > 0) {
      const missingReview = notReady.filter(
        (d) => !(d.isReviewed || d.translation_status === 'approved'),
      ).length
      const missingKit = notReady.filter((d) => !d.delivery_pdf_url).length
      const missingStructured = notReady.filter(
        (d) => d.delivery_pdf_url && !isStructuredDeliveryArtifactUrl(d.delivery_pdf_url, orderId, d.id),
      ).length
      return {
        success: false,
        error:
          `${notReady.length} documento(s) selecionado(s) não estão prontos para envio. ` +
          `Revisão/aprovação e PDF estruturado são obrigatórios para os documentos selecionados.` +
          (missingReview > 0 ? ` ${missingReview} sem revisão/aprovação.` : '') +
          (missingKit > 0 ? ` ${missingKit} sem kit gerado.` : '') +
          (missingStructured > 0
            ? ` ${missingStructured} documento(s) têm PDF fora do pipeline estruturado e foram bloqueados.`
            : ''),
      }
    }

    // Absolute page-parity release guard:
    // translated_page_count MUST equal source_page_count for every selected document.
    const parityFailures: Array<{
      docId: number
      reason: string
      sourcePageCount: number | null
      translatedPageCount: number | null
    }> = []

    const artifactSourceFailures: Array<{
      docId: number
      reason: string
      expectedSource: string
      recordedSource: string | null
    }> = []

    for (const d of docsToRelease) {
      const artifactSelection = resolveTranslationArtifactSelection({
        externalTranslationUrl: d.externalTranslationUrl,
        translatedText: d.translatedText,
        translatedFileUrl: d.translatedFileUrl,
      })
      const artifactRecord = getDeliveryArtifactRegistryRecord(parsedOrderMetadata, d.id)
      const normalizedDeliveryUrl = normalizeNullableUrl(d.delivery_pdf_url)
      const normalizedRecordedDeliveryUrl = normalizeNullableUrl(artifactRecord?.deliveryPdfUrl ?? null)
      const normalizedRecordedSelectedArtifactUrl = normalizeNullableUrl(
        artifactRecord?.selectedArtifactUrl ?? null,
      )
      const normalizedCurrentSelectedArtifactUrl = normalizeNullableUrl(
        artifactSelection.selectedArtifactUrl,
      )

      const sourceMismatch =
        artifactRecord !== null && artifactRecord.source !== artifactSelection.source
      const deliveryUrlMismatch =
        artifactRecord !== null && normalizedRecordedDeliveryUrl !== normalizedDeliveryUrl
      const externalSelectionMismatch =
        artifactSelection.source === 'external_pdf' &&
        normalizedRecordedSelectedArtifactUrl !== normalizedCurrentSelectedArtifactUrl

      const sourceConsistencyPass =
        artifactRecord !== null &&
        !sourceMismatch &&
        !deliveryUrlMismatch &&
        !externalSelectionMismatch

      const sendToClientUsesExternalPdf =
        artifactSelection.source === 'external_pdf' && sourceConsistencyPass

      console.log(
        `[releaseToClient] translation artifact selection: ${JSON.stringify({
          orderId,
          docId: d.id,
          externalTranslationUrlPresent: artifactSelection.externalTranslationUrlPresent
            ? 'yes'
            : 'no',
          selectedTranslationArtifactSource: artifactSelection.source,
          selectedArtifactUrlOrPath: artifactSelection.selectedArtifactUrl,
          selectedDeliveryArtifactUrl: d.delivery_pdf_url,
          recordedTranslationArtifactSource: artifactRecord?.source ?? null,
          recordedSelectedArtifactUrl: artifactRecord?.selectedArtifactUrl ?? null,
          recordedDeliveryArtifactUrl: artifactRecord?.deliveryPdfUrl ?? null,
          sourceConsistencyPass: sourceConsistencyPass ? 'yes' : 'no',
          sendToClientUsedExternalPdf: sendToClientUsesExternalPdf ? 'yes' : 'no',
          artifactRecordFound: artifactRecord ? 'yes' : 'no',
        })}`,
      )

      if (
        sourceMismatch ||
        deliveryUrlMismatch ||
        externalSelectionMismatch ||
        (artifactSelection.source === 'external_pdf' && artifactRecord === null)
      ) {
        let reason = 'translation_artifact_source_mismatch'
        if (artifactSelection.source === 'external_pdf' && artifactRecord === null) {
          reason = 'external_pdf_selected_but_delivery_artifact_not_regenerated'
        } else if (sourceMismatch) {
          reason = 'delivery_artifact_recorded_source_differs_from_selected_source'
        } else if (deliveryUrlMismatch) {
          reason = 'delivery_artifact_url_mismatch'
        } else if (externalSelectionMismatch) {
          reason = 'external_translation_url_changed_since_delivery_generation'
        }
        artifactSourceFailures.push({
          docId: d.id,
          reason,
          expectedSource: artifactSelection.source,
          recordedSource: artifactRecord?.source ?? null,
        })
        continue
      }

      const documentLabelHint =
        [d.exactNameOnDoc, d.docType].filter(Boolean).join(' ').trim() || undefined
      const classification = classifyDocument({
        fileUrl: d.originalFileUrl ?? undefined,
        documentLabel: documentLabelHint,
        translatedText: d.translatedText ?? undefined,
        sourceLanguage: d.sourceLanguage ?? undefined,
      })
      const family = detectDocumentFamily({
        documentType: classification.documentType,
        documentLabel: documentLabelHint,
        fileUrl: d.originalFileUrl,
        translatedText: d.translatedText,
      }).family
      const rendererUsed = isSupportedStructuredDocumentType(classification.documentType)
        ? getStructuredRendererName(classification.documentType)
        : 'unknown'
      const pageParityRecord = getPageParityRegistryRecord(parsedOrderMetadata, d.id)
      const pageParityMode =
        pageParityRecord && pageParityRecord.status === 'approved_by_user'
          ? pageParityRecord.mode
          : 'strict_all_pages'

      const groupedSourceImageCountHint = resolveGroupedSourceImageCountHintFromOrderMetadata({
        orderMetadata: parsedOrderMetadata,
        documentId: d.id,
        originalFileUrl: d.originalFileUrl,
        exactNameOnDoc: d.exactNameOnDoc ?? null,
      })
      const sourcePageResolution = d.originalFileUrl
        ? await resolveSourcePageCountFromUrl({
            fileUrl: d.originalFileUrl,
            groupedSourceImageCountHint,
          })
        : {
            sourceArtifactType: 'unknown' as const,
            sourcePageCountStrategy: 'undetermined' as const,
            resolvedSourcePageCount: null,
            parityVerifiable: false,
          }
      const sourcePageCount = sourcePageResolution.resolvedSourcePageCount
      const deliveryTotalPageCount = d.delivery_pdf_url
        ? await getPdfPageCountFromUrl(d.delivery_pdf_url)
        : null

      if (deliveryTotalPageCount === null) {
        const diagnostics: ReleasePageParityDiagnostics = {
          orderId,
          docId: d.id,
          detected_family: family,
          page_parity_mode: pageParityMode,
          source_artifact_type: sourcePageResolution.sourceArtifactType,
          source_page_count_strategy: sourcePageResolution.sourcePageCountStrategy,
          resolved_source_page_count: sourcePageResolution.resolvedSourcePageCount,
          source_page_count: sourcePageCount,
          source_relevant_page_count: pageParityRecord?.sourceRelevantPageCount ?? null,
          translated_page_count: null,
          parity_status: 'fail',
          blocking_reason: 'page_parity_unverifiable_delivery_page_count',
          renderer_used: rendererUsed,
          orientation_used: 'unknown-at-release-guard',
          compaction_attempted: false,
          certification_generation_blocked: false,
          release_blocked: true,
        }
        logReleasePageParityDiagnostics(diagnostics)
        parityFailures.push({
          docId: d.id,
          reason: diagnostics.blocking_reason,
          sourcePageCount,
          translatedPageCount: null,
        })
        continue
      }

      if (sourcePageCount === null) {
        if (pageParityMode === 'manual_override') {
          const diagnostics: ReleasePageParityDiagnostics = {
            orderId,
            docId: d.id,
            detected_family: family,
            page_parity_mode: pageParityMode,
            source_artifact_type: sourcePageResolution.sourceArtifactType,
            source_page_count_strategy: sourcePageResolution.sourcePageCountStrategy,
            resolved_source_page_count: sourcePageResolution.resolvedSourcePageCount,
            source_page_count: null,
            source_relevant_page_count: pageParityRecord?.sourceRelevantPageCount ?? null,
            translated_page_count: null,
            parity_status: 'pass',
            blocking_reason: 'manual_override_approved_unverifiable_source_page_count',
            renderer_used: rendererUsed,
            orientation_used: 'unknown-at-release-guard',
            compaction_attempted: false,
            certification_generation_blocked: false,
            release_blocked: false,
          }
          logReleasePageParityDiagnostics(diagnostics)
          continue
        }

        const diagnostics: ReleasePageParityDiagnostics = {
          orderId,
          docId: d.id,
          detected_family: family,
          page_parity_mode: pageParityMode,
          source_artifact_type: sourcePageResolution.sourceArtifactType,
          source_page_count_strategy: sourcePageResolution.sourcePageCountStrategy,
          resolved_source_page_count: sourcePageResolution.resolvedSourcePageCount,
          source_page_count: null,
          source_relevant_page_count: pageParityRecord?.sourceRelevantPageCount ?? null,
          translated_page_count: null,
          parity_status: 'fail',
          blocking_reason: 'page_parity_unverifiable_source_page_count',
          renderer_used: rendererUsed,
          orientation_used: 'unknown-at-release-guard',
          compaction_attempted: false,
          certification_generation_blocked: false,
          release_blocked: true,
        }
        logReleasePageParityDiagnostics(diagnostics)
        parityFailures.push({
          docId: d.id,
          reason: diagnostics.blocking_reason,
          sourcePageCount,
          translatedPageCount: null,
        })
        continue
      }

      // Final kit shape: cover(1) + translated(T) + original(source_page_count)
      const translatedPageCount = deliveryTotalPageCount - 1 - sourcePageCount

      const expectedTranslatedPageCount =
        pageParityMode === 'strict_all_pages'
          ? sourcePageCount
          : pageParityMode === 'first_page_only'
            ? 1
            : pageParityMode === 'content_pages_only'
              ? pageParityRecord?.sourceRelevantPageCount ??
                pageParityRecord?.translatedPageCount ??
                null
              : null

      if (pageParityMode !== 'manual_override') {
        const hasExpectedCount =
          typeof expectedTranslatedPageCount === 'number' &&
          Number.isInteger(expectedTranslatedPageCount) &&
          expectedTranslatedPageCount > 0
        if (!hasExpectedCount) {
          const diagnostics: ReleasePageParityDiagnostics = {
            orderId,
            docId: d.id,
            detected_family: family,
            page_parity_mode: pageParityMode,
            source_artifact_type: sourcePageResolution.sourceArtifactType,
            source_page_count_strategy: sourcePageResolution.sourcePageCountStrategy,
            resolved_source_page_count: sourcePageResolution.resolvedSourcePageCount,
            source_page_count: sourcePageCount,
            source_relevant_page_count:
              pageParityRecord?.sourceRelevantPageCount ?? null,
            translated_page_count: translatedPageCount,
            parity_status: 'fail',
            blocking_reason: 'page_parity_missing_relevant_page_count',
            renderer_used: rendererUsed,
            orientation_used: 'unknown-at-release-guard',
            compaction_attempted: false,
            certification_generation_blocked: false,
            release_blocked: true,
          }
          logReleasePageParityDiagnostics(diagnostics)
          parityFailures.push({
            docId: d.id,
            reason: diagnostics.blocking_reason,
            sourcePageCount,
            translatedPageCount,
          })
          continue
        }

        if (translatedPageCount !== expectedTranslatedPageCount) {
          const diagnostics: ReleasePageParityDiagnostics = {
            orderId,
            docId: d.id,
            detected_family: family,
            page_parity_mode: pageParityMode,
            source_artifact_type: sourcePageResolution.sourceArtifactType,
            source_page_count_strategy: sourcePageResolution.sourcePageCountStrategy,
            resolved_source_page_count: sourcePageResolution.resolvedSourcePageCount,
            source_page_count: sourcePageCount,
            source_relevant_page_count:
              pageParityMode === 'content_pages_only'
                ? expectedTranslatedPageCount
                : pageParityMode === 'first_page_only'
                  ? 1
                  : sourcePageCount,
            translated_page_count: translatedPageCount,
            parity_status: 'fail',
            blocking_reason: 'page_parity_mismatch',
            renderer_used: rendererUsed,
            orientation_used: 'unknown-at-release-guard',
            compaction_attempted: false,
            certification_generation_blocked: false,
            release_blocked: true,
          }
          logReleasePageParityDiagnostics(diagnostics)
          parityFailures.push({
            docId: d.id,
            reason: diagnostics.blocking_reason,
            sourcePageCount,
            translatedPageCount,
          })
          continue
        }
      }

      const diagnostics: ReleasePageParityDiagnostics = {
        orderId,
        docId: d.id,
        detected_family: family,
        page_parity_mode: pageParityMode,
        source_artifact_type: sourcePageResolution.sourceArtifactType,
        source_page_count_strategy: sourcePageResolution.sourcePageCountStrategy,
        resolved_source_page_count: sourcePageResolution.resolvedSourcePageCount,
        source_page_count: sourcePageCount,
        source_relevant_page_count:
          pageParityMode === 'content_pages_only'
            ? expectedTranslatedPageCount
            : pageParityMode === 'first_page_only'
              ? 1
              : pageParityRecord?.sourceRelevantPageCount ?? sourcePageCount,
        translated_page_count: translatedPageCount,
        parity_status: 'pass',
        blocking_reason:
          pageParityMode === 'manual_override'
            ? 'manual_override_approved'
            : 'none',
        renderer_used: rendererUsed,
        orientation_used: 'unknown-at-release-guard',
        compaction_attempted: false,
        certification_generation_blocked: false,
        release_blocked: false,
      }
      logReleasePageParityDiagnostics(diagnostics)
    }

    if (artifactSourceFailures.length > 0) {
      const details = artifactSourceFailures
        .map(
          f =>
            `doc#${f.docId} reason=${f.reason} expected=${f.expectedSource} recorded=${f.recordedSource ?? 'none'}`,
        )
        .join('; ')
      return {
        success: false,
        error:
          `Release blocked by translation artifact source-of-truth rule. ` +
          `${artifactSourceFailures.length} document(s) have stale or mismatched delivery artifact source. ` +
          details,
      }
    }

    if (parityFailures.length > 0) {
      const details = parityFailures
        .map(
          f =>
            `doc#${f.docId} reason=${f.reason} source=${f.sourcePageCount ?? 'n/a'} translated=${f.translatedPageCount ?? 'n/a'}`,
        )
        .join('; ')
      return {
        success: false,
        error:
          `Release blocked by absolute page-parity rule (strict default with controlled overrides). ${parityFailures.length} document(s) failed parity validation. ` +
          details,
      }
    }

    // Send delivery email only for selected docs.
    // Document "sent" state is persisted only after email dispatch succeeds.
    let emailResult: { resendMessageId: string | null; recipients: string[] } = { resendMessageId: null, recipients: [] }
    try {
      emailResult = await sendDeliveryEmail(order, docsToRelease, options)
    } catch (err: any) {
      console.error('[releaseToClient] Critical failure calling sendDeliveryEmail:', err)
      return {
        success: false,
        error:
          `Falha no envio do e-mail de entrega para os documentos selecionados. ` +
          `${err?.message ?? 'Erro desconhecido.'}`,
      }
    }

    const dispatchTimestamp = new Date().toISOString()
    let nextMetadata: Record<string, unknown> = { ...parsedOrderMetadata }
    for (const d of docsToRelease) {
      nextMetadata = upsertDocumentDeliveryStatusRecord(nextMetadata, d.id, {
        deliveryStatus: 'sent',
        sentAt: dispatchTimestamp,
        sentBy: releasedBy,
        deliveryPdfUrl: normalizeNullableUrl(d.delivery_pdf_url),
      })
    }

    const deliveryRegistry = readDocumentDeliveryStatusRegistry(nextMetadata)
    // Only count in-scope documents for lifecycle calculation
    const inScopeDocs = order.documents.filter((doc) => !(doc as any).excludedFromScope)
    const totalDocumentCount = inScopeDocs.length
    const sentDocumentCount = inScopeDocs.filter(
      (doc) => deliveryRegistry[String(doc.id)]?.deliveryStatus === 'sent',
    ).length
    const lifecycleStatus: 'sent' | 'partially_sent' =
      sentDocumentCount === totalDocumentCount ? 'sent' : 'partially_sent'

    const previousDeliveryMeta =
      nextMetadata.delivery && typeof nextMetadata.delivery === 'object'
        ? (nextMetadata.delivery as Record<string, unknown>)
        : {}

    nextMetadata.delivery = {
      ...previousDeliveryMeta,
      releasedBy,
      releasedAt: dispatchTimestamp,
      structuredOnly: true,
      lifecycleStatus,
      lastDispatchDocumentIds: docsToRelease.map((d) => d.id),
      sentDocumentCount,
      totalDocumentCount,
      // Email delivery tracking — resolved by Resend webhook
      emailTracking: {
        resendMessageId: emailResult.resendMessageId,
        recipients: emailResult.recipients,
        sentAt: dispatchTimestamp,
        deliveryConfirmed: false,
        deliveryConfirmedAt: null,
      },
    }

    // Don't mark COMPLETED yet — wait for Resend "delivered" webhook confirmation.
    // Order stays in current status until email delivery is confirmed.
    const nextOrderStatus = order.status

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: nextOrderStatus,
        sentAt: lifecycleStatus === 'sent' ? new Date(dispatchTimestamp) : order.sentAt,
        metadata: JSON.stringify(nextMetadata),
      },
    })

    const completionLabel = lifecycleStatus === 'sent'
      ? options.isRetry
        ? 'RESENT'
        : 'COMPLETED'
      : options.isRetry
        ? 'PARTIAL_RESEND'
        : 'PARTIALLY_SENT'
    console.log(`[releaseToClient] ✅ Order #${orderId} ${completionLabel} by ${releasedBy}`)
    return {
      success: true,
      lifecycleStatus,
      sentDocumentCount,
      totalDocumentCount,
    }
  } catch (err: any) {
    console.error('[releaseToClient]', err)
    return { success: false, error: err.message ?? 'Erro ao liberar pedido.' }
  }
}

// ─── Delivery email to client ─────────────────────────────────────────────────

async function sendDeliveryEmail(
  order: any,
  selectedDocs: Array<{ id: number; exactNameOnDoc: string | null; delivery_pdf_url: string | null }>,
  options: { sendToClient: boolean; sendToTranslator: boolean; isRetry?: boolean },
): Promise<{ resendMessageId: string | null; recipients: string[] }> {
  const clientName = order.user?.fullName ?? 'Cliente'
  const clientEmail = order.user?.email

  const recipients: string[] = []

  if (options.sendToClient) {
    if (clientEmail) {
      recipients.push(clientEmail)
    } else {
      console.error(
        `[sendDeliveryEmail] ❌ sendToClient=true but clientEmail is missing for Order #${order.id}. ` +
        `order.user=${JSON.stringify(order.user)}. Client will NOT receive the delivery email.`
      )
      throw new Error(
        `Client email not found for Order #${order.id}. ` +
        `Check that the order is linked to the correct user in the database.`
      )
    }
  }
  if (options.sendToTranslator) {
    recipients.push('belebmd@gmail.com')
    recipients.push('desk@promobidocs.com')
  }

  if (recipients.length === 0) return { resendMessageId: null, recipients: [] }

  console.log(`[sendDeliveryEmail] ${options.isRetry ? 'REENVIO MANUAL' : 'DISPARO INICIAL'} - Disparando e-mail para: ${recipients.join(', ')}`)

  const docs = selectedDocs.filter((d) => d.delivery_pdf_url)
  if (docs.length === 0) {
    throw new Error(`No selected documents with delivery kit URL for Order #${order.id}.`)
  }

  // Build download links list substituindo Flexbox por Tabelas
  const docLinks = docs
    .map((d, i) => {
      const name = (d.exactNameOnDoc ?? `Documento ${i + 1}`).split(/[/\\]/).pop() ?? `Documento ${i + 1}`
      return `
        <table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #E5E7EB; border-radius:8px; margin-bottom:8px; background:#F9FAFB;">
          <tr>
            <td width="30" style="font-size:18px; text-align:center; padding-right:0;">📄</td>
            <td style="font-size:13px; color:#374151; font-weight:600;">${name}</td>
            <td align="right">
              <a href="${d.delivery_pdf_url}"
                 style="background:#f5b000; color:#111827; text-decoration:none;
                        padding:8px 16px; border-radius:8px; font-size:12px; font-weight:bold; display:inline-block;">
                Baixar PDF
              </a>
            </td>
          </tr>
        </table>
      `
    })
    .join('')

  const { data, error } = await resend.emails.send({
    from: 'Promobidocs <desk@promobidocs.com>',
    to: recipients,
    subject: `📩 [VALIDAÇÃO] Sua tradução certificada está pronta — Pedido #${order.id + 1000}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; background-color: #f3f4f6; padding: 20px; color: #333;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: #0F1117; padding: 30px; text-align: center;">
              <img src="https://promobidocs.com/logo-promobidocs.png" width="180" alt="Promobidocs" style="margin-bottom: 10px;" />
              <p style="color: #f5b000; font-size: 11px; font-weight: bold; letter-spacing: 2px; margin: 0 0 6px;">PROMOBIDOCS · TRADUÇÃO CERTIFICADA</p>
              <h1 style="color: white; font-size: 22px; margin: 0; font-weight: bold;">Sua tradução está pronta! 🎉</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; background: #ffffff;">
              <h2 style="color: #111827; margin-top: 0;">Kit de Tradução Disponível</h2>
              <p style="margin: 0 0 12px; color: #374151;">Olá, <strong>${clientName}</strong>,</p>
              <p style="margin: 0 0 12px; line-height: 1.6; color: #374151;">
                Temos o prazer de entregar o seu Kit de Tradução Oficial, processado e revisado por nossa equipe especializada.
              </p>

              <div style="margin: 24px 0;">
                  <p style="font-size: 11px; font-weight: bold; color: #9ca3af; letter-spacing: 1px; margin-bottom: 12px; text-transform: uppercase;">
                  ${docs.length} Documento(s) Liberado(s)
                  </p>
                ${docLinks}
              </div>

              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                <p style="margin: 0 0 4px; color: #374151; font-size: 14px;">Atenciosamente,</p>
                <p style="margin: 0; color: #111827; font-weight: bold; font-size: 15px;">Equipe Promobidocs</p>
                <p style="margin: 0; color: #f5b000; font-size: 13px; font-weight: bold;">www.promobidocs.com</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 20px; text-align: center; color: #9ca3af; font-size: 11px; border-top: 1px solid #f3f4f6;">
              © 2026 Promobidocs Services · Orlando, FL · Tradução e Notarização
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  })

  if (error) {
    console.error(`[sendDeliveryEmail] ❌ Falha no Resend:`, JSON.stringify(error, null, 2))
    throw new Error(`Resend Error: ${error.message} (${(error as any).name || 'Unknown'})`)
  }

  const resendMessageId = data?.id ?? null
  console.log(`[sendDeliveryEmail] ✅ Enviado! Resend ID: ${resendMessageId}`, JSON.stringify(data, null, 2))
  return { resendMessageId, recipients }
}
