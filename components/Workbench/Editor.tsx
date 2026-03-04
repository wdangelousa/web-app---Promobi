import React, { useState, useRef } from 'react';
import {
    DocumentEditorContainerComponent,
    Toolbar
} from '@syncfusion/ej2-react-documenteditor';
import { registerLicense } from '@syncfusion/ej2-base';

import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-popups/styles/material.css';
import '@syncfusion/ej2-lists/styles/material.css';
import '@syncfusion/ej2-navigations/styles/material.css';
import '@syncfusion/ej2-splitbuttons/styles/material.css';
import '@syncfusion/ej2-dropdowns/styles/material.css';
import '@syncfusion/ej2-react-documenteditor/styles/material.css';

// Injeção dos módulos do Syncfusion
DocumentEditorContainerComponent.Inject(Toolbar);

// Registro da Chave de Licença (7 Dias)
registerLicense('Ngo9BigBOggjHTQxAR8/V1JGaF1cXmhKYVJ3WmFZfVhgdl9CYVZRRmY/P1ZhSXxVdkZjXX5adHVVRGNEVU19XEA=');

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

    return (
        // Contêiner principal travado na altura total (h-full)
        <div className="flex-1 flex flex-col h-full bg-gray-100 overflow-hidden font-sans w-full min-w-0">

            {/* HEADER DE AÇÕES: Fixo e incompressível (shrink-0) */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shadow-sm z-50 shrink-0 w-full min-w-0 min-h-[60px]">

                {/* Lado Esquerdo */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowReference(!showReference)}
                        className="text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                        {showReference ? '⬅ Ocultar Documento Original' : '📄 Ver Documento Original'}
                    </button>
                </div>

                {/* Lado Direito: Nossos Botões Promobi */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={onSave}
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

            {/* ÁREA DE TRABALHO: SPLIT VIEW (Ocupa o restante da tela: flex-1) */}
            <div className="flex-1 flex overflow-hidden relative w-full bg-gray-200">

                {/* Painel do PDF ORIGINAL */}
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

                {/* Painel do SYNCFUSION */}
                <div className={`h-full relative overflow-hidden bg-white min-w-0 ${showReference ? 'w-1/2' : 'w-full'}`}>
                    {/* O componente precisa de um wrapper absoluto para não quebrar o flexbox */}
                    <div className="absolute inset-0 min-w-0 overflow-hidden">
                        <DocumentEditorContainerComponent
                            id="container"
                            ref={containerRef}
                            height="100%"
                            width="100%"
                            style={{ 'display': 'block' }}
                            enableToolbar={true}
                            created={() => {
                                // Configura folha padrão para US Letter (8.5 x 11 polegadas -> 612 x 792 points)
                                if (containerRef.current) {
                                    const editor = containerRef.current.documentEditor;
                                    // A4 padrão = 595.3 x 841.9 pt. Letter = 612 x 792 pt
                                    editor.selection.sectionFormat.pageWidth = 612;
                                    editor.selection.sectionFormat.pageHeight = 792;
                                }
                            }}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}
