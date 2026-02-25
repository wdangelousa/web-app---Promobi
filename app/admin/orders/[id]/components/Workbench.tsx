'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
    Save, FileText, CheckCircle, Eye, Loader2, Zap, Square, CheckSquare, AlignLeft, ThumbsUp, ScanSearch, Send, X, UploadCloud, Trash2
} from 'lucide-react'
import ManualApprovalButton from './ManualApprovalButton'
import 'react-quill-new/dist/quill.snow.css'

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

type Order = {
    id: number
    status: string
    documents: Document[]
    user: {
        fullName: string
        email: string
    }
}

// ── Status helpers ────────────────────────────────────────────────────────────

type StatusInfo = { label: string; pill: string }

function getStatusInfo(doc: Document): StatusInfo {
    if (doc.delivery_pdf_url) {
        return { label: 'Kit Gerado', pill: 'bg-blue-500/20 text-blue-300 ring-blue-500/30' }
    }
    if (doc.isReviewed) {
        return { label: 'Revisado ✓', pill: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30' }
    }
    return { label: 'Pendente', pill: 'bg-gray-600/40 text-gray-400 ring-gray-500/20' }
}

// ── Formatting helper ─────────────────────────────────────────────────────────

function applyPromobiFormatting(html: string): string {
    const plain = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    return plain
        .split(/\n\n/)
        .filter((p) => p.trim())
        .map(
            (p) =>
                `<p style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; margin: 0 0 0.8em 0;">${p
                    .replace(/\n/g, '<br>')
                    .trim()}</p>`
        )
        .join('')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Workbench({ order }: { order: Order }) {
    const router = useRouter()

    const [selectedDocId, setSelectedDocId] = useState<number | null>(
        order.documents[0]?.id ?? null
    )
    const [editorContent, setEditorContent] = useState('')

    const [isSavingDraft, setIsSavingDraft] = useState(false)
    const [isTranslating, setIsTranslating] = useState(false)
    const [isApproving, setIsApproving] = useState(false)
    const [isPreviewingKit, setIsPreviewingKit] = useState(false)
    const [isUploadingExternal, setIsUploadingExternal] = useState(false)

    // States do Modal de Envio
    const [showDeliveryModal, setShowDeliveryModal] = useState(false)
    const [sendToClient, setSendToClient] = useState(true)
    const [sendToTranslator, setSendToTranslator] = useState(false)
    const [generatingKits, setGeneratingKits] = useState(false)

    const [selectedDocsForDelivery, setSelectedDocsForDelivery] = useState<number[]>([])

    const [localReviewed, setLocalReviewed] = useState<Set<number>>(
        () => new Set(order.documents.filter((d) => d.isReviewed).map((d) => d.id))
    )

    const selectedDoc = order.documents.find((d) => d.id === selectedDocId)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const justTranslatedRef = useRef<string | null>(null)
    const prevDocIdRef = useRef<number | null>(null)

    useEffect(() => {
        if (!selectedDoc) return
        const isNewDoc = prevDocIdRef.current !== selectedDoc.id
        prevDocIdRef.current = selectedDoc.id

        if (isNewDoc) {
            justTranslatedRef.current = null
            setEditorContent(selectedDoc.translatedText || '<p>Aguardando tradução...</p>')
        } else if (justTranslatedRef.current) {
            setEditorContent(justTranslatedRef.current)
        } else {
            setEditorContent(selectedDoc.translatedText || '<p>Aguardando tradução...</p>')
        }
    }, [selectedDocId, selectedDoc?.translatedText, selectedDoc?.id])

    const toggleDocForDelivery = (docId: number) => {
        setSelectedDocsForDelivery((prev) =>
            prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
        )
    }

    const toggleSelectAll = () => {
        setSelectedDocsForDelivery(
            selectedDocsForDelivery.length === order.documents.length
                ? []
                : order.documents.map((d) => d.id)
        )
    }

    const allSelected = selectedDocsForDelivery.length === order.documents.length
    const someSelected = selectedDocsForDelivery.length > 0

    const handleSave = async () => {
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

    const handleApplyPromobiStandard = () => {
        const formatted = applyPromobiFormatting(editorContent)
        if (formatted) setEditorContent(formatted)
    }

    const handleTranslateAI = async () => {
        if (!selectedDoc) return
        setIsTranslating(true)
        try {
            const { generateTranslationDraft } = await import('../../../../actions/generateTranslation')
            const result = await generateTranslationDraft(order.id)
            const newText = (result as any).text || (result as any).translatedText

            if (result.success && newText) {
                justTranslatedRef.current = newText
                setEditorContent(newText)
                router.refresh()
            } else if (result.success) {
                alert('Tradução concluída, mas sem texto retornado. Recarregue a página.')
                router.refresh()
            } else {
                alert('Erro na tradução: ' + ((result as any).error || 'desconhecido'))
            }
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
            const { saveTranslationDraft, setDocumentReviewed } = await import(
                '../../../../actions/workbench'
            )

            // Se tiver tradução externa, não precisamos salvar o draft de texto
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

    const handlePreviewKit = async () => {
        if (!selectedDoc) return
        setIsPreviewingKit(true)
        try {
            if (!selectedDoc.externalTranslationUrl) {
                const { saveTranslationDraft } = await import('../../../../actions/workbench')
                await saveTranslationDraft(selectedDoc.id, editorContent)
            }

            const { generateDeliveryKit } = await import('../../../../actions/generateDeliveryKit')
            const result = await generateDeliveryKit(order.id, selectedDoc.id, { preview: true })

            if (result.success && result.deliveryUrl) {
                window.open(result.deliveryUrl, '_blank', 'noopener,noreferrer')
            } else {
                alert('Erro ao gerar preview: ' + (result.error ?? 'desconhecido'))
            }
        } catch (err: any) {
            alert('Erro ao gerar preview: ' + err.message)
        } finally {
            setIsPreviewingKit(false)
        }
    }

    // --- FUNÇÕES DE UPLOAD DE PDF EXTERNO ---
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
                alert('Tradução Externa carregada com sucesso!')
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

    const handleRemoveExternal = async () => {
        if (!selectedDoc) return
        if (confirm('Tem certeza que deseja remover o PDF de tradução externa e voltar a usar o editor de texto?')) {
            try {
                const { removeExternalTranslation } = await import('../../../../actions/uploadExternal')
                await removeExternalTranslation(selectedDoc.id)
                router.refresh()
            } catch (err: any) {
                alert('Erro ao remover: ' + err.message)
            }
        }
    }

    // --- FUNÇÃO DO MODAL DE DISPARO ---
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
                const result = await generateDeliveryKit(order.id, docId)
                if (result.success) {
                    generatedCount++
                } else {
                    const label = order.documents.find((d) => d.id === docId)?.exactNameOnDoc || `#${docId}`
                    errors.push(`"${label}": ${result.error}`)
                }
            }

            if (generatedCount === 0) {
                throw new Error('Nenhum kit foi gerado.\n' + errors.join('\n'))
            }

            const { releaseToClient } = await import('../../../../actions/workbench')
            const releaseResult = await releaseToClient(order.id, 'Isabele', {
                sendToClient,
                sendToTranslator
            })

            if (releaseResult.success) {
                alert(`✅ ${generatedCount} Kit(s) oficial(is) gerado(s) com sucesso!\nCliente: ${sendToClient ? 'Sim' : 'Não'} | Tradutora: ${sendToTranslator ? 'Sim' : 'Não'}`)
            } else {
                alert(`✅ Kits gerados, mas email não enviado: ${releaseResult.error}`)
            }

            window.location.reload()
        } catch (err: any) {
            alert('Erro ao gerar kits: ' + err.message)
        } finally {
            setGeneratingKits(false)
        }
    }

    if (!selectedDoc) return <div className="p-4 text-sm text-gray-500">Nenhum documento encontrado.</div>

    const viewUrl = selectedDoc.translatedFileUrl || selectedDoc.originalFileUrl
    const activeDocIsReviewed = localReviewed.has(selectedDoc.id)

    return (
        <div className="relative h-[calc(100vh-80px)] flex overflow-hidden">

            {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
            <div className="w-56 shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col">
                <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Documentos</span>
                    <span className="text-[10px] bg-gray-700 text-gray-300 rounded-full px-1.5 py-0.5 font-mono">{order.documents.length}</span>
                </div>

                <button onClick={toggleSelectAll} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 border-b border-gray-800 hover:bg-gray-800 transition-colors shrink-0">
                    {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-[#f58220]" /> : <Square className="h-3.5 w-3.5" />}
                    <span>{allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
                </button>

                <div className="flex-1 overflow-y-auto py-1">
                    {order.documents.map((doc) => {
                        const isActive = doc.id === selectedDocId
                        const isChecked = selectedDocsForDelivery.includes(doc.id)
                        const docWithReview = { ...doc, isReviewed: localReviewed.has(doc.id) }
                        const { label: statusLabel, pill: pillClass } = getStatusInfo(docWithReview)

                        return (
                            <div key={doc.id} className={`flex items-start gap-2 px-2 py-2 mx-1 my-0.5 rounded-md group transition-colors ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`}>
                                <button onClick={(e) => { e.stopPropagation(); toggleDocForDelivery(doc.id) }} className="mt-0.5 shrink-0 text-gray-500 hover:text-[#f58220] transition-colors" title="Incluir na entrega">
                                    {isChecked ? <CheckSquare className="h-4 w-4 text-[#f58220]" /> : <Square className="h-4 w-4" />}
                                </button>
                                <button className="flex-1 min-w-0 text-left" onClick={() => setSelectedDocId(doc.id)}>
                                    <div className={`text-xs font-medium truncate leading-tight ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`} title={doc.exactNameOnDoc || doc.docType}>
                                        {doc.exactNameOnDoc || doc.docType}
                                    </div>
                                    <span className={`mt-1 inline-flex text-[9px] font-semibold px-1.5 py-0.5 rounded ring-1 ${pillClass}`}>
                                        {statusLabel}
                                    </span>
                                </button>
                            </div>
                        )
                    })}
                </div>

                {someSelected && (
                    <div className="px-3 py-2 border-t border-gray-700 bg-gray-800 shrink-0">
                        <p className="text-[10px] text-[#f58220] font-semibold">{selectedDocsForDelivery.length} selecionado(s) para entrega</p>
                    </div>
                )}
            </div>

            {/* ── CENTER: PDF VIEWER ────────────────────────────────────────────── */}
            <div className="flex-1 min-w-0 bg-gray-800 border-r border-gray-700 flex flex-col">
                <div className="bg-gray-900 text-white px-3 py-2 flex justify-between items-center text-xs shrink-0">
                    <span className="font-bold flex items-center gap-2 truncate">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="truncate">{selectedDoc.translatedFileUrl ? 'PDF Traduzido (DeepL)' : 'Documento Original'}</span>
                    </span>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                        {selectedDoc.translatedFileUrl && (
                            <a href={selectedDoc.translatedFileUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"><Eye className="w-3 h-3" /> Abrir ↗</a>
                        )}
                        {selectedDoc.delivery_pdf_url && (
                            <a href={selectedDoc.delivery_pdf_url} target="_blank" rel="noreferrer" className="text-[#f58220] hover:text-orange-300 font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Kit ↗</a>
                        )}
                    </div>
                </div>

                <div className="flex-1 relative bg-gray-500">
                    {viewUrl && viewUrl !== 'PENDING_UPLOAD' ? (
                        <iframe key={viewUrl} src={viewUrl} className="w-full h-full" title="PDF Viewer" />
                    ) : (
                        <div className="flex items-center justify-center h-full text-white text-sm">Arquivo pendente de upload</div>
                    )}
                </div>
            </div>

            {/* ── RIGHT: EDITOR & UPLOAD DE PDF ─────────────────────────────────── */}
            <div className="flex-1 min-w-0 flex flex-col bg-white">
                <div className="border-b border-gray-200 px-3 py-2 flex flex-wrap items-center gap-1.5 bg-gray-50 shrink-0">
                    <span className="text-xs font-bold text-gray-600 truncate max-w-[130px] mr-1" title={selectedDoc.exactNameOnDoc || selectedDoc.docType}>
                        {selectedDoc.exactNameOnDoc || selectedDoc.docType}
                    </span>
                    <span className="h-4 w-px bg-gray-300 mx-0.5" />

                    {(order.status === 'PENDING' || order.status === 'PENDING_PAYMENT') && <ManualApprovalButton orderId={order.id} />}

                    <button onClick={handleApplyPromobiStandard} title="Padrão USCIS/ATA" className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1.5 rounded text-[11px] font-bold hover:bg-indigo-100 flex items-center gap-1">
                        <AlignLeft className="h-3 w-3" /> Padrão
                    </button>

                    <button onClick={handleTranslateAI} disabled={isTranslating} className="bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1.5 rounded text-[11px] font-bold hover:bg-purple-100 flex items-center gap-1 disabled:opacity-50">
                        {isTranslating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} IA
                    </button>

                    {/* BOTÃO DE UPLOAD DE PDF EXTERNO */}
                    <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleExternalUpload} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={isUploadingExternal} className="bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1.5 rounded text-[11px] font-bold hover:bg-amber-100 flex items-center gap-1 transition-colors disabled:opacity-50">
                        {isUploadingExternal ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />} PDF Externo
                    </button>

                    <button onClick={handleSave} disabled={isSavingDraft || !!selectedDoc.externalTranslationUrl} className="bg-white border border-gray-300 text-gray-600 px-2 py-1.5 rounded text-[11px] font-bold hover:bg-gray-100 flex items-center gap-1 disabled:opacity-50">
                        <Save className="h-3 w-3" /> {isSavingDraft ? 'Salvando...' : 'Salvar'}
                    </button>

                    <span className="h-4 w-px bg-gray-300 mx-0.5" />

                    <button onClick={handlePreviewKit} disabled={isPreviewingKit || isSavingDraft} className="bg-sky-50 border border-sky-200 text-sky-700 px-2.5 py-1.5 rounded text-[11px] font-bold hover:bg-sky-100 flex items-center gap-1 disabled:opacity-50">
                        {isPreviewingKit ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanSearch className="h-3 w-3" />} Preview Kit
                    </button>

                    <button onClick={handleApproveDoc} disabled={isApproving || activeDocIsReviewed} className={`px-2.5 py-1.5 rounded text-[11px] font-bold flex items-center gap-1 border ${activeDocIsReviewed ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-60'}`}>
                        {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />} {activeDocIsReviewed ? 'Revisado ✓' : 'Aprovar'}
                    </button>
                </div>

                {selectedDoc.externalTranslationUrl ? (
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="shrink-0 bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-emerald-700">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-sm font-semibold">Tradução Externa Ativa</span>
                            </div>
                            <button onClick={handleRemoveExternal} className="text-red-600 text-xs font-semibold hover:underline flex items-center gap-1.5">
                                <Trash2 className="w-3.5 h-3.5" /> Remover PDF Externo
                            </button>
                        </div>
                        <iframe src={selectedDoc.externalTranslationUrl} className="w-full flex-1" title="PDF Externo" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto">
                        <ReactQuill theme="snow" value={editorContent} onChange={setEditorContent} className="h-full" modules={{ toolbar: [[{ header: [1, 2, false] }], ['bold', 'italic', 'underline', 'strike', 'blockquote'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['clean']] }} />
                    </div>
                )}
            </div>

            {/* ── FLOATING BOTTOM BAR ─────────────────────────────────────────── */}
            <div className={`absolute bottom-0 left-0 right-0 z-40 bg-gray-900 border-t-2 border-[#f58220] shadow-2xl transition-transform duration-200 ease-out ${someSelected ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <CheckSquare className="h-5 w-5 text-[#f58220] shrink-0" />
                        <div className="min-w-0">
                            <p className="text-white text-sm font-semibold leading-tight">{selectedDocsForDelivery.length} documento(s) selecionado(s)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button onClick={() => setSelectedDocsForDelivery([])} className="text-gray-400 hover:text-gray-200 p-1.5 rounded hover:bg-gray-700"><X className="h-4 w-4" /></button>
                        <button onClick={() => setShowDeliveryModal(true)} disabled={generatingKits} className="bg-[#f58220] hover:bg-orange-500 disabled:bg-orange-300 text-white font-bold px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm shadow-lg">
                            <Send className="h-4 w-4" /> Confirmar Envio...
                        </button>
                    </div>
                </div>
            </div>

            {/* ── MODAL DE SEGURANÇA (PRE-FLIGHT) ─────────────────────────────── */}
            {showDeliveryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-[500px] p-6 border border-gray-200">
                        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
                            <Send className="w-5 h-5 text-[#f58220]" /> Confirmar Disparo do Kit
                        </h2>
                        <p className="text-sm text-gray-500 mb-4">Você está prestes a certificar {selectedDocsForDelivery.length} documento(s). Escolha quem deve receber o email agora:</p>

                        <div className="space-y-3">
                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer border border-gray-200 hover:border-gray-300 transition-colors">
                                <input type="checkbox" checked={sendToClient} onChange={(e) => setSendToClient(e.target.checked)} className="w-5 h-5 text-[#f58220] rounded border-gray-300" />
                                <span className="text-gray-800 font-medium text-sm">Enviar para o Cliente <span className="text-gray-500 font-normal">({order.user.email})</span></span>
                            </label>

                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer border border-gray-200 hover:border-gray-300 transition-colors">
                                <input type="checkbox" checked={sendToTranslator} onChange={(e) => setSendToTranslator(e.target.checked)} className="w-5 h-5 text-[#f58220] rounded border-gray-300" />
                                <span className="text-gray-800 font-medium text-sm">Enviar cópia p/ Tradutora <span className="text-gray-500 font-normal">(isabele@promobi.us)</span></span>
                            </label>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                            <button onClick={() => setShowDeliveryModal(false)} className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                            <button onClick={confirmAndGenerateKits} disabled={generatingKits} className="px-5 py-2.5 text-sm font-bold text-white bg-[#f58220] rounded-lg hover:bg-orange-500 disabled:opacity-50 flex items-center gap-2 transition-colors">
                                {generatingKits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Gerar e Disparar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}