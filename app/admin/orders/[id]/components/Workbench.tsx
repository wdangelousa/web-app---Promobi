'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Save, FileText, CheckCircle, Eye, Loader2, Zap } from 'lucide-react'
import ManualApprovalButton from './ManualApprovalButton'
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
}

type Order = {
    id: number
    status: string
    documents: Document[]
    user: {
        fullName: string
        email: string
    }
}

export default function Workbench({ order }: { order: Order }) {
    const router = useRouter()
    const [selectedDocId, setSelectedDocId] = useState<number | null>(order.documents[0]?.id || null)
    const [editorContent, setEditorContent] = useState('')
    const [saving, setSaving] = useState(false)
    const [isTranslating, setIsTranslating] = useState(false)

    const selectedDoc = order.documents.find(d => d.id === selectedDocId)

    // 🛡️ CORREÇÕES DO CLAUDE: Refs para evitar que o router.refresh apague a tradução
    const justTranslatedRef = useRef<string | null>(null)
    const prevDocIdRef = useRef<number | null>(null)

    useEffect(() => {
        if (!selectedDoc) return;

        // Verifica se o usuário trocou de documento no dropdown
        const isNewDoc = prevDocIdRef.current !== selectedDoc.id;
        prevDocIdRef.current = selectedDoc.id;

        if (isNewDoc) {
            // Se trocou de aba, limpa o cache de segurança e carrega o texto do banco
            justTranslatedRef.current = null;
            setEditorContent(selectedDoc.translatedText || '<p>Aguardando tradução...</p>');
        } else {
            // Se for o mesmo documento (ex: tela recarregou por causa do router.refresh)
            if (justTranslatedRef.current) {
                // Mantém o texto fresco da IA na tela! Não deixa apagar.
                setEditorContent(justTranslatedRef.current);
            } else {
                setEditorContent(selectedDoc.translatedText || '<p>Aguardando tradução...</p>');
            }
        }
    }, [selectedDocId, selectedDoc?.translatedText, selectedDoc?.id])

    const handleSave = async () => {
        if (!selectedDoc) return;
        setSaving(true);
        // Exemplo de salvamento (você conectará com sua action de salvar rascunho depois)
        console.log("Saving content for doc", selectedDoc.id, editorContent);

        setTimeout(() => {
            setSaving(false);
            alert('Rascunho salvo!');
            router.refresh();
        }, 1000);
    }

    const handleTranslateAI = async () => {
        if (!selectedDoc) return;
        setIsTranslating(true);

        try {
            const { generateTranslationDraft } = await import('../../../../actions/generateTranslation');
            const result = await generateTranslationDraft(order.id);

            // Tenta pegar o texto tanto de result.text quanto de result.translatedText (depende de como sua API retorna)
            const newText = result.text || result.translatedText;

            if (result.success && newText) {
                // 🛡️ CORREÇÃO 1: Salva no "Cofre" (ref) antes de recarregar a página
                justTranslatedRef.current = newText;

                // 🛡️ CORREÇÃO 2: Atualiza a tela NA HORA
                setEditorContent(newText);

                alert('Tradução concluída com sucesso!');

                // Sincroniza o servidor no fundo sem piscar a tela
                router.refresh();
            } else {
                alert('Erro na tradução: ' + (result.error || 'Sem texto retornado.'));
            }
        } catch (error: any) {
            console.error(error);
            alert("Erro ao acionar IA: " + error.message);
        } finally {
            setIsTranslating(false);
        }
    }

    const handleFinalize = async () => {
        if (!selectedDoc) return;
        if (!confirm("Isso irá gerar o Kit de Entrega final (PDF Flat) nos servidores e marcará como concluído. Confirmar?")) return;

        setSaving(true);

        try {
            const { generateDeliveryKit } = await import('../../../../actions/generateDeliveryKit');
            const result = await generateDeliveryKit(order.id);

            if (!result.success || !result.deliveryUrl) {
                throw new Error(result.error || "Falha ao gerar o Delivery Kit.");
            }

            const { sendDelivery } = await import('../../../../actions/sendDelivery');
            const sendResult = await sendDelivery(order.id);

            if (!sendResult.success) {
                throw new Error("Kit Gerado, mas falha no envio do email: " + sendResult.error);
            }

            alert("Sucesso! O Pedido foi certificado e enviado ao cliente.");
            window.location.reload();

        } catch (error: any) {
            console.error(error);
            alert("Erro ao finalizar: " + error.message);
        } finally {
            setSaving(false);
        }
    }

    if (!selectedDoc) return <div>Nenhum documento encontrado.</div>

    // 🛡️ CORREÇÃO 4: Define qual URL de PDF vai aparecer na tela
    const viewUrl = selectedDoc.translatedFileUrl || selectedDoc.originalFileUrl;

    return (
        <div className="h-[calc(100vh-80px)] flex">
            {/* LEFT: PDF Viewer */}
            <div className="w-1/2 bg-gray-800 border-r border-gray-700 flex flex-col">
                <div className="bg-gray-900 text-white p-2 flex justify-between items-center text-xs">
                    <span className="font-bold flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {selectedDoc.translatedFileUrl ? 'Visualizador PDF Traduzido (DeepL)' : 'Visualizador Original'}
                    </span>
                    <div className="flex items-center gap-3">
                        {/* Link externo para abrir o PDF traduzido da DeepL caso o iframe falhe */}
                        {selectedDoc.translatedFileUrl && (
                            <a href={selectedDoc.translatedFileUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1">
                                <Eye className="w-3 h-3" /> Abrir PDF ↗
                            </a>
                        )}
                        <select
                            value={selectedDocId || ''}
                            onChange={(e) => setSelectedDocId(Number(e.target.value))}
                            className="bg-gray-700 border border-gray-600 rounded px-2 py-1"
                        >
                            {order.documents.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.exactNameOnDoc || d.docType}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex-1 bg-gray-500 relative">
                    {viewUrl && viewUrl !== 'PENDING_UPLOAD' ? (
                        <iframe
                            key={viewUrl} // 🛡️ CORREÇÃO 4: Força o Iframe a recarregar quando a URL muda
                            src={viewUrl}
                            className="w-full h-full"
                            title="PDF Viewer"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-white">Arquivo pendente de upload</div>
                    )}
                </div>
            </div>

            {/* RIGHT: Editor */}
            <div className="w-1/2 flex flex-col bg-white">
                <div className="border-b border-gray-200 p-2 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" /> Editor de Tradução
                    </h3>
                    <div className="flex gap-2">
                        {(order.status === 'PENDING' || order.status === 'PENDING_PAYMENT') && (
                            <ManualApprovalButton orderId={order.id} />
                        )}

                        <button
                            onClick={handleTranslateAI}
                            disabled={isTranslating}
                            className="bg-purple-100 border border-purple-300 text-purple-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-200 flex items-center gap-1 transition-colors"
                        >
                            {isTranslating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                            {isTranslating ? 'Traduzindo...' : 'Traduzir com IA'}
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-100 flex items-center gap-1"
                        >
                            <Save className="h-3 w-3" /> {saving ? 'Salvando...' : 'Salvar Rascunho'}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <ReactQuill
                        theme="snow"
                        value={editorContent}
                        onChange={setEditorContent}
                        className="h-full"
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

                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
                    <button
                        onClick={handleFinalize}
                        className="bg-[#f58220] hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2"
                    >
                        <CheckCircle className="h-4 w-4" /> Certificar e Enviar ao Cliente
                    </button>
                </div>
            </div>
        </div>
    )
}