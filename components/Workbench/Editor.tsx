import React, { useState, useEffect } from 'react';
import { Editor as TinyMCEEditor } from '@tinymce/tinymce-react';

import { Loader2 } from 'lucide-react';

interface EditorProps {
    content: string;
    setContent: (content: string) => void;
    pdfUrl?: string;
    onSave?: () => void;
    onPreviewKit?: () => void; // O Preview Kit volta aqui
    isPreviewingKit?: boolean;
    onApprove?: () => void;
}

export default function Editor({ content, setContent, pdfUrl, onSave, onPreviewKit, isPreviewingKit, onApprove }: EditorProps) {

    // Controle do Split View
    const [showReference, setShowReference] = useState(false);

    // Limpeza automática de artefatos da IA
    useEffect(() => {
        if (content && (content.includes('<img') || content.includes('Coat of Arms'))) {
            const cleanContent = content
                .replace(/<img[^>]*>/gi, '')
                .replace(/Coat of Arms of Brazil/gi, '')
                .replace(/Republic of Brazil/gi, 'FEDERATIVE REPUBLIC OF BRAZIL');

            if (cleanContent !== content) setContent(cleanContent);
        }
    }, [content, setContent]);

    return (
        <div className="flex flex-col h-full bg-gray-100 overflow-hidden">

            {/* HEADER / BARRA DE FERRAMENTAS */}
            <div className="bg-white border-b px-4 py-3 flex justify-between items-center shadow-sm shrink-0 z-10">

                {/* Esquerda: Toggle PDF */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowReference(!showReference)}
                        className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                        {showReference ? '⬅ Ocultar Original' : '📄 Ver Original (Split View)'}
                    </button>
                </div>

                {/* Direita: Botões de Ação (Preview Kit Restaurado com Estilo Laranja) */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onSave}
                        className="text-gray-600 hover:text-blue-600 px-3 py-1.5 text-sm font-medium transition border border-transparent hover:border-gray-200 rounded"
                    >
                        💾 Salvar
                    </button>

                    {/* O BOTÃO PREVIEW KIT ESTÁ AQUI - ESTILO LARANJA CONFORME SOLICITADO */}
                    <button
                        onClick={onPreviewKit}
                        disabled={isPreviewingKit}
                        className="bg-[#f58220] hover:bg-[#e67610] disabled:bg-orange-300 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center gap-2"
                    >
                        {isPreviewingKit ? <Loader2 className="h-4 w-4 animate-spin" /> : '📦'} {isPreviewingKit ? 'Gerando...' : 'Preview Kit'}
                    </button>

                    <button
                        onClick={onApprove}
                        className="bg-green-600 hover:bg-green-500 text-white px-5 py-1.5 rounded-md text-sm font-bold shadow-sm transition transform hover:scale-105"
                    >
                        ✅ Aprovar
                    </button>
                </div>
            </div>

            {/* ÁREA DE EDIÇÃO */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* Painel Esquerdo: PDF */}
                {showReference && (
                    <div className="w-1/2 h-full border-r border-gray-300 bg-slate-800 flex justify-center overflow-y-auto relative">
                        {pdfUrl ? (
                            <iframe src={pdfUrl} className="w-full h-full border-none" title="Original" />
                        ) : (
                            <div className="flex items-center justify-center h-full text-white/50">PDF não carregado</div>
                        )}
                    </div>
                )}

                {/* Painel Direito: TinyMCE com API KEY e FLAGS DE BLOQUEIO DE BANNER */}
                <div className={`h-full bg-[#F3F4F6] transition-all duration-300 ${showReference ? 'w-1/2' : 'w-full'}`}>
                    <TinyMCEEditor
                        apiKey="82ofpgepw5tsxa9oqyjs2vmkgc65souf4227m6sikgnxq5jz"
                        value={content}
                        onEditorChange={(newValue) => setContent(newValue)}
                        init={{
                            height: '100%',
                            menubar: false,
                            statusbar: true,
                            branding: false,
                            promotion: false,
                            elementpath: false,
                            plugins: [
                                'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                                'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                                'insertdatetime', 'media', 'table', 'help', 'wordcount', 'pagebreak'
                            ],
                            toolbar: 'undo redo | blocks | ' +
                                'bold italic forecolor | alignleft aligncenter ' +
                                'alignright alignjustify | bullist numlist outdent indent | ' +
                                'pagebreak table | removeformat | help',
                            content_style: `
                body { 
                  font-family: 'Times New Roman', serif; 
                  font-size: 12pt; 
                  line-height: 1.6;
                  background-color: #F3F4F6;
                  padding: 40px 0;
                }
                .mce-content-body {
                  background-color: white;
                  width: 8.5in;
                  min-height: 11in;
                  margin: 0 auto;
                  padding: 1in;
                  box-sizing: border-box;
                  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                  /* Visual Page Separator every 11 inches */
                  background-image: repeating-linear-gradient(
                    to bottom,
                    transparent,
                    transparent 10.98in,
                    #cbd5e1 10.98in,
                    #cbd5e1 11in
                  );
                }
                @media (max-width: 1000px) {
                  .mce-content-body { width: 95%; padding: 0.5in; }
                }
              `
                        }}
                    />
                </div>

            </div>
        </div>
    );
}
