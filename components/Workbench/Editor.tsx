import React, { useState, useEffect } from 'react';
import { Editor as TinyMCEEditor } from '@tinymce/tinymce-react';

// Interface das props (ajuste conforme seu projeto)
interface EditorProps {
    content: string;
    setContent: (content: string) => void;
    pdfUrl?: string; // URL do PDF original
    onSave?: () => void;
    onPreviewKit?: () => void; // Função para gerar o kit
    onApprove?: () => void;
}

export default function Editor({ content, setContent, pdfUrl, onSave, onPreviewKit, onApprove }: EditorProps) {

    // Controle do Split View (Começa oculto para foco, ou true se preferir)
    const [showReference, setShowReference] = useState(false);

    // 1. SANITIZER: Limpeza automática de artefatos da IA
    useEffect(() => {
        if (content && (content.includes('<img') || content.includes('Coat of Arms'))) {
            const cleanContent = content
                .replace(/<img[^>]*>/gi, '') // Remove imagens quebradas
                .replace(/Coat of Arms of Brazil/gi, '') // Remove legendas
                .replace(/Republic of Brazil/gi, 'FEDERATIVE REPUBLIC OF BRAZIL');

            if (cleanContent !== content) setContent(cleanContent);
        }
    }, [content, setContent]);

    return (
        <div className="flex flex-col h-full bg-gray-100 overflow-hidden">

            {/* BARRA DE FERRAMENTAS SUPERIOR */}
            <div className="bg-white border-b px-4 py-3 flex justify-between items-center shadow-sm shrink-0 z-10">

                {/* Lado Esquerdo: Controle de Visualização */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowReference(!showReference)}
                        className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                        {showReference ? '⬅ Ocultar Original' : '📄 Ver Original (Split View)'}
                    </button>
                </div>

                {/* Lado Direito: Ações Principais */}
                <div className="flex items-center gap-3">
                    {/* Botão Salvar Rápido */}
                    <button onClick={onSave} className="text-gray-600 hover:text-blue-600 px-3 py-1.5 text-sm font-medium transition">
                        💾 Salvar
                    </button>

                    {/* BOTÃO RESTAURADO: PREVIEW KIT */}
                    <button
                        onClick={onPreviewKit}
                        className="text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-4 py-1.5 rounded-md text-sm font-semibold transition flex items-center gap-2"
                    >
                        📦 Preview Kit
                    </button>

                    {/* Botão Aprovar */}
                    <button
                        onClick={onApprove}
                        className="bg-green-600 hover:bg-green-500 text-white px-5 py-1.5 rounded-md text-sm font-bold shadow-sm transition"
                    >
                        ✅ Aprovar
                    </button>
                </div>
            </div>

            {/* ÁREA DE TRABALHO (SPLIT VIEW) */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* COLUNA ESQUERDA: PDF ORIGINAL */}
                {showReference && (
                    <div className="w-1/2 h-full border-r border-gray-300 bg-slate-800 flex justify-center overflow-y-auto animate-in slide-in-from-left duration-200">
                        {pdfUrl ? (
                            // Ajuste o width/height conforme necessário para seu visualizador de PDF
                            <iframe src={pdfUrl} className="w-full h-full" title="Original" />
                        ) : (
                            <div className="text-white mt-10">Documento original não disponível</div>
                        )}
                    </div>
                )}

                {/* COLUNA DIREITA: EDITOR TINYMCE */}
                <div className={`h-full bg-[#F3F4F6] transition-all duration-300 ${showReference ? 'w-1/2' : 'w-full'}`}>
                    <TinyMCEEditor
                        apiKey="82ofpgepw5tsxa9oqyjs2vmkgc65souf4227m6sikgnxq5jz"
                        value={content}
                        onEditorChange={(newValue) => setContent(newValue)}
                        init={{
                            height: '100%',
                            menubar: true,
                            statusbar: false,
                            plugins: [
                                'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                                'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                                'insertdatetime', 'media', 'table', 'help', 'wordcount'
                            ],
                            toolbar: 'undo redo | blocks | ' +
                                'bold italic forecolor | alignleft aligncenter ' +
                                'alignright alignjustify | bullist numlist outdent indent | ' +
                                'table | removeformat | help',
                            content_style: `
                body { 
                  font-family: 'Times New Roman', serif; 
                  font-size: 12pt; 
                  line-height: 1.6;
                  background-color: #F3F4F6;
                  padding: 40px 0;
                }
                /* A Folha de Papel US Letter */
                .mce-content-body {
                  background-color: white;
                  width: 8.5in;
                  min-height: 11in;
                  margin: 0 auto;
                  padding: 1in;
                  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                }
                /* Ajuste responsivo para split view */
                @media (max-width: 1000px) {
                  .mce-content-body { width: 95%; padding: 0.5in; }
                }
              `,
                        }}
                    />
                </div>

            </div>
        </div>
    );
}
