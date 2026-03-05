import React, { useState, useEffect, useRef } from 'react';
import {
    DocumentEditorContainerComponent,
    Toolbar
} from '@syncfusion/ej2-react-documenteditor';
import { registerLicense } from '@syncfusion/ej2-base';

// Injeção dos módulos
DocumentEditorContainerComponent.Inject(Toolbar);

// Registro da Chave de Licença
registerLicense('Ngo9BigBOggjHTQxAR8/V1JGaF1cXmhKYVJ3WmFZfVhgdl9CYVZRRmY/P1ZhSXxVdkZjXX5adHVVRGNEVU19XEA=');

interface EditorProps {
    content: string;
    setContent: (content: string) => void;
    pdfUrl?: string;
    onSave?: () => void;
    onPreviewKit?: () => void;
    onApprove?: () => void;
}

export default function Editor({ content, setContent, pdfUrl, onSave, onPreviewKit, onApprove }: EditorProps) {
    const [showReference, setShowReference] = useState(false);
    const containerRef = useRef<DocumentEditorContainerComponent>(null);
    const lastInjectedContent = useRef("");

    useEffect(() => {
        import('@syncfusion/ej2-base/styles/material.css');
        import('@syncfusion/ej2-buttons/styles/material.css');
        import('@syncfusion/ej2-inputs/styles/material.css');
        import('@syncfusion/ej2-popups/styles/material.css');
        import('@syncfusion/ej2-lists/styles/material.css');
        import('@syncfusion/ej2-navigations/styles/material.css');
        import('@syncfusion/ej2-splitbuttons/styles/material.css');
        import('@syncfusion/ej2-dropdowns/styles/material.css');
        import('@syncfusion/ej2-react-documenteditor/styles/material.css');
    }, []);

    // 🚀 PONTE DA IA E DO BANCO DE DADOS (Leitura Dupla)
    useEffect(() => {
        if (content && containerRef.current && content !== lastInjectedContent.current) {
            setTimeout(() => {
                if (containerRef.current) {
                    const docEditor = containerRef.current.documentEditor;
                    if (docEditor) {
                        try {
                            // Checa se o conteúdo é SFDT (Documento com formatação salva do banco)
                            if (content.trim().startsWith('{') && content.includes('"sections"')) {
                                docEditor.open(content);
                            } else {
                                // Se for HTML (da IA Azure/Gemini ou traduções antigas)
                                docEditor.selection.selectAll();
                                docEditor.editor.insertHtml(content);
                            }
                            lastInjectedContent.current = content;
                        } catch (error) {
                            console.error("Erro ao carregar conteúdo no Syncfusion:", error);
                        }
                    }
                }
            }, 600);
        }
    }, [content]);

    // 💾 INTERCEPTADOR DE SALVAMENTO (Exporta Formatação Nativa)
    const handleSaveClick = () => {
        if (containerRef.current) {
            const docEditor = containerRef.current.documentEditor;

            // Extrai o documento preservando 100% da formatação como JSON (SFDT)
            const sfdt = docEditor.serialize();

            // Atualiza o estado para enviar ao banco
            setContent(sfdt);
            lastInjectedContent.current = sfdt; // Previne recarregamento infinito

            // Executa a função do pai (onSave) após um leve delay para garantir atualização do estado
            if (onSave) {
                setTimeout(() => onSave(), 150);
            }
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

                    {/* BOTÃO SALVAR AGORA USA O NOSSO INTERCEPTADOR */}
                    <button
                        onClick={handleSaveClick}
                        className="text-gray-600 hover:text-blue-600 px-4 py-2 text-sm font-semibold transition border border-transparent hover:border-gray-200 rounded"
                    >
                        💾 Salvar
                    </button>

                    <button
                        onClick={onPreviewKit}
                        className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-5 py-2 rounded-md text-sm font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2 shadow-sm"
                    >
                        📦 Preview Kit
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

                <div className={`h-full relative overflow-hidden bg-white ${showReference ? 'w-1/2' : 'w-full'}`}>
                    <div className="absolute inset-0">
                        <DocumentEditorContainerComponent
                            id="container"
                            ref={containerRef}
                            style={{ 'display': 'block', 'height': '100%', 'width': '100%' }}
                            enableToolbar={true}
                            enableWordExport={true}
                            enableSfdtExport={true}
                            enableEditor={true}
                            enableSelection={true}
                            enableOptionsPane={true}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}
