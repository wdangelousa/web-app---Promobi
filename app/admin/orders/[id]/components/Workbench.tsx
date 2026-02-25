'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
    Save, FileText, CheckCircle, AlertTriangle, Clock, ShieldCheck,
    Eye, Upload, Loader2, Zap, PenLine, RotateCcw, Package,
    ChevronLeft, ChevronRight,
} from 'lucide-react'
import { ConfirmPaymentButton } from '@/components/admin/ConfirmPaymentButton'
import { saveDocumentDraft } from '@/app/actions/save-draft'
import { retryTranslation } from '@/app/actions/retry-translation'
import { useUIFeedback } from '@/components/UIFeedbackProvider'
import 'react-quill-new/dist/quill.snow.css'

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

type Document = {
    id: number
    docType: string
    originalFileUrl: string
    translatedFileUrl?: string | null
    translatedText: string | null
    exactNameOnDoc?: string | null
    translation_status?: string | null
    delivery_pdf_url?: string | null
}

type Order = {
    id: number
    status: string
    totalAmount: number
    urgency: string
    documents: Document[]
    user: { fullName: string; email: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * P1 — Maps the 5 real translation states to distinct visual badges.
 * Previously all non-revised docs collapsed into one ambiguous "PENDENTE" badge.
 */
function getDocBadge(doc: Document) {
    const hasPdf = !!doc.delivery_pdf_url
    const s = doc.translation_status

    if (hasPdf || s === 'REVISED' || s === 'COMPLETED')
        return { label: 'REVISADO',    classes: 'text-green-500 bg-green-500/10',   Icon: CheckCircle  }
    if (s === 'translated')
        return { label: 'RASCUNHO IA', classes: 'text-indigo-400 bg-indigo-400/10', Icon: Zap          }
    if (s === 'error')
        return { label: 'ERRO DEEPL',  classes: 'text-red-500 bg-red-500/10',       Icon: AlertTriangle }
    if (s === 'needs_manual')
        return { label: 'MANUAL',      classes: 'text-amber-400 bg-amber-400/10',   Icon: PenLine      }

    return   { label: 'AGUARDANDO',  classes: 'text-slate-500 bg-slate-500/10',   Icon: Clock        }
}

/** A doc is "done" when the operator has either uploaded its PDF or saved the translation. */
function isDocDone(doc: Document): boolean {
    return !!(
        doc.delivery_pdf_url ||
        doc.translation_status === 'REVISED' ||
        doc.translation_status === 'COMPLETED'
    )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Workbench({ order }: { order: Order }) {
    const router = useRouter()

    const [selectedDocId, setSelectedDocId] = useState<number | null>(order.documents[0]?.id ?? null)
    const [editorContent, setEditorContent]   = useState('')
    const [savedContent, setSavedContent]     = useState('') // P3: tracks what's in the DB
    const [saving, setSaving]                 = useState(false)
    const [uploading, setUploading]           = useState(false)
    const [isTranslating, setIsTranslating]   = useState(false)
    const { toast } = useUIFeedback()

    const selectedDoc      = order.documents.find(d => d.id === selectedDocId)
    const currentDocIndex  = order.documents.findIndex(d => d.id === selectedDocId)
    const totalCount       = order.documents.length

    // P2 — Progress
    const doneCount    = order.documents.filter(isDocDone).length
    const progressPct  = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

    // P4 — Finalize is an order-level action: enabled when all docs are handled
    const allDocsHandled = order.documents.every(isDocDone)

    // P3 — Dirty state: true when editor has unsaved changes vs what's in the DB
    const isDirty = editorContent !== savedContent

    // Use a ref so keyboard handler always has the current isDirty without re-registering
    const isDirtyRef = useRef(isDirty)
    isDirtyRef.current = isDirty

    // ── Load editor content when switching documents ──────────────────────────
    useEffect(() => {
        if (!selectedDoc) return

        let content = selectedDoc.translatedText
        if (!content) {
            if (selectedDoc.translation_status === 'error') {
                content = '<p style="color: #ef4444; font-weight: bold;">⚠️ Erro na tradução automática. Verifique os logs ou use "Tentar Novamente (DeepL)".</p>'
            } else if (selectedDoc.translation_status === 'needs_manual') {
                content = '<p style="color: #f59e0b; font-weight: bold;">✍️ Documento escaneado/imagem. Requer tradução manual ou upload do PDF.</p>'
            } else {
                content = '<p>Aguardando tradução...</p>'
            }
        }
        const safeContent = content || '<p>Aguardando tradução...</p>'
        setEditorContent(safeContent)
        setSavedContent(safeContent) // reset dirty state when switching docs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDocId]) // Intentionally only on docId change to avoid resetting mid-edit on background refresh

    // ── P3: safe doc selector — warns on unsaved changes ──────────────────────
    const handleDocSelect = useCallback((docId: number) => {
        if (isDirtyRef.current) {
            if (!window.confirm('Você tem alterações não salvas neste documento. Deseja descartá-las?')) return
        }
        setSelectedDocId(docId)
    }, []) // stable — reads isDirty via ref

    // ── Save draft ────────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        if (!selectedDoc || saving) return
        setSaving(true)
        const res = await saveDocumentDraft(selectedDoc.id, editorContent, order.id)
        if (res.success) {
            setSavedContent(editorContent) // P3: mark clean
            toast.success('Rascunho salvo!')
        } else {
            toast.error('Erro ao salvar rascunho.')
        }
        setSaving(false)
    }, [selectedDoc, editorContent, order.id, saving, toast])

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return

            if (e.key === 's') {
                e.preventDefault()
                handleSave()
                return
            }
            // P5 — Navigate between documents with Cmd+←→
            if (e.key === 'ArrowRight' && currentDocIndex < totalCount - 1) {
                e.preventDefault()
                handleDocSelect(order.documents[currentDocIndex + 1].id)
                return
            }
            if (e.key === 'ArrowLeft' && currentDocIndex > 0) {
                e.preventDefault()
                handleDocSelect(order.documents[currentDocIndex - 1].id)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [handleSave, handleDocSelect, currentDocIndex, totalCount, order.documents])

    // ── Finalize entire order ─────────────────────────────────────────────────
    const handleFinalize = async () => {
        if (!confirm('Isso irá gerar o Kit de Entrega final para TODOS os documentos do pedido e enviará ao cliente. Confirmar?')) return
        setSaving(true)
        try {
            const { generateDeliveryKit } = await import('../../../../actions/generateDeliveryKit')
            const result = await generateDeliveryKit(order.id)
            if (!result.success || !result.deliveryUrl) {
                throw new Error(result.error || 'Falha ao gerar o Delivery Kit.')
            }

            const { sendDelivery } = await import('../../../../actions/sendDelivery')
            const sendResult = await sendDelivery(order.id)
            if (!sendResult.success) {
                throw new Error('Kit gerado, mas falha no envio do e-mail: ' + sendResult.error)
            }

            toast.success('Sucesso! O pedido foi certificado e enviado ao cliente.')
            router.refresh()
        } catch (error: any) {
            console.error('[Workbench] handleFinalize:', error)
            toast.error('Erro ao finalizar: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    // ── Translate selected doc with DeepL (on-demand, per document) ──────────
    const handleTranslateWithAI = async () => {
        if (!selectedDoc || isTranslating) return
        setIsTranslating(true)
        try {
            const { translateSingleDocument } = await import('@/app/actions/generateTranslation')
            const res = await translateSingleDocument(selectedDoc.id)
            if (res.success && res.text) {
                // Convert plain text → minimal HTML for ReactQuill:
                // double newlines → paragraphs, single newlines → <br>
                const html = '<p>' +
                    res.text
                        .split(/\n\n+/)
                        .map(p => p.replace(/\n/g, '<br>').trim())
                        .filter(Boolean)
                        .join('</p><p>') +
                    '</p>'
                setEditorContent(html)
                setSavedContent(html) // fresh from DB — not dirty
                toast.success('Tradução concluída! Revise o texto abaixo.')
            } else {
                toast.error(res.error ?? 'Falha na tradução automática.')
            }
        } catch (err: any) {
            toast.error('Erro inesperado: ' + err.message)
        } finally {
            setIsTranslating(false)
        }
    }

    // ── Retry DeepL ───────────────────────────────────────────────────────────
    const handleRetryDeepL = async () => {
        if (saving) return
        setSaving(true)
        try {
            const res = await retryTranslation(order.id)
            if (res.success) {
                toast.success('Gatilho disparado! Atualize a página em alguns instantes.')
            } else {
                toast.error('Erro: ' + res.error)
            }
        } catch (err: any) {
            toast.error('Erro inesperado: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    // ── Upload translated PDF ─────────────────────────────────────────────────
    const handleUploadTranslation = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !selectedDoc) return
        if (file.type !== 'application/pdf') {
            toast.error('Por favor, envie um arquivo PDF.')
            return
        }
        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('docId', String(selectedDoc.id))
            formData.append('orderId', String(order.id))
            const res  = await fetch('/api/workbench/upload-delivery', { method: 'POST', body: formData })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Falha no upload')
            toast.success('PDF de tradução enviado com sucesso!')
            router.refresh()
        } catch (err: any) {
            toast.error('Erro no upload: ' + err.message)
        } finally {
            setUploading(false)
        }
    }

    // ── Guard renders ─────────────────────────────────────────────────────────
    if (!order.documents?.length)
        return <div className="p-8 text-center text-gray-500">Nenhum documento encontrado.</div>
    if (!selectedDoc)
        return <div className="p-8 text-center text-gray-500">Documento selecionado não encontrado.</div>

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="h-[calc(100vh-64px)] flex bg-slate-900 overflow-hidden">

            {/* ── SIDEBAR ────────────────────────────────────────────────── */}
            <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">

                {/* P2 — Header with progress */}
                <div className="p-4 border-b border-slate-800 bg-slate-900/50 space-y-3">
                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#f58220]" />
                        Documentos ({totalCount})
                    </h2>
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Revisados</span>
                            <span className={`text-[11px] font-black ${doneCount === totalCount ? 'text-green-400' : 'text-slate-300'}`}>
                                {doneCount} / {totalCount}
                            </span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    progressPct === 100 ? 'bg-green-500' : 'bg-[#f58220]'
                                }`}
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Document list */}
                <nav className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {order.documents.map((doc) => {
                        const isActive = doc.id === selectedDocId
                        const badge    = getDocBadge(doc)
                        const BadgeIcon = badge.Icon

                        return (
                            <button
                                key={doc.id}
                                onClick={() => handleDocSelect(doc.id)}
                                className={`w-full text-left p-3 rounded-xl transition-all group relative flex items-start gap-3 ${
                                    isActive
                                        ? 'bg-[#f58220]/10 border border-[#f58220]/20'
                                        : 'hover:bg-slate-800 border border-transparent'
                                }`}
                            >
                                <div className={`mt-1 p-1.5 rounded-lg shrink-0 ${
                                    isActive
                                        ? 'bg-[#f58220] text-white'
                                        : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'
                                }`}>
                                    <FileText className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={`text-[11px] font-bold truncate leading-tight ${
                                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                                    }`}>
                                        {doc.exactNameOnDoc || doc.docType}
                                    </p>
                                    {/* P1 — Distinct badge per status */}
                                    <span className={`mt-1 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badge.classes}`}>
                                        <BadgeIcon className="w-2.5 h-2.5" />
                                        {badge.label}
                                    </span>
                                </div>
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#f58220] rounded-r-full" />
                                )}
                            </button>
                        )
                    })}
                </nav>

                {/* P4 — Sidebar footer: order-level finalize action */}
                <div className="p-3 border-t border-slate-800 space-y-2">
                    <button
                        onClick={handleFinalize}
                        disabled={saving || order.status === 'COMPLETED'}
                        title={
                            order.status === 'COMPLETED'
                                ? 'Pedido já enviado'
                                : !allDocsHandled
                                    ? `Faltam ${totalCount - doneCount} doc(s) para revisar`
                                    : 'Gerar Kit de Entrega e enviar ao cliente'
                        }
                        className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-black text-xs transition-all disabled:opacity-60 ${
                            order.status === 'COMPLETED'
                                ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
                                : allDocsHandled
                                    ? 'bg-[#f58220] hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 active:scale-[0.98]'
                                    : 'bg-slate-700/50 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                        }`}
                    >
                        {order.status === 'COMPLETED' ? (
                            <><CheckCircle className="w-3.5 h-3.5" /> Pedido Enviado</>
                        ) : saving ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando Kit...</>
                        ) : (
                            <>
                                <Package className="w-3.5 h-3.5" />
                                Certificar Pedido
                                {!allDocsHandled && (
                                    <span className="ml-1 opacity-70">({doneCount}/{totalCount})</span>
                                )}
                            </>
                        )}
                    </button>
                    <div className="flex items-center gap-2 text-[10px] text-slate-600 font-bold uppercase">
                        <ShieldCheck className="w-3 h-3" /> Operador: Isabele
                    </div>
                </div>
            </aside>

            {/* ── MAIN WORKSPACE ─────────────────────────────────────────── */}
            <main className="flex-1 flex overflow-hidden">

                {/* PDF VIEWER */}
                <div className="flex-1 flex flex-col bg-slate-800">
                    <div className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 p-3 h-12 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-slate-400" />
                            <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider">Visualização Original</span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                            {currentDocIndex + 1} / {totalCount}
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        {selectedDoc.originalFileUrl !== 'PENDING_UPLOAD' ? (
                            <iframe
                                src={selectedDoc.originalFileUrl}
                                className="w-full h-full border-0"
                                title="PDF Viewer"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
                                <AlertTriangle className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-sm font-bold">Arquivo pendente de upload</p>
                                <p className="text-xs opacity-60">Aguarde o processamento do cliente</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* EDITOR */}
                <div className="w-1/2 flex flex-col bg-white border-l border-slate-800">

                    {/* Editor header */}
                    <header className="p-3 h-12 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">Editor de Tradução</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {['PENDING', 'PENDING_PAYMENT', 'AWAITING_VERIFICATION'].includes(order.status) && (
                                <ConfirmPaymentButton
                                    order={order as any}
                                    confirmedByName="Isabele"
                                    onConfirmed={() => router.refresh()}
                                />
                            )}
                            {order.status === 'TRANSLATING' && order.documents.some(d => d.translation_status === 'error') && (
                                <button
                                    onClick={handleRetryDeepL}
                                    disabled={saving || isTranslating}
                                    className="h-8 bg-orange-500 text-white px-3 rounded-lg text-xs font-bold hover:bg-orange-600 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                                >
                                    <RotateCcw className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
                                    Tentar Novamente (DeepL)
                                </button>
                            )}
                            {/* Per-doc on-demand AI translation */}
                            {!isDocDone(selectedDoc) && (
                                <button
                                    onClick={handleTranslateWithAI}
                                    disabled={isTranslating || saving}
                                    title="Força a tradução deste documento via DeepL agora"
                                    className="h-8 bg-indigo-600 text-white px-3 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                                >
                                    {isTranslating ? (
                                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Traduzindo...</>
                                    ) : (
                                        <><Zap className="w-3.5 h-3.5" /> Traduzir com IA</>
                                    )}
                                </button>
                            )}
                            {/* P3 — Save button with dirty indicator */}
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                title="Atalho: Cmd + S"
                                className={`relative h-8 bg-white border text-slate-700 px-3 rounded-lg text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 ${
                                    isDirty ? 'border-yellow-400' : 'border-slate-200'
                                }`}
                            >
                                <Save className={`w-3.5 h-3.5 ${saving ? 'animate-pulse' : ''}`} />
                                {saving ? 'Salvando...' : 'Salvar Rascunho'}
                                {isDirty && !saving && (
                                    <span
                                        className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full border border-white"
                                        title="Alterações não salvas"
                                    />
                                )}
                            </button>
                        </div>
                    </header>

                    {/* Status banners */}
                    {(selectedDoc.translation_status === 'error' || selectedDoc.translation_status === 'needs_manual') && (
                        <div className={`p-3 border-b flex items-start gap-3 shrink-0 ${
                            selectedDoc.translation_status === 'error' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                        }`}>
                            <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                                selectedDoc.translation_status === 'error' ? 'text-red-600' : 'text-amber-600'
                            }`} />
                            <div>
                                <p className={`text-xs font-bold ${
                                    selectedDoc.translation_status === 'error' ? 'text-red-800' : 'text-amber-800'
                                }`}>
                                    {selectedDoc.translation_status === 'error' ? 'Falha na tradução automática' : 'Tradução manual necessária'}
                                </p>
                                <p className={`text-[10px] ${
                                    selectedDoc.translation_status === 'error' ? 'text-red-600' : 'text-amber-600'
                                }`}>
                                    {selectedDoc.translation_status === 'error'
                                        ? 'Erro técnico. Tente novamente via botão no cabeçalho ou faça upload do PDF manual abaixo.'
                                        : 'PDF escaneado/imagem não compatível com DeepL. Traduza manualmente ou faça upload do PDF.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Rich text editor */}
                    <div className="flex-1 overflow-hidden">
                        <ReactQuill
                            theme="snow"
                            value={editorContent}
                            onChange={setEditorContent}
                            className="h-full quill-senior-mode"
                            modules={{
                                toolbar: [
                                    [{ header: [1, 2, false] }],
                                    ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                                    [{ list: 'ordered' }, { list: 'bullet' }],
                                    ['clean'],
                                ],
                            }}
                        />
                    </div>

                    {/* P5 — Footer: keyboard hints + doc navigation + per-doc upload */}
                    <footer className="p-3 border-t border-slate-200 bg-slate-50 shrink-0">
                        <div className="flex items-center justify-between gap-2">

                            {/* Left: keyboard shortcut hints */}
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium flex-wrap">
                                <kbd className="bg-slate-200 px-1 rounded text-slate-600 text-[9px]">Cmd+S</kbd>
                                <span>salvar</span>
                                <span className="text-slate-300 mx-0.5">·</span>
                                <kbd className="bg-slate-200 px-1 rounded text-slate-600 text-[9px]">Cmd+←→</kbd>
                                <span>navegar</span>
                            </div>

                            {/* Right: nav buttons + upload */}
                            <div className="flex items-center gap-2 shrink-0">
                                {/* Doc navigation arrows */}
                                <button
                                    onClick={() => currentDocIndex > 0 && handleDocSelect(order.documents[currentDocIndex - 1].id)}
                                    disabled={currentDocIndex === 0}
                                    title="Documento anterior (Cmd+←)"
                                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => currentDocIndex < totalCount - 1 && handleDocSelect(order.documents[currentDocIndex + 1].id)}
                                    disabled={currentDocIndex === totalCount - 1}
                                    title="Próximo documento (Cmd+→)"
                                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>

                                <div className="w-px h-5 bg-slate-200" />

                                {/* Per-doc PDF upload */}
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={handleUploadTranslation}
                                    className="hidden"
                                    id="pdf-upload"
                                    disabled={uploading}
                                />
                                <label
                                    htmlFor="pdf-upload"
                                    className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all border shadow-sm ${
                                        selectedDoc.delivery_pdf_url
                                            ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                                            : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                                    } ${uploading ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                    {uploading
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <Upload className="w-3.5 h-3.5" />
                                    }
                                    {selectedDoc.delivery_pdf_url ? 'Substituir PDF' : 'Upload PDF'}
                                </label>
                            </div>
                        </div>
                    </footer>
                </div>
            </main>

            <style jsx global>{`
                .quill-senior-mode .ql-container  { height: calc(100% - 42px); font-size: 14px; font-family: 'Inter', sans-serif; }
                .quill-senior-mode .ql-editor     { padding: 2rem; line-height: 1.6; }
                .quill-senior-mode .ql-toolbar    { border: 0 !important; background: #f8fafc; border-bottom: 1px solid #e2e8f0 !important; }
                .custom-scrollbar::-webkit-scrollbar       { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}</style>
        </div>
    )
}
