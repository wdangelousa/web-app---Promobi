'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Save, FileText, CheckCircle, Eye, Loader2, Zap, Square, CheckSquare, ThumbsUp, Send, X, UploadCloud, Trash2, RefreshCw, RotateCcw, Maximize2, DollarSign, Plus, Ban, ShieldCheck } from 'lucide-react'
import ManualApprovalButton from './ManualApprovalButton'
import FinancialAdjustmentModal from '@/components/Order/FinancialAdjustmentModal'
import { applyFinancialAdjustment } from '@/app/actions/adminOrders'
import { applyScopeReduction, type ScopeReductionReason } from '@/app/actions/scope-reduction'

const SCOPE_REDUCTION_REASON_LABELS: Record<ScopeReductionReason, string> = {
    already_in_english: 'Documento já em inglês',
    sent_by_mistake: 'Enviado por engano pelo cliente',
    duplicate_document: 'Documento duplicado',
    client_requested_removal: 'Remoção solicitada pelo cliente',
    other: 'Outro motivo',
}
import { readDocumentDeliveryStatusRegistry, readTranslationModeRegistry, type TranslationModeSelected } from '@/lib/translationArtifactSource'
import { readFinancialLedger } from '@/lib/manualPayment'
import ModalPortal from '@/components/ui/ModalPortal'
import { UI_Z_INDEX } from '@/lib/uiZIndex'

import Editor from '@/components/Workbench/Editor'

type Document = {
    id: number
    docType: string
    originalFileUrl: string
    translatedFileUrl?: string | null
    translatedText: string | null
    externalTranslationUrl?: string | null
    exactNameOnDoc?: string | null
    translation_status?: string | null
    delivery_pdf_url?: string | null
    isReviewed?: boolean
    pageRotations?: Record<string, number> | null
    sourceLanguage?: string | null
    // Scope fields (cotejo financeiro)
    billablePages?: number | null
    totalPages?: number | null
    excludedFromScope?: boolean
    approvedKitUrl?: string | null
}

type Order = {
    id: number
    status: string
    totalAmount: number
    urgency?: string
    extraDiscount?: number | null
    finalPaidAmount?: number | null
    metadata?: Record<string, unknown> | null
    documents: Document[]
    user: { fullName: string; email: string }
}

type StatusInfo = { label: string; pill: string }

type DocumentDeliveryStatusRecord = {
    deliveryStatus: 'sent'
    sentAt: string
    sentBy: string | null
    deliveryPdfUrl: string | null
}

type PageParityMode =
    | 'strict_all_pages'
    | 'content_pages_only'
    | 'first_page_only'
    | 'manual_override'

type PreviewParityDecisionPayload = {
    parity_decision_required: true
    defaultMode: 'strict_all_pages'
    currentMode: PageParityMode
    sourcePhysicalPageCount: number | null
    sourceRelevantPageCount: number | null
    translatedPageCount: number | null
    suggestedModes: PageParityMode[]
    blockingReason: 'page_parity_mismatch' | 'page_parity_unverifiable_source_page_count'
    translationArtifactSource: 'external_pdf' | 'structured_internal' | 'faithful_light_internal' | 'legacy_internal' | 'unknown'
}

type TranslationModeOption = {
    mode: TranslationModeSelected
    label: string
    description: string
    intendedUse: string
}

const IA_PROMOBI_MODE_OPTIONS: TranslationModeOption[] = [
    {
        mode: 'standard',
        label: 'Standard',
        description: 'Best for simpler, more textual documents.',
        intendedUse: 'Declarations, letters, straightforward textual records, and low-layout-sensitivity documents.',
    },
    {
        mode: 'faithful_layout',
        label: 'Faithful to the original document',
        description: 'Best for certificates, civil records, diplomas, news pages, and highly formatted documents.',
        intendedUse: 'Civil records, diplomas/certificates, editorial/news pages, EB1 evidence photo sheets, and highly formatted documents.',
    },
    {
        mode: 'external_pdf',
        label: 'Use external PDF',
        description: 'Use an already prepared translated PDF.',
        intendedUse: 'When a reviewed translated PDF already exists outside the normal generation flow.',
    },
]

