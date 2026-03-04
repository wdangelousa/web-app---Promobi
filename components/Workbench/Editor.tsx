'use client';

import React, { useState, useEffect, useRef } from 'react';
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

// Injeção dos módulos necessários do Syncfusion
DocumentEditorContainerComponent.Inject(Toolbar);

// Registro da Chave de Licença (Válida)
registerLicense('Ngo9BigBOggjHTQxAR8/V1JGaF1cXmhKYVJ3WmFZfVhgdl9CYVZRRmY/P1ZhSXxVdkZjXX5adHVVRGNEVU19XEA=');

interface EditorProps {
    content: string; // Por enquanto, ainda recebendo HTML do BD
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
        <div className="flex flex-col h-full bg-gray-100 overflow-hidden font-sans">

            {/* HEADER DE AÇÕES */}
            <div className="bg-white border-b px-4 py-3 flex justify-between items-center shadow-sm z-10 shrink-0">
                <button
                    onClick={() => setShowReference(!showReference)}
                    className="text-sm bg-gray-100 px-3 py-1.5 rounded hover:bg-gray-200 transition flex items-center gap-2"
                >
                    {showReference ? '⬅ Ocultar Original' : '📄 Ver Original'}
                </button>

                <div className="flex items-center gap-3">
                    <button onClick={onSave} className="text-gray-600 hover:text-blue-600 px-3 py-1.5 text-sm font-medium">💾 Salvar</button>

                    <button
                        onClick={onPreviewKit}
                        className="text-indigo-600 bg-indigo-50 border border-indigo-100 px-4 py-1.5 rounded text-sm font-semibold hover:bg-indigo-100 transition"
                    >
                        📦 Preview Kit
                    </button>

                    <button onClick={onApprove} className="bg-green-600 hover:bg-green-500 text-white px-5 py-1.5 rounded text-sm font-bold shadow-sm transition transform hover:scale-105">
                        ✅ Aprovar
                    </button>
                </div>
            </div>

            {/* ÁREA DE TRABALHO: SPLIT VIEW */}
            <div className="flex-1 flex overflow-hidden">

                {/* PDF ORIGINAL */}
                {showReference && (
                    <div className="w-1/2 h-full border-r border-gray-300 bg-slate-800">
                        {pdfUrl ? (
                            <iframe src={pdfUrl} className="w-full h-full border-none" title="Original" />
                        ) : (
                            <div className="flex items-center justify-center h-full text-white/50">PDF não carregado</div>
                        )}
                    </div>
                )}

                {/* MOTOR SYNCFUSION (WORD CLONE) */}
                <div className={`h-full ${showReference ? 'w-1/2' : 'w-full'}`}>
                    <DocumentEditorContainerComponent
                        id="container"
                        ref={containerRef}
                        style={{ 'display': 'block', 'height': '100%', 'width': '100%' }}
                        enableToolbar={true}
                    />
                </div>
            </div>
        </div>
    );
}
