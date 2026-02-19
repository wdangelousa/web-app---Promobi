'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Save, Send, FileText, CheckCircle, AlertTriangle } from 'lucide-react'
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
        if (!confirm("Isso irá gerar o PDF final e enviar ao cliente. Confirmar?")) return;

        setSaving(true);

        try {
            // 1. Generate PDF (Client-Side for simplicity with formatted text)
            // We use dynamic import for jspdf to avoid SSR issues if package is not already imported
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF();

            // --- PAGE 1: COVER SHEET ---
            doc.setFontSize(22);
            doc.setTextColor(245, 130, 32); // Promobi Orange
            doc.text("Promobi Services", 105, 40, { align: "center" });

            doc.setFontSize(16);
            doc.setTextColor(0, 0, 0);
            doc.text("Tradução Certificada", 105, 60, { align: "center" });

            doc.setFontSize(12);
            doc.text(`Pedido #${order.id}`, 105, 80, { align: "center" });
            doc.text(`Cliente: ${order.user.fullName || 'Cliente'}`, 105, 90, { align: "center" });
            doc.text(`Data: ${new Date().toLocaleDateString()}`, 105, 100, { align: "center" });

            doc.setLineWidth(0.5);
            doc.line(40, 110, 170, 110);

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text("Este documento contém uma tradução certificada e notarizada", 105, 120, { align: "center" });
            doc.text("em conformidade com as normas do USCIS e do Estado da Flórida.", 105, 125, { align: "center" });

            // --- PAGE 2: TRANSLATION ---
            doc.addPage();
            doc.setFontSize(12);
            doc.setTextColor(0);

            // Simple text stripping for now, or use html method if available and robust
            // For this draft, we just place the text. Ideally we use doc.html() but it requires canvas.
            // We'll use splitTextToSize for basic text wrapping of the raw text content if pure text, 
            // or we try to strip HTML tags for a clean text version.
            const plainText = editorContent.replace(/<[^>]+>/g, '\n').trim();
            const splitText = doc.splitTextToSize(plainText, 180);
            doc.text(splitText, 15, 20);

            // --- PAGE 3: CERTIFICATE OF ACCURACY ---
            doc.addPage();
            doc.setFontSize(18);
            doc.text("Certificate of Accuracy", 105, 40, { align: "center" });

            doc.setFontSize(11);
            doc.text("I, Certified Translator, hereby declare that I am fluent in English and Portuguese,", 20, 60);
            doc.text("and that the attached document is a true, accurate and complete translation", 20, 70);
            doc.text("of the original document provided.", 20, 80);

            doc.text("_________________________", 20, 120);
            doc.text("Translator Signature", 20, 130);

            doc.text("Notary Public Seal:", 20, 160);
            doc.rect(20, 170, 60, 60); // Placeholder for stamp

            // 2. Upload PDF
            const pdfBlob = doc.output('blob');
            const file = new File([pdfBlob], `certified_order_${order.id}.pdf`, { type: 'application/pdf' });

            const formData = new FormData();
            formData.append('file', file);
            formData.append('orderId', order.id.toString());

            // Dynamic import actions to act as client-side usable functions (via the bridge)
            // Note: In Next.js App Router, we can import server actions directly.
            const { uploadDelivery } = await import('../../../../actions/uploadDelivery');
            const { sendDelivery } = await import('../../../../actions/sendDelivery');

            const uploadResult = await uploadDelivery(formData);

            if (!uploadResult.success) {
                throw new Error("Falha no upload: " + uploadResult.error);
            }

            // 3. Send Email & Finalize
            const sendResult = await sendDelivery(order.id);

            if (!sendResult.success) {
                throw new Error("Falha no envio: " + sendResult.error);
            }

            alert("Sucesso! Pedido finalizado e enviado ao cliente.");
            window.location.reload();

        } catch (error) {
            console.error(error);
            alert("Erro ao finalizar: " + error);
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
