import React, { useState, useEffect } from 'react';
import { Editor as TinyMCEEditor } from '@tinymce/tinymce-react';

// Ajuste a interface de props conforme a necessidade do seu projeto
interface EditorProps {
    content: string;
    setContent: (content: string) => void;
    pdfUrl?: string; // URL do PDF original para comparação
    onSave?: () => void;
    onPreviewKit?: () => void; // Função do botão Preview Kit
    onApprove?: () => void;
}

export default function Editor({ content, setContent, pdfUrl, onSave, onPreviewKit, onApprove }: EditorProps) {

    // Controle do Split View (Começa false para dar foco, ou true se preferir ver o PDF logo de cara)
    const [showReference, setShowReference] = useState(false);

    // 1. SANITIZER: Limpeza automática de artefatos da IA (Imagens quebradas)
    useEffect(() => {
        if (content && (content.includes('<img') || content.includes('Coat of Arms'))) {
            const cleanContent = content
                .replace(/<img[^>]*>/gi, '') // Remove tags de imagem quebradas
                .replace(/Coat of Arms of Brazil/gi, '') // Remove legendas perdidas
                .replace(/Republic of Brazil/gi, 'FEDERATIVE REPUBLIC OF BRAZIL');

            if (cleanContent !== content) setContent(cleanContent);
        }
    }, [content, setContent]);

    return (
        <div className="flex flex-col h-full bg-gray-100 overflow-hidden">

            {/* BARRA DE FERRAMENTAS SUPERIOR */}
            <div className="bg-white border-b px-4 py-3 flex justify-between items-center shadow-sm shrink-0 z-10">

                {/* Lado Esquerdo: Controle de Visualização do PDF */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowReference(!showReference)}
                        className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                        {showReference ? '⬅ Ocultar Original' : '📄 Ver Original (Split View)'}
                    </button>
                </div>

                {/* Lado Direito: Ações Principais (Botões Restaurados) */}
                <div className="flex items-center gap-3">
                    {/* Salvar */}
                    <button
                        onClick={onSave}
                        className="text-gray-600 hover:text-blue-600 px-3 py-1.5 text-sm font-medium transition border border-transparent hover:border-gray-200 rounded"
                    >
                        💾 Salvar
                    </button>

                    {/* BOTÃO RESTAURADO: PREVIEW KIT */}
                    <button
                        onClick={onPreviewKit}
                        className="text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-4 py-1.5 rounded-md text-sm font-semibold transition flex items-center gap-2"
                    >
                        📦 Preview Kit
                    </button>

                    {/* Aprovar */}
                    <button
                        onClick={onApprove}
                        className="bg-green-600 hover:bg-green-500 text-white px-5 py-1.5 rounded-md text-sm font-bold shadow-sm transition transform hover:scale-105"
                    >
                        ✅ Aprovar
                    </button>
                </div>
            </div>

            {/* ÁREA DE TRABALHO (SPLIT VIEW) */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* COLUNA ESQUERDA: PDF ORIGINAL (Aparece ao clicar em "Ver Original") */}
                {showReference && (
                    <div className="w-1/2 h-full border-r border-gray-300 bg-slate-800 flex justify-center overflow-y-auto animate-in slide-in-from-left duration-200 relative">
                        {pdfUrl ? (
                            <iframe src={pdfUrl} className="w-full h-full border-none" title="Original" />
                        ) : (
                            <div className="flex items-center justify-center h-full text-white/50">
                                PDF Original não carregado
                            </div>
                        )}
                    </div>
                )}

                {/* COLUNA DIREITA: EDITOR TINYMCE (Com a Key Ativa) */}
                <div className={`h-full bg-[#F3F4F6] transition-all duration-300 ${showReference ? 'w-1/2' : 'w-full'}`}>
                    <TinyMCEEditor
                        apiKey="82ofpgepw5tsxa9oqyjs2vmkgc65souf4227m6sikgnxq5jz"
                        value={content}
                        onEditorChange={(newValue) => setContent(newValue)}
                        init={{
                            height: '100%',
                            menubar: true, // Menus estilo Word (File, Edit, View...)
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
                  background-color: #F3F4F6; /* Fundo Cinza da Mesa */
                  padding: 40px 0;
                }
                /* A Folha de Papel US Letter */
                .mce-content-body {
                  background-color: white;
                  width: 8.5in;         /* Largura Carta */
                  min-height: 11in;     /* Altura Carta */
                  margin: 0 auto;       /* Centralizar */
                  padding: 1in;         /* Margens de 1 polegada */
                  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                }
                /* Responsividade para quando dividir a tela */
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
