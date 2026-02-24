'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Save, Send, FileText, CheckCircle, AlertTriangle, ChevronRight, Clock, ShieldCheck, Eye, Upload, Check, Loader2 } from 'lucide-react'
import { ConfirmPaymentButton } from '@/components/admin/ConfirmPaymentButton'
import { saveDocumentDraft } from '@/app/actions/save-draft'
import { retryTranslation } from '@/app/actions/retry-translation'
import { useUIFeedback } from '@/components/UIFeedbackProvider'
import 'react-quill-new/dist/quill.snow.css'

// Dynamic import for ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

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
    user: {
        fullName: string
        email: string
    }
}

export default function Workbench({ order }: { order: Order }) {
    const [selectedDocId, setSelectedDocId] = useState<number | null>(order.documents[0]?.id || null)
    const [editorContent, setEditorContent] = useState('')
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const { toast } = useUIFeedback()

    const selectedDoc = order.documents.find(d => d.id === selectedDocId)

    useEffect(() => {
        if (selectedDoc) {
            let initialContent = selectedDoc.translatedText;
            if (!initialContent) {
                if (selectedDoc.translation_status === 'error') {
                    initialContent = '<p style="color: #ef4444; font-weight: bold;">⚠️ Erro na tradução automática. Verifique os logs ou clique em "Tentar Novamente (DeepL)" no cabeçalho.</p>';
                } else if (selectedDoc.translation_status === 'needs_manual') {
                    initialContent = '<p style="color: #f59e0b; font-weight: bold;">✍️ Documento de imagem/complexo. Requer tradução manual ou OCR externo.</p>';
                } else {
                    initialContent = '<p>Aguardando tradução...</p>';
                }
            }
            setEditorContent(initialContent || '<p>Aguardando tradução...</p>')
        }
    }, [selectedDocId, selectedDoc])

    const handleSave = useCallback(async () => {
        if (!selectedDoc || saving) return;
        setSaving(true);

        const res = await saveDocumentDraft(selectedDoc.id, editorContent, order.id);

        if (res.success) {
            toast.success('Rascunho salvo!');
        } else {
            toast.error('Erro ao salvar rascunho.');
        }
        setSaving(false);
    }, [selectedDoc, editorContent, order.id, saving, toast]);

    // Keyboard Shortcut: Cmd/Ctrl + S
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave]);

    const handleFinalize = async () => {
        if (!selectedDoc) return;
        if (!confirm("Isso irá gerar o Kit de Entrega final (PDF Flat) nos servidores e marcará como concluído. Confirmar?")) return;

        setSaving(true);

        try {
            // Server-Side Delivery Kit Generator
            const { generateDeliveryKit } = await import('../../../../actions/generateDeliveryKit');
            const result = await generateDeliveryKit(order.id);

            if (!result.success || !result.deliveryUrl) {
                throw new Error(result.error || "Falha ao gerar o Delivery Kit.");
            }

            // After Kit is generated and uploaded, we can trigger the email notification
            const { sendDelivery } = await import('../../../../actions/sendDelivery');
            const sendResult = await sendDelivery(order.id);

            if (!sendResult.success) {
                throw new Error("Kit Gerado, mas falha no envio do email: " + sendResult.error);
            }

            toast.success("Sucesso! O Pedido foi certificado e enviado ao cliente.");
            window.location.reload();

        } catch (error: any) {
            console.error(error);
            toast.error("Erro ao finalizar: " + error.message);
        } finally {
            setSaving(false);
        }
    }

    const handleRetryDeepL = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const res = await retryTranslation(order.id);
            if (res.success) {
                toast.success('Gatilho disparado! Atualize a página em alguns instantes.');
            } else {
                toast.error('Erro: ' + res.error);
            }
        } catch (err: any) {
            toast.error('Erro inesperado: ' + err.message);
        } finally {
            setSaving(false);
        }
    }

    const handleUploadTranslation = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedDoc) return;

        if (file.type !== 'application/pdf') {
            toast.error('Por favor, envie um arquivo PDF.');
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('docId', String(selectedDoc.id));
            formData.append('orderId', String(order.id));

            const res = await fetch('/api/workbench/upload-delivery', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Falha no upload');

            toast.success('PDF de tradução enviado com sucesso!');
            window.location.reload(); // Refresh to get the new delivery_pdf_url
        } catch (err: any) {
            toast.error('Erro no upload: ' + err.message);
        } finally {
            setUploading(false);
        }
    };

    if (!order.documents || order.documents.length === 0) return <div className="p-8 text-center text-gray-500">Nenhum documento encontrado.</div>
    if (!selectedDoc) return <div className="p-8 text-center text-gray-500">Documento selecionado não encontrado.</div>

    return (
        <div className="h-[calc(100vh-64px)] flex bg-slate-900 overflow-hidden">

            {/* 1. DOCUMENT SIDEBAR (Revolution) */}
            <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
                <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#f58220]" /> Documentos ({order.documents.length})
                    </h2>
                </div>
                <nav className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {order.documents.map((doc) => {
                        const isActive = doc.id === selectedDocId;
                        const isRevised = doc.translation_status === 'REVISED' || doc.translation_status === 'COMPLETED';

                        return (
                            <button
                                key={doc.id}
                                onClick={() => setSelectedDocId(doc.id)}
                                className={`w-full text-left p-3 rounded-xl transition-all group relative flex items-start gap-3 ${isActive
                                    ? 'bg-[#f58220]/10 border border-[#f58220]/20'
                                    : 'hover:bg-slate-800 border border-transparent'
                                    }`}
                            >
                                <div className={`mt-1 p-1.5 rounded-lg shrink-0 ${isActive ? 'bg-[#f58220] text-white' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'
                                    }`}>
                                    <FileText className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={`text-[11px] font-bold truncate leading-tight ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                                        }`}>
                                        {doc.exactNameOnDoc || doc.docType}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        {isRevised ? (
                                            <span className="flex items-center gap-1 text-[9px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                                                <CheckCircle className="w-2.5 h-2.5" /> REVISADO
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[9px] font-bold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-full">
                                                <Clock className="w-2.5 h-2.5" /> PENDENTE
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#f58220] rounded-r-full" />
                                )}
                            </button>
                        );
                    })}
                </nav>
                <div className="p-4 bg-slate-800/30 border-t border-slate-800">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase">
                        <ShieldCheck className="w-3 h-3" /> Operador: Isabele
                    </div>
                </div>
            </aside>

            {/* 2. MAIN WORKSPACE (PDF + EDITOR) */}
            <main className="flex-1 flex overflow-hidden">

                {/* PDF VIEWER */}
                <div className="flex-1 flex flex-col bg-slate-800">
                    <div className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 p-3 h-12 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-slate-400" />
                            <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider">Visualização Original</span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                            PDF READER
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

                {/* EDITOR SPACE */}
                <div className="w-1/2 flex flex-col bg-white border-l border-slate-800">
                    <header className="p-3 h-12 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">Editor de Tradução</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {['PENDING', 'PENDING_PAYMENT', 'AWAITING_VERIFICATION'].includes(order.status) && (
                                <div className="flex items-center gap-2">
                                    <ConfirmPaymentButton
                                        order={order as any}
                                        confirmedByName="Isabele"
                                        onConfirmed={() => window.location.reload()}
                                    />
                                </div>
                            )}
                            {order.status === 'TRANSLATING' && order.documents.some(d => d.translation_status === 'error') && (
                                <button
                                    onClick={handleRetryDeepL}
                                    disabled={saving}
                                    className="h-8 bg-orange-500 text-white px-3 rounded-lg text-xs font-bold hover:bg-orange-600 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                                >
                                    <Clock className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
                                    Tentar Novamente (DeepL)
                                </button>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                title="Atalho: Cmd + S"
                                className="h-8 bg-white border border-slate-200 text-slate-700 px-3 rounded-lg text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                            >
                                <Save className={`w-3.5 h-3.5 ${saving ? 'animate-pulse' : ''}`} />
                                {saving ? 'Salvando...' : 'Salvar Rascunho'}
                            </button>
                        </div>
                    </header>

                    {/* STATUS BANNER */}
                    {(selectedDoc.translation_status === 'error' || selectedDoc.translation_status === 'needs_manual') && (
                        <div className={`p-3 border-b flex items-start gap-3 ${selectedDoc.translation_status === 'error' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                            <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${selectedDoc.translation_status === 'error' ? 'text-red-600' : 'text-amber-600'}`} />
                            <div>
                                <p className={`text-xs font-bold ${selectedDoc.translation_status === 'error' ? 'text-red-800' : 'text-amber-800'}`}>
                                    {selectedDoc.translation_status === 'error' ? 'Falha na tradução automática' : 'Tradução manual necessária'}
                                </p>
                                <p className={`text-[10px] ${selectedDoc.translation_status === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                                    {selectedDoc.translation_status === 'error'
                                        ? 'Ocorreu um erro técnico. Você pode tentar novamente ou fazer o upload do PDF manual abaixo.'
                                        : 'Documento escaneado ou imagem não compatível com DeepL. Traduza manualmente.'}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-hidden">
                        <ReactQuill
                            theme="snow"
                            value={editorContent}
                            onChange={setEditorContent}
                            className="h-full quill-senior-mode"
                            modules={{
                                toolbar: [
                                    [{ 'header': [1, 2, false] }],
                                    ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                                    ['clean']
                                ]
                            }}
                        />
                    </div>

                    <footer className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div className="text-[10px] text-slate-400 font-medium">
                            Auto-save via <kbd className="bg-slate-200 px-1 rounded text-slate-600">Cmd+S</kbd>
                        </div>
                        <div className="flex items-center gap-3">
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
                                className={`h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all border shadow-sm ${selectedDoc.delivery_pdf_url
                                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                                    : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                                    } ${uploading ? 'opacity-50 cursor-wait' : ''}`}
                            >
                                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {selectedDoc.delivery_pdf_url ? 'Substituir PDF Traduzido' : 'Upload PDF Traduzido'}
                            </label>

                            <button
                                onClick={handleFinalize}
                                disabled={saving || !selectedDoc.delivery_pdf_url}
                                className="bg-[#f58220] hover:bg-orange-600 active:scale-[0.98] text-white h-10 px-6 rounded-xl font-black text-sm shadow-lg shadow-orange-500/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none"
                            >
                                <CheckCircle className="h-4 w-4" /> Certificar e Finalizar Pedido
                            </button>
                        </div>
                    </footer>
                </div>
            </main>

            <style jsx global>{`
                .quill-senior-mode .ql-container {
                    height: calc(100% - 42px);
                    font-size: 14px;
                    font-family: 'Inter', sans-serif;
                }
                .quill-senior-mode .ql-editor {
                    padding: 2rem;
                    line-height: 1.6;
                }
                .quill-senior-mode .ql-toolbar {
                    border: 0 !important;
                    background: #f8fafc;
                    border-bottom: 1px solid #e2e8f0 !important;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #334155;
                    border-radius: 10px;
                }
            `}</style>
        </div>
    )
}
