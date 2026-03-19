'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { BracketNotation } from './extensions/BracketNotation'
import { TranslatorNote } from './extensions/TranslatorNote'

interface EditorProps {
    content: string
    setContent: (content: string) => void
    pdfUrl?: string
    externalTranslationUrl?: string | null
    onSave?: (translatedPageCount?: number) => void
    onPreviewKit?: (translatedPageCount?: number, lang?: string) => void
    onApprove?: () => void
    onAttachPlanBPdf?: (file: File) => Promise<void>
    onRemoveExternalPdf?: () => Promise<void>
    isPreviewingKit?: boolean
    orderId?: number
    documentType?: string
    sourceLanguage?: string
}

export default function Editor({
    content,
    setContent,
    pdfUrl,
    externalTranslationUrl,
    onSave,
    onPreviewKit,
    onApprove,
    onAttachPlanBPdf,
    onRemoveExternalPdf,
    isPreviewingKit,
    orderId,
    documentType,
    sourceLanguage,
}: EditorProps) {
    const [showReference, setShowReference] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [showLangModal, setShowLangModal] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const editor = useEditor({
        extensions: [StarterKit, TableKit, BracketNotation, TranslatorNote],
        content,
        immediatelyRender: false,
        onUpdate: ({ editor }) => {
            setContent(editor.getHTML())
        },
    })

    // Sync external content changes (e.g. AI translation injected from parent) into the editor
    useEffect(() => {
        if (!editor) return
        if (content === editor.getHTML()) return
        editor.commands.setContent(content)
    }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleSaveClick = () => {
        if (onSave) onSave(1)
    }

    const handlePreviewClick = () => {
        setShowLangModal(true)
    }

    const confirmPreview = (lang: string) => {
        setShowLangModal(false)
        if (onPreviewKit) onPreviewKit(1, lang)
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file && onAttachPlanBPdf) {
            setIsUploading(true)
            try {
                await onAttachPlanBPdf(file)
            } finally {
                setIsUploading(false)
            }
        }
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleRemoveFile = async () => {
        if (onRemoveExternalPdf) {
            setIsUploading(true)
            await onRemoveExternalPdf()
            setIsUploading(false)
        }
    }

    return (
        <div className="flex flex-col h-full bg-gray-100 overflow-hidden font-sans w-full relative">

            {/* Toolbar */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shadow-sm z-50 shrink-0 w-full min-h-[60px]">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowReference(!showReference)}
                        className="text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                        {showReference ? '⬅ Ocultar Documento Original' : '📄 Ver Documento Original'}
                    </button>

                    {!externalTranslationUrl && onAttachPlanBPdf && (
                        <>
                            <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="text-sm font-bold text-amber-900 bg-amber-100 border border-amber-400 px-4 py-2 rounded-md hover:bg-amber-200 transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                {isUploading ? '⏳ Enviando...' : '📎 Anexar PDF (Plano B)'}
                            </button>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSaveClick}
                        className="text-gray-600 hover:text-blue-600 px-4 py-2 text-sm font-semibold transition border border-transparent hover:border-gray-200 rounded"
                    >
                        💾 Salvar
                    </button>

                    <button
                        type="button"
                        disabled
                        title="Download PDF direto foi removido. Use Preview Kit e geração estruturada."
                        className="text-slate-400 bg-slate-100 border border-slate-200 px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 cursor-not-allowed"
                    >
                        <>🔒 PDF Direto Bloqueado</>
                    </button>

                    <button
                        onClick={handlePreviewClick}
                        disabled={isPreviewingKit}
                        className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-5 py-2 rounded-md text-sm font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                        {isPreviewingKit ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-700 border-t-transparent" />
                                Gerando...
                            </>
                        ) : (
                            <>📦 Preview Kit</>
                        )}
                    </button>

                    <button
                        onClick={onApprove}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-md text-sm font-bold shadow-md transition-transform transform hover:scale-105"
                    >
                        ✅ Aprovar
                    </button>
                </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex overflow-hidden relative w-full bg-gray-200">

                {/* Left panel: original PDF */}
                {showReference && (
                    <div className="w-1/2 h-full border-r-2 border-gray-300 bg-slate-800 flex flex-col z-10 shadow-inner">
                        {pdfUrl ? (
                            <iframe src={pdfUrl} className="w-full h-full border-none" title="Original" />
                        ) : (
                            <div className="flex items-center justify-center h-full text-white/50 font-medium">
                                Documento original não carregado
                            </div>
                        )}
                    </div>
                )}

                {/* Right panel: editor or external PDF */}
                <div className={`h-full relative overflow-auto bg-gray-100 flex flex-col ${showReference ? 'w-1/2' : 'w-full'}`}>
                    {externalTranslationUrl ? (
                        <div className="flex flex-col h-full w-full">
                            <div className="bg-amber-100 text-amber-900 px-6 py-2 text-sm flex justify-between items-center border-b border-amber-300 shrink-0">
                                <span className="font-medium">External PDF active — structured translation is bypassed</span>
                                {onRemoveExternalPdf && (
                                    <button onClick={handleRemoveFile} disabled={isUploading} className="underline font-bold hover:text-amber-950 disabled:opacity-50">
                                        {isUploading ? 'Removendo...' : '🗑️ Remover e voltar ao editor'}
                                    </button>
                                )}
                            </div>
                            <iframe src={externalTranslationUrl} className="w-full flex-1 border-none" title="Tradução Externa" />
                        </div>
                    ) : (
                        <div className="flex justify-center py-8 px-4 min-h-full">
                            <div className="bg-white shadow-sm w-full max-w-3xl rounded">
                                <EditorContent
                                    editor={editor}
                                    className="prose prose-sm max-w-none p-8 min-h-[800px] outline-none focus:outline-none"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Language selection modal for Preview Kit */}
            {showLangModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                            <span className="text-xl">📄</span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Capa de Certificação</h3>
                        <p className="text-sm text-gray-500 mb-6">Qual deve ser o idioma da capa oficial para este documento?</p>

                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => confirmPreview('PT_BR')}
                                className="flex-1 py-3 bg-blue-50 text-blue-700 font-bold rounded-xl border border-blue-200 hover:bg-blue-100 transition-all"
                            >
                                PT ➔ EN
                            </button>
                            <button
                                onClick={() => confirmPreview('ES')}
                                className="flex-1 py-3 bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-200 hover:bg-emerald-100 transition-all"
                            >
                                ES ➔ EN
                            </button>
                        </div>

                        <button
                            onClick={() => setShowLangModal(false)}
                            className="mt-6 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
