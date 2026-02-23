'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Save, Send, FileText, CheckCircle, AlertTriangle } from 'lucide-react'
import ManualApprovalButton from './ManualApprovalButton'
import 'react-quill-new/dist/quill.snow.css'

// Dynamic import for ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

type Document = {
    id: number
    docType: string
    originalFileUrl: string
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
    const [selectedDocId, setSelectedDocId] = useState<number | null>(order.documents[0]?.id || null)
    const [editorContent, setEditorContent] = useState('')
    const [saving, setSaving] = useState(false)

    const selectedDoc = order.documents.find(d => d.id === selectedDocId)

    useEffect(() => {
        if (selectedDoc) {
            setEditorContent(selectedDoc.translatedText || '<p>Aguardando tradução...</p>')
        }
    }, [selectedDocId, selectedDoc])

    const handleSave = async () => {
        if (!selectedDoc) return;
        setSaving(true);
        // Call server action to save text
        // For now logging
        console.log("Saving content for doc", selectedDoc.id, editorContent);

        // TODO: Implement save action

        setTimeout(() => {
            setSaving(false);
            alert('Rascunho salvo!');
        }, 1000);
    }

    const handleFinalize = async () => {
        if (!selectedDoc) return;
        if (!confirm("Isso irá gerar o Kit de Entrega final (PDF Flat) nos servidores e marcará como concluído. Confirmar?")) return;

        setSaving(true);

        try {
            // Server-Side Delivery Kit Generator
            const { generateDeliveryKit } = await import('../../../../actions/generateDeliveryKit');
            const result = await generateDeliveryKit(order.id);

            if (!result.success || !result.deliveryUrl) {
                throw new Error(result.error || "Falha ao gerar o Delivery Kit.");
            }

            // After Kit is generated and uploaded, we can trigger the email notification
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

    return (
        <div className="h-[calc(100vh-80px)] flex">
            {/* LEFT: PDF Viewer */}
            <div className="w-1/2 bg-gray-800 border-r border-gray-700 flex flex-col">
                <div className="bg-gray-900 text-white p-2 flex justify-between items-center text-xs">
                    <span className="font-bold flex items-center gap-2">
                        <FileText className="h-4 w-4" /> Visualizador Original
                    </span>
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
                <div className="flex-1 bg-gray-500 relative">
                    {/* IFRAME for PDF viewing. Assuming URL is valid for iframe. */}
                    {/* Use Google Docs Viewer for broader compatibility if simple iframe fails, or standard browser PDF viewer */}
                    {selectedDoc.originalFileUrl !== 'PENDING_UPLOAD' ? (
                        <iframe
                            src={selectedDoc.originalFileUrl}
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
