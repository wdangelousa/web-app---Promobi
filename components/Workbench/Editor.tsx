import React, { useState, useEffect, useRef } from 'react';
import {
    DocumentEditorContainerComponent,
    Toolbar,
    Editor as SyncfusionEditor
} from '@syncfusion/ej2-react-documenteditor';
import { registerLicense } from '@syncfusion/ej2-base';

// ── Estilos nativos do Syncfusion (imports estáticos, obrigatórios) ──────────
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-popups/styles/material.css';
import '@syncfusion/ej2-lists/styles/material.css';
import '@syncfusion/ej2-navigations/styles/material.css';
import '@syncfusion/ej2-splitbuttons/styles/material.css';
import '@syncfusion/ej2-dropdowns/styles/material.css';
import '@syncfusion/ej2-react-documenteditor/styles/material.css';

// ── Injeção dos módulos ───────────────────────────────────────────────────────
DocumentEditorContainerComponent.Inject(Toolbar, SyncfusionEditor);

// ── Registro da Chave de Licença ──────────────────────────────────────────────
registerLicense('Ngo9BigBOggjHTQxAR8/V1JGaF1cXmhKYVJ3WmFZfVhgdl9CYVZRRmY/P1ZhSXxVdkZjXX5adHVVRGNEVU19XEA=');

// ── Props ─────────────────────────────────────────────────────────────────────
interface EditorProps {
    content: string;
    setContent: (content: string) => void;
    pdfUrl?: string;
    onSave?: () => void;
    onPreviewKit?: () => void;
    onApprove?: () => void;
    isPreviewingKit?: boolean;
}

export default function Editor({ content, setContent, pdfUrl, onSave, onPreviewKit, onApprove, isPreviewingKit }: EditorProps) {
    const [showReference, setShowReference] = useState(false);
    const containerRef = useRef<DocumentEditorContainerComponent>(null);
    const lastInjectedContent = useRef('');

    // 🚀 PONTE DA IA E DO BANCO DE DADOS (Leitura Dupla)
    useEffect(() => {
        if (!content || !containerRef.current) return;
        if (content === lastInjectedContent.current) return;

        // Atraso de segurança para garantir que o Canvas do Syncfusion foi renderizado
        const timer = setTimeout(() => {
            const docEditor = containerRef.current?.documentEditor;
            if (!docEditor) return;

            try {
                // Força a liberação do editor
                docEditor.isReadOnly = false;

                if (content.trim().startsWith('{') && content.includes('"sections"')) {
                    // Já é um arquivo SFDT (formato do Syncfusion salvo no banco), abre direto
                    docEditor.open(content);
                    lastInjectedContent.current = content;
                } else {
                    // É um arquivo HTML! (Vindo da IA Gemini ou legado do TinyMCE)

                    // 1. Em vez de usar open() (que é assíncrono e estava apagando o texto),
                    // nós selecionamos o texto inteiro e apagamos (método síncrono e 100% seguro)
                    docEditor.selection.selectAll();
                    if (docEditor.editor) {
                        docEditor.editor.insertText(''); // Limpa o quadro em branco
                    }

                    // 2. Garante o envelope HTML necessário para o parser não rejeitar
                    let safeHtml = content;
                    if (!safeHtml.toLowerCase().includes('<body')) {
                        safeHtml = `<html><body>${safeHtml}</body></html>`;
                    }

                    // 3. Injeta o HTML e volta o cursor para o começo do texto
                    if (docEditor.editor) {
                        // @ts-expect-error - SDK mismatch for React vs Core
                        docEditor.editor.insertHtml(safeHtml);
                        docEditor.selection.moveToDocumentStart();
                        lastInjectedContent.current = content;
                    } else {
                        console.error("Módulo Editor do Syncfusion indisponível.");
                    }
                }
            } catch (error) {
                console.error('Erro Crítico ao processar conteúdo no Syncfusion:', error);
            }
        }, 400); // 400ms para estabilização do DOM do React junto com o Syncfusion

        return () => clearTimeout(timer);
    }, [content]);

    // 💾 INTERCEPTADOR DE SALVAMENTO (Exporta a tradução da IA ou nativa como SFDT)
    const handleSaveClick = () => {
        if (!containerRef.current) return;
        const docEditor = containerRef.current.documentEditor;
        if (!docEditor) return;

        const sfdt = docEditor.serialize();
        setContent(sfdt);
        lastInjectedContent.current = sfdt;

        if (onSave) {
            setTimeout(() => onSave(), 150);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-100 overflow-hidden font-sans w-full">

            {/* HEADER DE AÇÕES */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shadow-sm z-50 shrink-0 w-full min-h-[60px]">

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowReference(!showReference)}
                        className="text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                        {showReference ? '⬅ Ocultar Documento Original' : '📄 Ver Documento Original'}
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSaveClick}
                        className="text-gray-600 hover:text-blue-600 px-4 py-2 text-sm font-semibold transition border border-transparent hover:border-gray-200 rounded"
                    >
                        💾 Salvar
                    </button>

                    <button
                        onClick={onPreviewKit}
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

            {/* ÁREA DE TRABALHO: SPLIT VIEW */}
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
                                // Configuração de folha A4 / US Letter e zoom ao criar
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
                </div>

            </div>
        </div>
    );
}