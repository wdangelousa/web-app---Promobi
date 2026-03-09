import React, { useState, useEffect, useRef } from 'react';
import {
    DocumentEditorContainerComponent,
    Toolbar,
    Editor as SyncfusionEditor,
    Selection as SyncfusionSelection,
    EditorHistory
} from '@syncfusion/ej2-react-documenteditor';
import { registerLicense } from '@syncfusion/ej2-base';

// ── Estilos nativos do Syncfusion ──────────
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-popups/styles/material.css';
import '@syncfusion/ej2-lists/styles/material.css';
import '@syncfusion/ej2-navigations/styles/material.css';
import '@syncfusion/ej2-splitbuttons/styles/material.css';
import '@syncfusion/ej2-dropdowns/styles/material.css';
import '@syncfusion/ej2-react-documenteditor/styles/material.css';

DocumentEditorContainerComponent.Inject(Toolbar, SyncfusionEditor, SyncfusionSelection, EditorHistory);

registerLicense('Ngo9BigBOggjHTQxAR8/V1JGaF1cXmhKYVJ3WmFZfVhgdl9CYVZRRmY/P1ZhSXxVdkZjXX5adHVVRGNEVU19XEA=');

interface EditorProps {
    content: string;
    setContent: (content: string) => void;
    pdfUrl?: string;
    translatedPdfUrl?: string | null;
    onSave?: (translatedPageCount?: number) => void;
    onPreviewKit?: (translatedPageCount?: number) => void;
    onApprove?: () => void;
    onUploadExternalPdf?: (file: File) => Promise<void>;
    onRemoveExternalPdf?: () => Promise<void>;
    isPreviewingKit?: boolean;
}

