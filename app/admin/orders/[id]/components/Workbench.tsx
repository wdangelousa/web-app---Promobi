'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Save, FileText, CheckCircle, Eye, Loader2, Zap, Square, CheckSquare, ThumbsUp, Send, X, UploadCloud, Trash2, RefreshCw, RotateCcw, Maximize2, DollarSign, Plus } from 'lucide-react'
import ManualApprovalButton from './ManualApprovalButton'
import FinancialAdjustmentModal from '@/components/Order/FinancialAdjustmentModal'
import { applyFinancialAdjustment } from '@/app/actions/adminOrders'

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
}

type Order = {
    id: number
    status: string
    totalAmount: number
    extraDiscount?: number | null
    finalPaidAmount?: number | null
    documents: Document[]
    user: { fullName: string; email: string }
}

type StatusInfo = { label: string; pill: string }

function getStatusInfo(doc: Document): StatusInfo {
    if (doc.delivery_pdf_url) return { label: 'Kit Gerado', pill: 'bg-blue-500/20 text-blue-300 ring-blue-500/30' }
    if (doc.isReviewed) return { label: 'Revisado ✓', pill: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30' }
    return { label: 'Pendente', pill: 'bg-gray-600/40 text-gray-400 ring-gray-500/20' }
}

function cleanAiHtml(raw: string): string {
    let html = raw.replace(/<img[^>]*>/gi, '').replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '').replace(/Coat of Arms of Brazil/gi, '').replace(/^(\s*<p>\s*(<br\s*\/?>\s*)?<\/p>\s*)+/i, '')
    return html.trim()
}