function getStatusInfo(doc: Document, deliveryStatusRecord: DocumentDeliveryStatusRecord | null): StatusInfo {
    if (deliveryStatusRecord?.deliveryStatus === 'sent') {
        return { label: 'Enviado', pill: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30' }
    }
    if (doc.delivery_pdf_url && doc.isReviewed) {
        return { label: 'Kit Gerado + Revisado', pill: 'bg-indigo-500/20 text-indigo-300 ring-indigo-500/30' }
    }
    if (doc.delivery_pdf_url) {
        return { label: 'Kit Gerado (Aguardando revisão)', pill: 'bg-blue-500/20 text-blue-300 ring-blue-500/30' }
    }
    if (doc.isReviewed) return { label: 'Revisado ✓', pill: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30' }
    return { label: 'Pendente', pill: 'bg-gray-600/40 text-gray-400 ring-gray-500/20' }
}

function cleanAiHtml(raw: string): string {
    let html = raw.replace(/<img[^>]*>/gi, '').replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '').replace(/Coat of Arms of Brazil/gi, '').replace(/^(\s*<p>\s*(<br\s*\/?>\s*)?<\/p>\s*)+/i, '')
    return html.trim()
}

export default function Workbench({ order }: { order: Order }) {
    const router = useRouter()

    // ── Kit approval state ──────────────────────────────────────────
    const [isApprovingKit, setIsApprovingKit] = useState(false)
    const [kitApproved, setKitApproved] = useState(false)

    const handleApproveKit = async () => {
        if (!selectedDoc || !kitPreviewUrl) return
        setIsApprovingKit(true)
        try {
            const { approvePreviewKit } = await import('../../../../actions/approvePreviewKit')
            const result = await approvePreviewKit(order.id, selectedDoc.id, kitPreviewUrl)
            if (!result.success) {
                alert('Erro ao aprovar kit: ' + result.error)
                return
            }
            setKitApproved(true)
            router.refresh()
        } catch (err: any) {
            alert('Erro: ' + (err?.message || 'Falha ao aprovar kit'))
        } finally {
            setIsApprovingKit(false)
        }
    }

    // ── Scope reduction state ───────────────────────────────────────
    const [showScopeReductionModal, setShowScopeReductionModal] = useState(false)
    const [scopeReductionDocId, setScopeReductionDocId] = useState<number | null>(null)
    const [scopeReductionReason, setScopeReductionReason] = useState<ScopeReductionReason>('already_in_english')
    const [scopeReductionNotes, setScopeReductionNotes] = useState('')
    const [isApplyingScopeReduction, setIsApplyingScopeReduction] = useState(false)

    const openScopeReductionModal = (docId: number) => {
        setScopeReductionDocId(docId)
        setScopeReductionReason('already_in_english')
        setScopeReductionNotes('')
        setShowScopeReductionModal(true)
    }

    const handleApplyScopeReduction = async () => {
        if (!scopeReductionDocId) return
        setIsApplyingScopeReduction(true)
        try {
            const result = await applyScopeReduction(
                order.id,
                scopeReductionDocId,
                scopeReductionReason,
                scopeReductionNotes || null,
                order.user?.fullName || 'Tradutora',
            )
            if (!result.success) {
                alert('Erro: ' + result.error)
                return
            }
            setShowScopeReductionModal(false)
            router.refresh()
        } catch (err: any) {
            alert('Erro ao aplicar redução: ' + (err?.message || 'Erro interno'))
        } finally {
            setIsApplyingScopeReduction(false)
        }
    }

    // ── Scope-aware document lists (cotejo financeiro) ──────────────
    const inScopeDocs = order.documents.filter(d => !d.excludedFromScope)
    const outOfScopeDocs = order.documents.filter(d => d.excludedFromScope)

    const [selectedDocId, setSelectedDocId] = useState<number | null>(
        order.documents.find(d => !d.excludedFromScope)?.id ?? order.documents[0]?.id ?? null
    )
    const [editorContent, setEditorContent] = useState('')
    const [isResending, setIsResending] = useState(false)
    const [isMarkingCompleted, setIsMarkingCompleted] = useState(false)

    const [isSavingDraft, setIsSavingDraft] = useState(false)
    const [isTranslating, setIsTranslating] = useState(false)
    const [isApproving, setIsApproving] = useState(false)
    const [isUploadingExternal, setIsUploadingExternal] = useState(false)
    const [isReplacing, setIsReplacing] = useState(false)

    const [showDeliveryModal, setShowDeliveryModal] = useState(false)
    const [sendToClient, setSendToClient] = useState(true)
    const [sendToTranslator, setSendToTranslator] = useState(false)
    const [generatingKits, setGeneratingKits] = useState(false)

    const [selectedDocsForDelivery, setSelectedDocsForDelivery] = useState<number[]>([])

    const [localReviewed, setLocalReviewed] = useState<Set<number>>(() => new Set(order.documents.filter((d) => d.isReviewed).map((d) => d.id)))

    const [optimisticExternalUrl, setOptimisticExternalUrl] = useState<string | null>(null)
    const [docNameInput, setDocNameInput] = useState('')
    const [isSavingDocName, setIsSavingDocName] = useState(false)
    const [docNameSaved, setDocNameSaved] = useState(false)

    const [showPreviewModal, setShowPreviewModal] = useState(false)
    const [isPreviewingKit, setIsPreviewingKit] = useState(false)
    const [kitPreviewUrl, setKitPreviewUrl] = useState<string | null>(null)
    const [showParityDecisionModal, setShowParityDecisionModal] = useState(false)
    const [parityDecisionContext, setParityDecisionContext] = useState<PreviewParityDecisionPayload | null>(null)
    const [parityDecisionCoverLang, setParityDecisionCoverLang] = useState('PT_BR')
    const [selectedParityMode, setSelectedParityMode] = useState<PageParityMode>('strict_all_pages')
    const [parityJustification, setParityJustification] = useState('')
    const [parityRelevantPageCountInput, setParityRelevantPageCountInput] = useState('')
    const [isFullEditorOpen, setIsFullEditorOpen] = useState(false)
    const [showReference, setShowReference] = useState(true)
    const [showFinancialModal, setShowFinancialModal] = useState(false)
    const [showTranslationModeModal, setShowTranslationModeModal] = useState(false)
    const [selectedTranslationMode, setSelectedTranslationMode] = useState<TranslationModeSelected>('standard')
    const [translationModeError, setTranslationModeError] = useState<string | null>(null)
    const [isSavingTranslationMode, setIsSavingTranslationMode] = useState(false)

    const [isAddingDoc, setIsAddingDoc] = useState(false)
    const [isDeletingDocId, setIsDeletingDocId] = useState<number | null>(null)
    const [showReopenedBanner, setShowReopenedBanner] = useState(false)
    const addDocInputRef = useRef<HTMLInputElement>(null)

    const selectedDoc = order.documents.find((d) => d.id === selectedDocId)
    const deliveryStatusRegistry = useMemo(
        () => readDocumentDeliveryStatusRegistry((order.metadata ?? {}) as Record<string, unknown>),
        [order.metadata],
    )
    const translationModeRegistry = useMemo(
        () => readTranslationModeRegistry((order.metadata ?? {}) as Record<string, unknown>),
        [order.metadata],
    )
    const selectedDocTranslationModeRecord = selectedDoc
        ? translationModeRegistry[String(selectedDoc.id)] ?? null
        : null
    const externalPdfAvailableForSelectedDoc = Boolean(
        optimisticExternalUrl || selectedDoc?.externalTranslationUrl,
    )
    const sentDocIds = useMemo(
        () =>
            order.documents
                .filter((doc) => deliveryStatusRegistry[String(doc.id)]?.deliveryStatus === 'sent')
                .map((doc) => doc.id),
        [order.documents, deliveryStatusRegistry],
    )
    const sentDocumentCount = sentDocIds.length
    const totalDocumentCount = order.documents.length
    const hasAnySentDocs = sentDocumentCount > 0
    const hasPartialDelivery = hasAnySentDocs && sentDocumentCount < totalDocumentCount
    const isPaid = !['PENDING', 'PENDING_PAYMENT', 'AWAITING_VERIFICATION'].includes(order.status)
    const financialSnapshot = useMemo(
        () =>
            readFinancialLedger(
                (order.metadata ?? {}) as Record<string, unknown>,
                order.totalAmount ?? 0,
                typeof order.finalPaidAmount === 'number' ? order.finalPaidAmount : null,
            ),
        [order.metadata, order.totalAmount, order.finalPaidAmount],
    )
    const fileInputRef = useRef<HTMLInputElement>(null)
    const replaceFileInputRef = useRef<HTMLInputElement>(null)
    const justTranslatedRef = useRef<string | null>(null)
    const prevDocIdRef = useRef<number | null>(null)

    useEffect(() => {
        if (!selectedDoc) return
        const isNewDoc = prevDocIdRef.current !== selectedDoc.id
        prevDocIdRef.current = selectedDoc.id

        if (isNewDoc) {
            justTranslatedRef.current = null
            setEditorContent(selectedDoc.translatedText || '<p>Aguardando tradução...</p>')
            setDocNameInput(selectedDoc.exactNameOnDoc || selectedDoc.docType || '')
            setDocNameSaved(false)
        } else if (justTranslatedRef.current) {
            setEditorContent(justTranslatedRef.current)
        } else {
            setEditorContent(selectedDoc.translatedText || '<p>Aguardando tradução...</p>')
        }
    }, [selectedDocId, selectedDoc?.translatedText, selectedDoc?.id])

    useEffect(() => {
        setOptimisticExternalUrl(selectedDoc?.externalTranslationUrl ?? null)
    }, [selectedDoc?.id, selectedDoc?.externalTranslationUrl])

    useEffect(() => {
        setShowParityDecisionModal(false)
        setParityDecisionContext(null)
        setParityJustification('')
        setParityRelevantPageCountInput('')
        setSelectedParityMode('strict_all_pages')
        setKitApproved(false)
    }, [selectedDoc?.id])

    useEffect(() => {
        setSelectedTranslationMode(
            selectedDocTranslationModeRecord?.translationModeSelected ?? 'standard',
        )
        setTranslationModeError(null)
        setShowTranslationModeModal(false)
    }, [selectedDoc?.id, selectedDocTranslationModeRecord?.translationModeSelected])

    const toggleDocForDelivery = (docId: number) => {
        setSelectedDocsForDelivery((prev) => prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId])
    }

    const toggleSelectAll = () => {
        const selectableDocs = inScopeDocs
        setSelectedDocsForDelivery(selectedDocsForDelivery.length === selectableDocs.length ? [] : selectableDocs.map((d) => d.id))
    }

    const allSelected = selectedDocsForDelivery.length === inScopeDocs.length
    const someSelected = selectedDocsForDelivery.length > 0
    const parityModeLabel: Record<PageParityMode, string> = {
        strict_all_pages: 'Paridade estrita (todas as páginas)',
        content_pages_only: 'Somente páginas com conteúdo',
        first_page_only: 'Somente primeira página',
        manual_override: 'Override manual com justificativa',
    }
    const parityModeHint: Record<PageParityMode, string> = {
        strict_all_pages: 'Mantém a regra padrão e bloqueia quando houver divergência.',
        content_pages_only: 'Compara tradução com o total de páginas relevantes.',
        first_page_only: 'Define escopo de paridade apenas para a primeira página.',
        manual_override: 'Permite prosseguir manualmente mediante justificativa explícita.',
    }
    const artifactSourceLabel: Record<PreviewParityDecisionPayload['translationArtifactSource'], string> = {
        external_pdf: 'PDF externo',
        structured_internal: 'IA estruturada',
        faithful_light_internal: 'IA fiel (texto)',
        legacy_internal: 'Interno legado',
        unknown: 'Desconhecido',
    }

    const handleSave = async (translatedPageCount?: number) => {
        if (!selectedDoc) return
        setIsSavingDraft(true)
        try {
            const { saveTranslationDraft } = await import('../../../../actions/workbench')
            const result = await saveTranslationDraft(selectedDoc.id, editorContent)
            if (!result.success) alert('Erro ao salvar: ' + result.error)
            else router.refresh()
        } catch (err: any) {
            alert('Erro ao salvar rascunho: ' + err.message)
        } finally {
            setIsSavingDraft(false)
        }
    }

    const runPreviewKit = async (
        coverLang: string,
        parityDecision?: {
            mode: PageParityMode
            sourceRelevantPageCount?: number | null
            justification?: string | null
        } | null,
    ) => {
        if (!selectedDoc) return
        setIsPreviewingKit(true)
        try {
            if (!selectedDoc.externalTranslationUrl) {
                const { saveTranslationDraft } = await import('../../../../actions/workbench')
                await saveTranslationDraft(selectedDoc.id, editorContent)
            }

            const { previewStructuredKit } = await import('../../../../actions/previewStructuredKit')
            const result = await previewStructuredKit(
                order.id,
                selectedDoc.id,
                coverLang || 'PT_BR',
                editorContent || undefined,
                parityDecision ?? null,
            ) as {
                success: boolean
                previewUrl?: string
                error?: string
                parityDecisionRequired?: boolean
                parityDecision?: PreviewParityDecisionPayload
            }

            if (result.success && result.previewUrl) {
                setShowParityDecisionModal(false)
                setParityDecisionContext(null)
                setKitPreviewUrl(result.previewUrl)
                setShowPreviewModal(true)
                return
            }

            if (result.parityDecisionRequired && result.parityDecision) {
                const suggestedMode = result.parityDecision.suggestedModes[0] ?? 'strict_all_pages'
                setParityDecisionContext(result.parityDecision)
                setParityDecisionCoverLang(coverLang || 'PT_BR')
                setSelectedParityMode(suggestedMode)
                setParityRelevantPageCountInput(
                    result.parityDecision.sourceRelevantPageCount
                        ? String(result.parityDecision.sourceRelevantPageCount)
                        : result.parityDecision.translatedPageCount
                            ? String(result.parityDecision.translatedPageCount)
                            : '',
                )
                setParityJustification('')
                setShowParityDecisionModal(true)
                return
            }

            alert('Erro ao gerar preview: ' + (result.error || 'Falha desconhecida'))
        } catch (err: any) {
            alert('Erro ao gerar Preview Kit: ' + (err.message || String(err)))
        } finally {
            setIsPreviewingKit(false)
        }
    }

    const handlePreviewKit = async (translatedPageCount?: number, coverLang?: string) => {
        await runPreviewKit(coverLang || 'PT_BR', null)
    }

    const handleConfirmParityDecision = async () => {
        if (!parityDecisionContext) return

        const justification = parityJustification.trim()
        const requiresJustification = selectedParityMode !== 'strict_all_pages'
        if (requiresJustification && !justification) {
            alert('Informe a justificativa para registrar a decisão de paridade.')
            return
        }

        let sourceRelevantPageCount: number | null | undefined = undefined
        if (selectedParityMode === 'content_pages_only') {
            const parsed = Number(parityRelevantPageCountInput)
            if (!Number.isInteger(parsed) || parsed <= 0) {
                alert('Informe uma quantidade válida de páginas relevantes (inteiro positivo).')
                return
            }
            sourceRelevantPageCount = parsed
        }

        await runPreviewKit(parityDecisionCoverLang || 'PT_BR', {
            mode: selectedParityMode,
            sourceRelevantPageCount,
            justification: justification || null,
        })
    }

    const handleOpenIAPromobiModal = () => {
        if (!selectedDoc) return
        if (!selectedDoc.originalFileUrl) {
            alert('Documento original indisponível.')
            return
        }
        setSelectedTranslationMode(
            selectedDocTranslationModeRecord?.translationModeSelected ?? 'standard',
        )
        setTranslationModeError(null)
        setShowTranslationModeModal(true)
    }

    const handleSaveTranslationModeOnly = async () => {
        if (!selectedDoc) return

        setIsSavingTranslationMode(true)
        setTranslationModeError(null)
        try {
            const { saveIAPromobiTranslationModality } = await import('../../../../actions/workbench')
            const result = await saveIAPromobiTranslationModality(
                order.id,
                selectedDoc.id,
                selectedTranslationMode,
            )
            if (!result.success) {
                setTranslationModeError(result.error || 'Failed to save modality.')
                return
            }
            setShowTranslationModeModal(false)
            router.refresh()
        } catch (err: any) {
            setTranslationModeError(err?.message || 'Failed to save modality.')
        } finally {
            setIsSavingTranslationMode(false)
        }
    }

    const handleSaveAndGenerateByMode = async () => {
        if (!selectedDoc) return
        if (selectedTranslationMode === 'external_pdf' && !externalPdfAvailableForSelectedDoc) {
            setTranslationModeError('Use external PDF requires an active external PDF for this document.')
            return
        }

        setIsTranslating(true)
        setTranslationModeError(null)
        try {
            const { saveAndGenerateIAPromobiTranslation } = await import('../../../../actions/workbench')
            const result = await saveAndGenerateIAPromobiTranslation(
                order.id,
                selectedDoc.id,
                selectedTranslationMode,
            )

            if (!result.success) {
                setTranslationModeError(result.error || 'Failed to generate translation.')
                return
            }

            if (typeof result.translatedText === 'string' && result.translatedText.trim().length > 0) {
                const cleanedText = cleanAiHtml(result.translatedText)
                justTranslatedRef.current = cleanedText
                setEditorContent(cleanedText)
            }

            setShowTranslationModeModal(false)
            router.refresh()
        } catch (err: any) {
            setTranslationModeError(err?.message || 'Failed to generate translation.')
        } finally {
            setIsTranslating(false)
        }
    }

    const handleApproveDoc = async () => {
        if (!selectedDoc) return
        setIsApproving(true)
        try {
            const { saveTranslationDraft, setDocumentReviewed } = await import('../../../../actions/workbench')
            if (!selectedDoc.externalTranslationUrl) {
                const saveResult = await saveTranslationDraft(selectedDoc.id, editorContent)
                if (!saveResult.success) {
                    alert('Erro ao salvar rascunho antes de aprovar: ' + saveResult.error)
                    return
                }
            }
            const approveResult = await setDocumentReviewed(selectedDoc.id)
            if (!approveResult.success) {
                alert('Erro ao aprovar: ' + approveResult.error)
                return
            }
            setLocalReviewed((prev) => new Set([...prev, selectedDoc.id]))
            router.refresh()
        } catch (err: any) {
            alert('Erro ao aprovar tradução: ' + err.message)
        } finally {
            setIsApproving(false)
        }
    }

    const handleSaveDocName = async () => {
        if (!selectedDoc) return
        const trimmed = docNameInput.trim()
        if (trimmed === (selectedDoc.exactNameOnDoc ?? selectedDoc.docType ?? '')) return
        setIsSavingDocName(true)
        try {
            const { updateDocumentName } = await import('../../../../actions/workbench')
            const result = await updateDocumentName(selectedDoc.id, trimmed)
            if (result.success) {
                setDocNameSaved(true)
                setTimeout(() => setDocNameSaved(false), 2000)
                router.refresh()
            } else {
                alert('Erro ao salvar nome: ' + result.error)
            }
        } catch (err: any) {
            alert('Erro ao salvar nome: ' + err.message)
        } finally {
            setIsSavingDocName(false)
        }
    }

    const handleAttachPlanBFile = async (file: File) => {
        if (!selectedDoc) return
        if (!confirm('Tem certeza? Isso substituirá o arquivo original do documento por esta versão (Plano B).')) return
        // Cosmetic replacements (scan quality, rotation, orientation) preserve the existing translation.
        // Content-changing replacements clear it so the pipeline must be restarted.
        const preserveTranslation = confirm(
            'É uma substituição COSMÉTICA?\n(qualidade de scan, rotação, orientação — sem mudança de conteúdo)\n\nOK = preservar tradução existente\nCancelar = limpar tradução e reiniciar pipeline'
        )
        setIsReplacing(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('documentId', selectedDoc.id.toString())
            formData.append('preserveTranslation', String(preserveTranslation))
            const { replaceOriginalDocument } = await import('../../../../actions/replaceOriginalDocument')
            const res = await replaceOriginalDocument(formData)
            if (res.success) {
                alert(preserveTranslation
                    ? 'Plano B aplicado. Tradução preservada.'
                    : 'Plano B aplicado. Tradução limpa — reinicie o pipeline de tradução.')
                router.refresh()
            } else {
                alert('Erro no upload: ' + res.error)
            }
        } catch (err: any) {
            alert('Erro inesperado: ' + err.message)
        } finally {
            setIsReplacing(false)
        }
    }

    const handleExternalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !selectedDoc) return
        setIsUploadingExternal(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('documentId', selectedDoc.id.toString())
            const { uploadExternalTranslation } = await import('../../../../actions/uploadExternal')
            const res = await uploadExternalTranslation(formData)
            if (res.success) {
                setOptimisticExternalUrl(res.url ?? null)
                alert('Tradução Externa carregada com sucesso!')
                router.refresh()
            } else {
                alert('Erro no upload: ' + res.error)
            }
        } catch (err: any) {
            alert('Erro inesperado: ' + err.message)
        } finally {
            setIsUploadingExternal(false)
            if (e.target) e.target.value = ''
        }
    }

    const handleRemoveExternal = async () => {
        if (!selectedDoc) return
        if (confirm('Tem certeza que deseja remover o PDF de tradução externa e voltar a usar o editor de texto?')) {
            try {
                const { removeExternalTranslation } = await import('../../../../actions/uploadExternal')
                await removeExternalTranslation(selectedDoc.id)
                setOptimisticExternalUrl(null)
                router.refresh()
            } catch (err: any) {
                alert('Erro ao remover: ' + err.message)
            }
        }
    }

    const handleReplaceOriginal = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !selectedDoc) return
        if (!confirm('Tem certeza? Isso substituirá o arquivo enviado pelo cliente por esta nova versão.')) return
        // Cosmetic replacements (scan quality, rotation, orientation) preserve the existing translation.
        const preserveTranslation = confirm(
            'É uma substituição COSMÉTICA?\n(qualidade de scan, rotação, orientação — sem mudança de conteúdo)\n\nOK = preservar tradução existente\nCancelar = limpar tradução e reiniciar pipeline'
        )
        setIsReplacing(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('documentId', selectedDoc.id.toString())
            formData.append('preserveTranslation', String(preserveTranslation))
            const { replaceOriginalDocument } = await import('../../../../actions/replaceOriginalDocument')
            const res = await replaceOriginalDocument(formData)
            if (res.success) {
                if (!preserveTranslation) alert('Original substituído. Tradução limpa — reinicie o pipeline de tradução.')
                router.refresh()
            } else {
                alert('Erro ao substituir original: ' + res.error)
            }
        } catch (err: any) {
            alert('Erro inesperado: ' + err.message)
        } finally {
            setIsReplacing(false)
            e.target.value = ''
        }
    }

    const confirmAndGenerateKits = async () => {
        setShowDeliveryModal(false)
        setGeneratingKits(true)
        try {
            if (selectedDoc && selectedDocsForDelivery.includes(selectedDoc.id) && !selectedDoc.externalTranslationUrl) {
                const { saveTranslationDraft } = await import('../../../../actions/workbench')
                await saveTranslationDraft(selectedDoc.id, editorContent)
            }

            const { generateDeliveryKit } = await import('../../../../actions/generateDeliveryKit')
            let generatedCount = 0
            const errors: string[] = []

            for (const docId of selectedDocsForDelivery) {
                const result = await generateDeliveryKit(order.id, docId, {})
                if (result.success) generatedCount++
                else errors.push(`"${order.documents.find((d) => d.id === docId)?.exactNameOnDoc || `#${docId}`}": ${result.error}`)
            }

            if (generatedCount === 0) throw new Error('Nenhum kit foi gerado.\n' + errors.join('\n'))

            const { sendSelectedDocuments } = await import('../../../../actions/workbench')
            const releaseResult = await sendSelectedDocuments(order.id, selectedDocsForDelivery, 'Isabele', {
                sendToClient,
                sendToTranslator,
            })

            if (releaseResult.success) {
                if (releaseResult.lifecycleStatus === 'partially_sent') {
                    alert(
                        `✅ ${generatedCount} Kit(s) gerado(s) com sucesso!\n` +
                        `Envio parcial concluído (${releaseResult.sentDocumentCount}/${releaseResult.totalDocumentCount} documentos enviados).`,
                    )
                } else {
                    alert(`✅ ${generatedCount} Kit(s) gerado(s) e enviados com sucesso!`)
                }
            } else {
                alert(`✅ Kits gerados, mas envio não concluído: ${releaseResult.error}`)
            }
            window.location.reload()
        } catch (err: any) {
            alert('Erro ao gerar kits: ' + err.message)
        } finally {
            setGeneratingKits(false)
        }
    }

    const handleAddDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setIsAddingDoc(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('orderId', order.id.toString())
            const { addDocumentToOrder } = await import('../../../../actions/documents')
            const res = await addDocumentToOrder(formData)
            if (res.success) {
                if (res.orderReopened) setShowReopenedBanner(true)
                router.refresh()
            } else alert('Erro ao adicionar: ' + res.error)
        } catch (err: any) {
            alert('Erro: ' + err.message)
        } finally {
            setIsAddingDoc(false)
            e.target.value = ''
        }
    }

    const handleDeleteDocument = async (docId: number, docName: string) => {
        if (!confirm(`Remover "${docName}"?`)) return
        setIsDeletingDocId(docId)
        try {
            const { deleteDocumentFromOrder } = await import('../../../../actions/documents')
            const res = await deleteDocumentFromOrder(docId)
            if (res.success) {
                if (selectedDocId === docId) setSelectedDocId(order.documents.filter((d) => d.id !== docId)[0]?.id ?? null)
                router.refresh()
            } else alert('Erro: ' + res.error)
        } catch (err: any) {
            alert('Erro: ' + err.message)
        } finally {
            setIsDeletingDocId(null)
        }
    }

    const handleResendEmail = async () => {
        if (!confirm('Reenviar e-mail de entrega?')) return
        setIsResending(true)
        try {
            if (sentDocIds.length === 0) {
                alert('Nenhum documento marcado como enviado para reenviar.')
                return
            }
            const { sendSelectedDocuments } = await import('../../../../actions/workbench')
            const result = await sendSelectedDocuments(order.id, sentDocIds, 'Isabele', {
                sendToClient: true,
                sendToTranslator: true,
                isRetry: true,
            })
            if (result.success) alert('✅ E-mail reenviado!')
            else alert('❌ Erro: ' + result.error)
        } catch (err: any) {
            alert('❌ Erro: ' + err.message)
        } finally {
            setIsResending(false)
        }
    }

    const handleMarkCompleted = async () => {
        const confirmed = confirm(
            'Confirma que este pedido foi entregue ao cliente e pode ser movido para "Concluídos"?\n\n' +
            'Use isso quando o email de entrega já foi enviado mas a confirmação automática não chegou.'
        )
        if (!confirmed) return

        setIsMarkingCompleted(true)
        try {
            const { markOrderCompleted } = await import('../../../../actions/adminOrders')
            const result = await markOrderCompleted(order.id)
            if (result.success) {
                alert('✅ Pedido marcado como concluído!')
                router.refresh()
            } else {
                alert('❌ ' + (result.error || 'Erro ao concluir pedido.'))
            }
        } catch (err: any) {
            alert('❌ Erro: ' + err.message)
        } finally {
            setIsMarkingCompleted(false)
        }
    }

    if (!selectedDoc) return <div className="p-4 text-sm text-gray-500">Nenhum documento encontrado.</div>

    return (
        <div className="relative h-full w-full flex overflow-hidden">
            <div className="w-56 shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col">
                <div className="p-4 flex flex-col gap-1.5 shrink-0">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Documentos</span>
                    {hasAnySentDocs && (
                        <div className="flex flex-col gap-1.5 px-0.5">
                            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase ${hasPartialDelivery ? 'text-amber-400' : 'text-emerald-400'}`}>
                                <CheckCircle className="h-3 w-3" />
                                {hasPartialDelivery
                                    ? `Status: Envio Parcial (${sentDocumentCount}/${totalDocumentCount})`
                                    : `Status: Enviado (${sentDocumentCount}/${totalDocumentCount})`}
                            </div>
                            <button onClick={handleResendEmail} disabled={isResending} className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-[10px] font-bold text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50">
                                {isResending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Reenviar E-mail
                            </button>
                            {order.status !== 'COMPLETED' && (
                                <button
                                    onClick={handleMarkCompleted}
                                    disabled={isMarkingCompleted}
                                    className="flex items-center gap-1.5 px-2 py-1.5 bg-emerald-900/40 border border-emerald-700/50 rounded text-[10px] font-bold text-emerald-300 hover:bg-emerald-800/60 hover:text-emerald-200 transition-colors disabled:opacity-50 w-full"
                                >
                                    {isMarkingCompleted ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                                    Marcar como Concluído
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <button onClick={toggleSelectAll} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 border-b border-gray-800 hover:bg-gray-800 transition-colors shrink-0">
                    {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-[#f58220]" /> : <Square className="h-3.5 w-3.5" />} <span>{allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
                </button>

                <div className="flex-1 overflow-y-auto py-1">
                    {/* ── In-scope documents (work to be done) ── */}
                    {inScopeDocs.map((doc) => {
                        const isActive = doc.id === selectedDocId
                        const isChecked = selectedDocsForDelivery.includes(doc.id)
                        const docWithReview = { ...doc, isReviewed: localReviewed.has(doc.id) }
                        const deliveryStatusRecord = (deliveryStatusRegistry[String(doc.id)] ?? null) as DocumentDeliveryStatusRecord | null
                        const { label: statusLabel, pill: pillClass } = getStatusInfo(docWithReview, deliveryStatusRecord)

                        const scopeLabel = doc.billablePages != null && doc.totalPages != null && doc.billablePages < doc.totalPages
                            ? `${doc.billablePages}/${doc.totalPages} pág.`
                            : null

                        return (
                            <div key={doc.id} className={`flex items-start gap-2 px-2 py-2 mx-1 my-0.5 rounded-md group transition-colors ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`}>
                                <button onClick={(e) => { e.stopPropagation(); toggleDocForDelivery(doc.id) }} className="mt-0.5 shrink-0 text-gray-500 hover:text-[#f58220] transition-colors"><CheckSquare className={`h-4 w-4 ${isChecked ? 'text-[#f58220]' : ''}`} /></button>
                                <button className="flex-1 min-w-0 text-left" onClick={() => setSelectedDocId(doc.id)}>
                                    <div className={`text-xs font-medium truncate leading-tight ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>{doc.exactNameOnDoc || doc.docType}</div>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <span className={`inline-flex text-[9px] font-semibold px-1.5 py-0.5 rounded ring-1 ${pillClass}`}>{statusLabel}</span>
                                        {scopeLabel && (
                                            <span className="inline-flex text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 ring-1 ring-amber-700/50">
                                                {scopeLabel}
                                            </span>
                                        )}
                                        {doc.approvedKitUrl && (
                                            <span className="inline-flex text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-700/50">
                                                Kit ✓
                                            </span>
                                        )}
                                    </div>
                                </button>
                                {!isPaid && (
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteDocument(doc.id, doc.exactNameOnDoc || doc.docType) }} disabled={isDeletingDocId === doc.id} className="mt-0.5 shrink-0 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50">
                                        {isDeletingDocId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); openScopeReductionModal(doc.id) }}
                                    title="Remover do escopo (gera crédito)"
                                    className="mt-0.5 shrink-0 text-amber-600/50 hover:text-amber-400 transition-colors"
                                >
                                    <Ban className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )
                    })}

                    {/* ── Out-of-scope documents (reference only) ── */}
                    {outOfScopeDocs.length > 0 && (
                        <>
                            <div className="px-3 py-2 mt-2 border-t border-gray-800">
                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                                    Fora do escopo ({outOfScopeDocs.length})
                                </span>
                            </div>
                            {outOfScopeDocs.map((doc) => {
                                const isActive = doc.id === selectedDocId
                                return (
                                    <div key={doc.id} className={`flex items-start gap-2 px-2 py-2 mx-1 my-0.5 rounded-md opacity-40 group transition-colors ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`}>
                                        <div className="mt-0.5 shrink-0 w-4" />
                                        <button className="flex-1 min-w-0 text-left" onClick={() => setSelectedDocId(doc.id)}>
                                            <div className={`text-xs font-medium truncate leading-tight line-through ${isActive ? 'text-white' : 'text-gray-400'}`}>
                                                {doc.exactNameOnDoc || doc.docType}
                                            </div>
                                            <span className="mt-1 inline-flex text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 ring-1 ring-gray-700">
                                                Referência
                                            </span>
                                        </button>
                                    </div>
                                )
                            })}
                        </>
                    )}
                </div>

                {!isPaid && (
                    <div className="px-2 py-2 border-t border-gray-800 shrink-0">
                        <input type="file" ref={addDocInputRef} className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleAddDocument} />
                        <button onClick={() => addDocInputRef.current?.click()} disabled={isAddingDoc} className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 rounded text-[10px] font-bold text-gray-400 hover:text-white transition-colors disabled:opacity-50">
                            {isAddingDoc ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Adicionar Documento
                        </button>
                    </div>
                )}

                {/* --- NOVO BOTÃO DE ENTREGA ADICIONADO AQUI --- */}
                <div className="p-3 border-t border-gray-800 bg-gray-900 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.2)] z-10">
                    <button
                        onClick={() => setShowDeliveryModal(true)}
                        disabled={!someSelected}
                        className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-bold transition-all ${someSelected
                                ? 'bg-[#f58220] hover:bg-orange-500 text-white shadow-lg active:scale-95'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        <Send className="w-4 h-4" />
                        {someSelected ? `Entregar Kit(s) (${selectedDocsForDelivery.length})` : 'Selecione para Entregar'}
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 bg-white relative">
                <div className="border-b border-gray-200 px-3 py-2 flex flex-wrap items-center gap-3 bg-gray-50 shrink-0 z-20">
                    <div className="flex items-center gap-2 flex-1 min-w-[300px]">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Official Name (EN)</label>
                        <input type="text" value={docNameInput} onChange={(e) => setDocNameInput(e.target.value)} onBlur={handleSaveDocName} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} className="flex-1 text-xs border border-gray-200 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-orange-500 outline-none" />
                        {isSavingDocName && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                        {docNameSaved && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={handleOpenIAPromobiModal} disabled={isTranslating || isSavingTranslationMode} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50 transition-colors"><Zap className="h-3.5 w-3.5" /> IA Promobi</button>

                        <input type="file" ref={replaceFileInputRef} className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleReplaceOriginal} />
                        <button onClick={() => replaceFileInputRef.current?.click()} disabled={isReplacing} className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Trocar Original</button>

                        <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleExternalUpload} />
                        <button onClick={() => fileInputRef.current?.click()} disabled={isUploadingExternal} className={`px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50 transition-colors ${(selectedDoc.externalTranslationUrl ?? optimisticExternalUrl) ? 'bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}><UploadCloud className="h-3.5 w-3.5" />{(selectedDoc.externalTranslationUrl ?? optimisticExternalUrl) ? '● PDF Ext Ativo' : 'PDF Externo'}</button>

                        {order.status !== 'CANCELLED' && (
                            <ManualApprovalButton
                                orderId={order.id}
                                orderTotal={order.totalAmount}
                                amountAlreadyReceived={financialSnapshot.amountReceived}
                                currentFinancialStatus={financialSnapshot.status}
                            />
                        )}
                        <button onClick={() => setShowFinancialModal(true)} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors border border-emerald-200"><DollarSign className="h-3.5 w-3.5" /> Ajuste Financeiro</button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
                    <Editor
                        content={editorContent}
                        setContent={setEditorContent}
                        pdfUrl={selectedDoc.originalFileUrl}
                        onSave={handleSave}
                        onPreviewKit={handlePreviewKit}
                        isPreviewingKit={isPreviewingKit}
                        onApprove={handleApproveDoc}
                        externalTranslationUrl={optimisticExternalUrl}
                        onAttachPlanBPdf={handleAttachPlanBFile}
                        onRemoveExternalPdf={handleRemoveExternal}
                        orderId={order.id}
                        documentType={selectedDoc.docType ?? undefined}
                        sourceLanguage={selectedDoc.sourceLanguage ?? undefined}
                    />
                </div>
            </div>

            {showTranslationModeModal && selectedDoc && (
                <ModalPortal>
                    <div
                        className="fixed inset-0 bg-gray-900/55 backdrop-blur-sm flex items-center justify-center p-4"
                        style={{ zIndex: UI_Z_INDEX.modalOverlay }}
                    >
                        <div
                            className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
                            style={{ zIndex: UI_Z_INDEX.modalContent }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-6 py-5 border-b border-gray-200">
                                <h3 className="text-xl font-bold text-gray-900">
                                    How do you want to generate this translation?
                                </h3>
                            </div>

                            <div className="p-6 space-y-4">
                                {IA_PROMOBI_MODE_OPTIONS.map((option) => {
                                    const isActive = selectedTranslationMode === option.mode
                                    return (
                                        <button
                                            key={option.mode}
                                            type="button"
                                            onClick={() => {
                                                setSelectedTranslationMode(option.mode)
                                                setTranslationModeError(null)
                                            }}
                                            className={`w-full text-left rounded-xl border px-4 py-4 transition-colors ${
                                                isActive
                                                    ? 'border-purple-500 bg-purple-50'
                                                    : 'border-gray-200 bg-white hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">
                                                        {option.label}
                                                    </div>
                                                    <div className="text-sm text-gray-600 mt-1">
                                                        {option.description}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-2">
                                                        {option.intendedUse}
                                                    </div>
                                                </div>
                                                <div
                                                    className={`mt-0.5 h-4 w-4 rounded-full border ${
                                                        isActive
                                                            ? 'border-purple-600 bg-purple-600'
                                                            : 'border-gray-300 bg-white'
                                                    }`}
                                                />
                                            </div>
                                        </button>
                                    )
                                })}

                                {selectedTranslationMode === 'external_pdf' && !externalPdfAvailableForSelectedDoc && (
                                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                        External PDF is not available for this document. Upload an external PDF first.
                                    </div>
                                )}

                                {translationModeError && (
                                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                        {translationModeError}
                                    </div>
                                )}
                            </div>

                            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isTranslating || isSavingTranslationMode) return
                                        setShowTranslationModeModal(false)
                                        setTranslationModeError(null)
                                    }}
                                    disabled={isTranslating || isSavingTranslationMode}
                                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-white disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveTranslationModeOnly}
                                    disabled={isTranslating || isSavingTranslationMode}
                                    className="px-4 py-2 rounded-lg border border-purple-200 bg-purple-50 text-sm font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                                >
                                    {isSavingTranslationMode ? 'Saving...' : 'Save modality'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveAndGenerateByMode}
                                    disabled={
                                        isTranslating ||
                                        isSavingTranslationMode ||
                                        (selectedTranslationMode === 'external_pdf' && !externalPdfAvailableForSelectedDoc)
                                    }
                                    className="px-4 py-2 rounded-lg bg-purple-600 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
                                >
                                    {isTranslating ? 'Generating...' : 'Save and generate translation'}
                                </button>
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {showPreviewModal && (
                <ModalPortal>
                    <div
                        className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                        style={{ zIndex: UI_Z_INDEX.modalOverlay }}
                        onClick={() => setShowPreviewModal(false)}
                    >
                        <div
                            className="bg-white w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden"
                            style={{ zIndex: UI_Z_INDEX.modalContent }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 bg-gray-800 shrink-0">
                                <span className="text-white font-semibold flex items-center gap-2"><Eye className="h-4 w-4" /> Preview do Kit — {selectedDoc?.exactNameOnDoc || selectedDoc?.docType}</span>
                                <div className="flex items-center gap-3">
                                    {kitApproved || selectedDoc?.approvedKitUrl ? (
                                        <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-bold">
                                            <ShieldCheck className="h-4 w-4" /> Kit Aprovado
                                        </span>
                                    ) : (
                                        <button
                                            onClick={handleApproveKit}
                                            disabled={isApprovingKit || !kitPreviewUrl}
                                            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
                                        >
                                            {isApprovingKit ? (
                                                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aprovando...</>
                                            ) : (
                                                <><ShieldCheck className="h-3.5 w-3.5" /> Aprovar Kit</>
                                            )}
                                        </button>
                                    )}
                                    <button onClick={() => { setShowPreviewModal(false); setKitApproved(false) }} className="text-white/80 hover:text-white"><X className="h-6 w-6" /></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden bg-gray-100 flex justify-center p-4">
                                {kitPreviewUrl ? <iframe src={kitPreviewUrl} className="w-full h-full bg-white rounded-lg shadow-lg border-0" title="Kit Preview" /> : <div className="flex flex-col flex-1 items-center justify-center text-gray-500 gap-3"><Loader2 className="h-8 w-8 animate-spin" /><span>Carregando visualização...</span></div>}
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {showParityDecisionModal && parityDecisionContext && (
                <ModalPortal>
                    <div
                        className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4"
                        style={{ zIndex: UI_Z_INDEX.modalOverlay }}
                    >
                        <div
                            className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
                            style={{ zIndex: UI_Z_INDEX.modalContent }}
                        >
                            <div className="px-6 py-4 border-b border-gray-200 bg-amber-50">
                                <h3 className="text-lg font-bold text-gray-900">Decisão de Paridade de Páginas</h3>
                                <p className="text-sm text-gray-700 mt-1">
                                    Detectamos diferença entre páginas do original e da tradução. A regra padrão continua sendo paridade estrita, mas você pode escolher como tratar este caso.
                                </p>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                        <div className="text-[11px] uppercase font-bold text-gray-500">Original (físicas)</div>
                                        <div className="text-base font-semibold text-gray-900">
                                            {parityDecisionContext.sourcePhysicalPageCount ?? 'n/d'}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                        <div className="text-[11px] uppercase font-bold text-gray-500">Original (relevantes)</div>
                                        <div className="text-base font-semibold text-gray-900">
                                            {parityDecisionContext.sourceRelevantPageCount ?? 'n/d'}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                        <div className="text-[11px] uppercase font-bold text-gray-500">Tradução</div>
                                        <div className="text-base font-semibold text-gray-900">
                                            {parityDecisionContext.translatedPageCount ?? 'n/d'}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                        <div className="text-[11px] uppercase font-bold text-gray-500">Origem do artefato</div>
                                        <div className="text-base font-semibold text-gray-900">
                                            {artifactSourceLabel[parityDecisionContext.translationArtifactSource]}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Modo de tratamento</label>
                                    <select
                                        value={selectedParityMode}
                                        onChange={(e) => setSelectedParityMode(e.target.value as PageParityMode)}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900"
                                    >
                                        {parityDecisionContext.suggestedModes.map((mode) => (
                                            <option key={mode} value={mode}>
                                                {parityModeLabel[mode]}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-600">{parityModeHint[selectedParityMode]}</p>
                                </div>

                                {selectedParityMode === 'content_pages_only' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                                            Quantidade de páginas relevantes
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            value={parityRelevantPageCountInput}
                                            onChange={(e) => setParityRelevantPageCountInput(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                                            placeholder="Ex.: 2"
                                        />
                                    </div>
                                )}

                                {selectedParityMode !== 'strict_all_pages' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                                            Justificativa da decisão
                                        </label>
                                        <textarea
                                            value={parityJustification}
                                            onChange={(e) => setParityJustification(e.target.value)}
                                            rows={3}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 resize-y"
                                            placeholder="Descreva por que esta exceção é válida para este documento."
                                        />
                                    </div>
                                )}

                                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    Motivo técnico detectado: {parityDecisionContext.blockingReason === 'page_parity_mismatch'
                                        ? 'contagem de páginas divergente'
                                        : 'contagem de páginas de origem indisponível'}
                                </div>
                            </div>

                            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setShowParityDecisionModal(false)
                                        setParityDecisionContext(null)
                                    }}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmParityDecision}
                                    disabled={isPreviewingKit}
                                    className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#f58220] hover:bg-orange-500 transition-colors disabled:opacity-60"
                                >
                                    {isPreviewingKit ? 'Processando...' : 'Aplicar decisão e gerar preview'}
                                </button>
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {showDeliveryModal && (
                <ModalPortal>
                    <div
                        className="fixed inset-0 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4"
                        style={{ zIndex: UI_Z_INDEX.modalOverlay }}
                        onClick={() => setShowDeliveryModal(false)}
                    >
                        <div
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-gray-100"
                            style={{ zIndex: UI_Z_INDEX.modalContent }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2"><Send className="w-5 h-5 text-orange-500" /> Delivery Settings</h2>
                            <div className="space-y-3 mb-8">
                                <label className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl cursor-pointer hover:border-gray-200 transition-all"><input type="checkbox" checked={sendToClient} onChange={(e) => setSendToClient(e.target.checked)} className="w-5 h-5 text-orange-500" /><div><p className="text-gray-900 font-bold text-sm">{order.user.fullName}</p><p className="text-xs text-gray-500 font-mono mt-0.5">{order.user.email}</p></div></label>
                                <label className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl cursor-pointer hover:border-gray-200 transition-all"><input type="checkbox" checked={sendToTranslator} onChange={(e) => setSendToTranslator(e.target.checked)} className="w-5 h-5 text-orange-500" /><div><p className="text-gray-900 font-bold text-sm">Translator</p></div></label>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowDeliveryModal(false)} className="flex-1 py-3 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
                                <button onClick={confirmAndGenerateKits} disabled={generatingKits} className="flex-[2] py-3 text-sm font-bold text-white bg-gray-900 rounded-xl flex items-center justify-center gap-2">Deliver Kits</button>
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}
            <FinancialAdjustmentModal isOpen={showFinancialModal} orderId={order.id} currentTotal={order.totalAmount} onClose={() => setShowFinancialModal(false)} onConfirm={async () => window.location.reload()} />
            {/* ── Scope Reduction Modal ── */}
            {showScopeReductionModal && scopeReductionDocId && (
                <ModalPortal>
                    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" style={{ zIndex: UI_Z_INDEX.modalOverlay }}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-slate-200" style={{ zIndex: UI_Z_INDEX.modalContent }}>
                            <h3 className="text-xl font-bold text-slate-900 mb-1">Redução de Escopo</h3>
                            <p className="text-sm text-slate-500 mb-6">
                                Remover documento do escopo de trabalho. O valor será descontado e ficará como crédito/reembolso pendente.
                            </p>

                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                                <p className="text-sm font-bold text-amber-800">
                                    {order.documents.find(d => d.id === scopeReductionDocId)?.exactNameOnDoc || `Doc #${scopeReductionDocId}`}
                                </p>
                                <p className="text-xs text-amber-600 mt-1">
                                    {order.documents.find(d => d.id === scopeReductionDocId)?.billablePages ?? '?'} página(s) cobrável(is)
                                </p>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Motivo</label>
                                    <select
                                        value={scopeReductionReason}
                                        onChange={(e) => setScopeReductionReason(e.target.value as ScopeReductionReason)}
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                                    >
                                        {Object.entries(SCOPE_REDUCTION_REASON_LABELS).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Observações (opcional)</label>
                                    <textarea
                                        value={scopeReductionNotes}
                                        onChange={(e) => setScopeReductionNotes(e.target.value)}
                                        placeholder="Ex: Cliente avisou por telefone que o documento foi enviado por engano..."
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none resize-none h-20"
                                    />
                                </div>
                            </div>

                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-6">
                                <p className="text-xs font-bold text-red-700">
                                    ⚠️ Esta ação remove o documento do escopo de trabalho e registra um crédito financeiro. Não pode ser desfeita.
                                </p>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowScopeReductionModal(false)}
                                    className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleApplyScopeReduction}
                                    disabled={isApplyingScopeReduction}
                                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-xl font-bold transition-colors flex items-center gap-2"
                                >
                                    {isApplyingScopeReduction ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
                                    ) : (
                                        <><Ban className="h-4 w-4" /> Confirmar Exclusão</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}
        </div>
    )
}