export default function Editor({ content, setContent, pdfUrl, translatedPdfUrl, onSave, onPreviewKit, onApprove, onUploadExternalPdf, onRemoveExternalPdf, isPreviewingKit }: EditorProps) {
    const [showReference, setShowReference] = useState(false);
    const [isEditorReady, setIsEditorReady] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const containerRef = useRef<DocumentEditorContainerComponent>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const lastInjectedContent = useRef('');

    useEffect(() => {
        if (translatedPdfUrl) return; // External PDF active — skip Syncfusion injection
        if (!isEditorReady || !content || !containerRef.current) return;
        if (content === lastInjectedContent.current) return;

        const docEditor = containerRef.current.documentEditor;
        if (!docEditor) return;

        try {
            // Normaliza: Supabase pode retornar um objeto JS em vez de string
            const textContent = typeof content === 'object' ? JSON.stringify(content) : String(content);
            const isSFDT = textContent.includes('"optimizeSfdt"') || textContent.includes('"sections"') || textContent.includes('"sec":');

            if (isSFDT) {
                docEditor.open(textContent);
                lastInjectedContent.current = content;
            } else {
                // É o HTML vindo da IA Gemini
                // O Syncfusion React NÃO suporta a função insertHtml nativamente sem backend.
                // Solução: Converte o HTML rico para Texto Puro mantendo os parágrafos.
                let plainText = content
                    .replace(/<br\s*[\/]?>/gi, '\n') // Troca tags <br> por quebra de linha real
                    .replace(/<\/p>/gi, '\n\n')       // O fim do parágrafo dá dois "Enters"
                    .replace(/<[^>]+>/g, '')          // Remove as tags HTML que sobraram
                    .replace(/&nbsp;/g, ' ')          // Troca espaços vazios
                    .trim();

                if (!plainText) plainText = "Falha ao extrair texto da IA.";

                docEditor.isReadOnly = false;
                docEditor.focusIn();
                docEditor.selection.selectAll();

                setTimeout(() => {
                    if (docEditor.editor) {
                        // USA O MÉTODO OFICIAL DE INJEÇÃO DE TEXTO DO SYNCFUSION
                        docEditor.editor.insertText(plainText);

                        docEditor.selection.moveToDocumentStart();
                        lastInjectedContent.current = content;

                        // Salva silenciosamente o documento gerado em formato compatível com o Syncfusion
                        setTimeout(() => {
                            const newSfdt = docEditor.serialize();
                            if (newSfdt && newSfdt !== content) {
                                setContent(newSfdt);
                                lastInjectedContent.current = newSfdt;
                            }
                        }, 500);
                    }
                }, 50);
            }
        } catch (error) {
            console.error('Erro ao processar conteúdo no Syncfusion:', error);
        }
    }, [content, isEditorReady, setContent]);

    const handleSaveClick = () => {
        if (translatedPdfUrl) { if (onSave) onSave(1); return; }
        if (!containerRef.current) return;
        const docEditor = containerRef.current.documentEditor;
        if (!docEditor) return;

        const sfdt = docEditor.serialize();
        const pages = docEditor.pageCount;
        setContent(sfdt);
        lastInjectedContent.current = sfdt;

        if (onSave) {
            setTimeout(() => onSave(pages), 150);
        }
    };

    const handlePreviewClick = () => {
        if (translatedPdfUrl) { if (onPreviewKit) onPreviewKit(1); return; }
        const pages = containerRef.current?.documentEditor?.pageCount;
        if (onPreviewKit) onPreviewKit(pages);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && onUploadExternalPdf) {
            setIsUploading(true);
            // Yield to main thread (INP) to show loading state before heavy work
            setTimeout(async () => {
                try {
                    await onUploadExternalPdf(file);
                } finally {
                    setIsUploading(false);
                }
            }, 0);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleRemoveFile = async () => {
        if (onRemoveExternalPdf) {
            setIsUploading(true);
            await onRemoveExternalPdf();
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-100 overflow-hidden font-sans w-full">

            <div className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shadow-sm z-50 shrink-0 w-full min-h-[60px]">

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowReference(!showReference)}
                        className="text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                        {showReference ? '⬅ Ocultar Documento Original' : '📄 Ver Documento Original'}
                    </button>

                    {!translatedPdfUrl && onUploadExternalPdf && (
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

            <div className="flex-1 flex overflow-hidden relative w-full bg-gray-200">

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

                <div className={`h-full relative overflow-hidden bg-white min-h-[500px] flex flex-col ${showReference ? 'w-1/2' : 'w-full'}`}>
                    {translatedPdfUrl ? (
                        <div className="flex flex-col h-full w-full">
                            <div className="bg-amber-100 text-amber-900 px-6 py-2 text-sm flex justify-between items-center border-b border-amber-300 shrink-0">
                                <span className="font-medium">⚠️ PDF externo ativo — editor de texto desabilitado.</span>
                                {onRemoveExternalPdf && (
                                    <button onClick={handleRemoveFile} disabled={isUploading} className="underline font-bold hover:text-amber-950 disabled:opacity-50">
                                        {isUploading ? 'Removendo...' : '🗑️ Remover e voltar ao editor'}
                                    </button>
                                )}
                            </div>
                            <iframe src={translatedPdfUrl} className="w-full flex-1 border-none" title="Tradução Externa" />
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col overflow-hidden">
                            <DocumentEditorContainerComponent
                                id="container"
                                ref={containerRef}
                                height="100%"
                                width="100%"
                                style={{ display: 'block', height: '100%', width: '100%' }}
                                enableToolbar={true}
                                restrictEditing={false}
                                // @ts-ignore
                                created={() => {
                                    setIsEditorReady(true);

                                    if (containerRef.current) {
                                        const editor = containerRef.current.documentEditor;
                                        if (editor && editor.selection && editor.selection.sectionFormat) {
                                            editor.selection.sectionFormat.pageWidth = 612;
                                            editor.selection.sectionFormat.pageHeight = 792;
                                        }
                                    }
                                }}
                            />
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}