export default function Workbench({ order }: { order: Order }) {
    const router = useRouter()

    const [selectedDocId, setSelectedDocId] = useState<number | null>(order.documents[0]?.id ?? null)
    const [editorContent, setEditorContent] = useState('')
    const [isResending, setIsResending] = useState(false)

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
    const [isFullEditorOpen, setIsFullEditorOpen] = useState(false)
    const [showReference, setShowReference] = useState(true)
    const [showFinancialModal, setShowFinancialModal] = useState(false)

    const [isAddingDoc, setIsAddingDoc] = useState(false)
    const [isDeletingDocId, setIsDeletingDocId] = useState<number | null>(null)
    const [showReopenedBanner, setShowReopenedBanner] = useState(false)
    const addDocInputRef = useRef<HTMLInputElement>(null)

    const selectedDoc = order.documents.find((d) => d.id === selectedDocId)
    const isPaid = !['PENDING', 'PENDING_PAYMENT', 'AWAITING_VERIFICATION'].includes(order.status)
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

    const toggleDocForDelivery = (docId: number) => {
        setSelectedDocsForDelivery((prev) => prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId])
    }

    const toggleSelectAll = () => {
        setSelectedDocsForDelivery(selectedDocsForDelivery.length === order.documents.length ? [] : order.documents.map((d) => d.id))
    }

    const allSelected = selectedDocsForDelivery.length === order.documents.length
    const someSelected = selectedDocsForDelivery.length > 0

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

    const handlePreviewKit = async (translatedPageCount?: number, coverLang?: string) => {
        if (!selectedDoc) return
        setIsPreviewingKit(true)
        try {
            if (!selectedDoc.externalTranslationUrl) {
                const { saveTranslationDraft } = await import('../../../../actions/workbench')
                await saveTranslationDraft(selectedDoc.id, editorContent)
            }

            const { generateDeliveryKit } = await import('../../../../actions/generateDeliveryKit')
            const result = await generateDeliveryKit(order.id, selectedDoc.id, { preview: true, coverLanguage: coverLang })

            if (result.success && result.deliveryUrl) {
                setKitPreviewUrl(result.deliveryUrl)
                setShowPreviewModal(true)
            } else {
                alert('Erro ao gerar preview: ' + result.error)
            }
        } catch (err: any) {
            alert('Erro ao gerar Preview Kit: ' + (err.message || String(err)))
        } finally {
            setIsPreviewingKit(false)
        }
    }

    const handleTranslateAI = async () => {
        if (!selectedDoc || !selectedDoc.originalFileUrl) {
            alert('Documento original indisponível.')
            return
        }
        setIsTranslating(true)
        try {
            const res = await fetch('/api/translate/claude', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileUrl: selectedDoc.originalFileUrl,
                    documentId: selectedDoc.id,
                    orderId: order.id,
                    sourceLanguage: selectedDoc.sourceLanguage || 'pt',
                })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro na API Claude')

            const cleanedText = cleanAiHtml(data.translatedText)
            justTranslatedRef.current = cleanedText
            setEditorContent(cleanedText)

            if (data.qaReport?.flags?.length) {
                console.log('[QA Report]', data.qaReport.flags)
            }

            router.refresh()
        } catch (err: any) {
            alert('Erro ao acionar IA: ' + err.message)
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

    const handleUploadExternalFile = async (file: File) => {
        if (!selectedDoc) return
        setIsUploadingExternal(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('documentId', selectedDoc.id.toString())
            const { uploadExternalTranslation } = await import('../../../../actions/uploadExternal')
            const res = await uploadExternalTranslation(formData)
            if (res.success) {
                setOptimisticExternalUrl(res.url ?? null)
                router.refresh()
            } else {
                alert('Erro no upload: ' + res.error)
            }
        } catch (err: any) {
            alert('Erro inesperado: ' + err.message)
        } finally {
            setIsUploadingExternal(false)
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
        setIsReplacing(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('documentId', selectedDoc.id.toString())
            const { replaceOriginalDocument } = await import('../../../../actions/documents')
            const res = await replaceOriginalDocument(formData)
            if (res.success) router.refresh()
            else alert('Erro ao substituir original: ' + res.error)
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

            const { releaseToClient } = await import('../../../../actions/workbench')
            const releaseResult = await releaseToClient(order.id, 'Isabele', { sendToClient, sendToTranslator })

            if (releaseResult.success) alert(`✅ ${generatedCount} Kit(s) gerado(s) com sucesso!`)
            else alert(`✅ Kits gerados, mas email não enviado: ${releaseResult.error}`)
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
            const { releaseToClient } = await import('../../../../actions/workbench')
            const result = await releaseToClient(order.id, 'Isabele', { sendToClient: true, sendToTranslator: true, isRetry: true })
            if (result.success) alert('✅ E-mail reenviado!')
            else alert('❌ Erro: ' + result.error)
        } catch (err: any) {
            alert('❌ Erro: ' + err.message)
        } finally {
            setIsResending(false)
        }
    }

    if (!selectedDoc) return <div className="p-4 text-sm text-gray-500">Nenhum documento encontrado.</div>

    return (
        <div className="relative h-full w-full flex overflow-hidden">
            <div className="w-56 shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col">
                <div className="p-4 flex flex-col gap-1.5 shrink-0">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Documentos</span>
                    {order.status === 'COMPLETED' && (
                        <div className="flex flex-col gap-1.5 px-0.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase"><CheckCircle className="h-3 w-3" /> Status: Enviado</div>
                            <button onClick={handleResendEmail} disabled={isResending} className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-[10px] font-bold text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50">
                                {isResending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Reenviar E-mail
                            </button>
                        </div>
                    )}
                </div>

                <button onClick={toggleSelectAll} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 border-b border-gray-800 hover:bg-gray-800 transition-colors shrink-0">
                    {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-[#f58220]" /> : <Square className="h-3.5 w-3.5" />} <span>{allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
                </button>

                <div className="flex-1 overflow-y-auto py-1">
                    {order.documents.map((doc) => {
                        const isActive = doc.id === selectedDocId
                        const isChecked = selectedDocsForDelivery.includes(doc.id)
                        const docWithReview = { ...doc, isReviewed: localReviewed.has(doc.id) }
                        const { label: statusLabel, pill: pillClass } = getStatusInfo(docWithReview)

                        return (
                            <div key={doc.id} className={`flex items-start gap-2 px-2 py-2 mx-1 my-0.5 rounded-md group transition-colors ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`}>
                                <button onClick={(e) => { e.stopPropagation(); toggleDocForDelivery(doc.id) }} className="mt-0.5 shrink-0 text-gray-500 hover:text-[#f58220] transition-colors"><CheckSquare className={`h-4 w-4 ${isChecked ? 'text-[#f58220]' : ''}`} /></button>
                                <button className="flex-1 min-w-0 text-left" onClick={() => setSelectedDocId(doc.id)}>
                                    <div className={`text-xs font-medium truncate leading-tight ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>{doc.exactNameOnDoc || doc.docType}</div>
                                    <span className={`mt-1 inline-flex text-[9px] font-semibold px-1.5 py-0.5 rounded ring-1 ${pillClass}`}>{statusLabel}</span>
                                </button>
                                {!isPaid && (
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteDocument(doc.id, doc.exactNameOnDoc || doc.docType) }} disabled={isDeletingDocId === doc.id} className="mt-0.5 shrink-0 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50">
                                        {isDeletingDocId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </button>
                                )}
                            </div>
                        )
                    })}
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
                        <button onClick={handleTranslateAI} disabled={isTranslating} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50 transition-colors"><Zap className="h-3.5 w-3.5" /> IA Promobi</button>

                        <input type="file" ref={replaceFileInputRef} className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleReplaceOriginal} />
                        <button onClick={() => replaceFileInputRef.current?.click()} disabled={isReplacing} className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Trocar Original</button>

                        <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleExternalUpload} />
                        <button onClick={() => fileInputRef.current?.click()} disabled={isUploadingExternal} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"><UploadCloud className="h-3.5 w-3.5" /> PDF Externo</button>

                        {(order.status === 'PENDING' || order.status === 'PENDING_PAYMENT') && <ManualApprovalButton orderId={order.id} />}
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
                        translatedPdfUrl={optimisticExternalUrl}
                        onUploadExternalPdf={handleUploadExternalFile}
                        onRemoveExternalPdf={handleRemoveExternal}
                        orderId={order.id}
                        documentType={selectedDoc.docType ?? undefined}
                        sourceLanguage={selectedDoc.sourceLanguage ?? undefined}
                    />
                </div>
            </div>

            {showPreviewModal && (
                <div className="fixed inset-0 z-[60] bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPreviewModal(false)}>
                    <div className="bg-white w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 bg-gray-800 shrink-0">
                            <span className="text-white font-semibold flex items-center gap-2"><Eye className="h-4 w-4" /> Preview do Kit — {selectedDoc?.exactNameOnDoc || selectedDoc?.docType}</span>
                            <button onClick={() => setShowPreviewModal(false)} className="text-white/80 hover:text-white"><X className="h-6 w-6" /></button>
                        </div>
                        <div className="flex-1 overflow-hidden bg-gray-100 flex justify-center p-4">
                            {kitPreviewUrl ? <iframe src={kitPreviewUrl} className="w-full h-full bg-white rounded-lg shadow-lg border-0" title="Kit Preview" /> : <div className="flex flex-col flex-1 items-center justify-center text-gray-500 gap-3"><Loader2 className="h-8 w-8 animate-spin" /><span>Carregando visualização...</span></div>}
                        </div>
                    </div>
                </div>
            )}

            {showDeliveryModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2"><Send className="w-5 h-5 text-orange-500" /> Delivery Settings</h2>
                        <div className="space-y-3 mb-8">
                            <label className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl cursor-pointer hover:border-gray-200 transition-all"><input type="checkbox" checked={sendToClient} onChange={(e) => setSendToClient(e.target.checked)} className="w-5 h-5 text-orange-500" /><div><p className="text-gray-900 font-bold text-sm">{order.user.fullName}</p></div></label>
                            <label className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl cursor-pointer hover:border-gray-200 transition-all"><input type="checkbox" checked={sendToTranslator} onChange={(e) => setSendToTranslator(e.target.checked)} className="w-5 h-5 text-orange-500" /><div><p className="text-gray-900 font-bold text-sm">Translator</p></div></label>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowDeliveryModal(false)} className="flex-1 py-3 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
                            <button onClick={confirmAndGenerateKits} disabled={generatingKits} className="flex-[2] py-3 text-sm font-bold text-white bg-gray-900 rounded-xl flex items-center justify-center gap-2">Deliver Kits</button>
                        </div>
                    </div>
                </div>
            )}
            <FinancialAdjustmentModal isOpen={showFinancialModal} orderId={order.id} currentTotal={order.totalAmount} onClose={() => setShowFinancialModal(false)} onConfirm={async () => window.location.reload()} />
        </div>
    )
}