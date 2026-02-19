'use client';

import { useState } from 'react';
import { CheckCircle, AlertTriangle, FileText, ChevronRight, Download, MessageSquare } from 'lucide-react';
import { approveTranslation, requestAdjustment } from '@/app/actions/reviewOrder';

interface Document {
    id: number;
    docType: string;
    originalFileUrl: string;
    translatedText: string | null;
    translatedFileUrl: string | null;
}

interface Order {
    id: number;
    status: string;
    documents: Document[];
}

export default function ReviewInterface({ order }: { order: Order }) {
    const [selectedDocIndex, setSelectedDocIndex] = useState(0);
    const [showCommentBox, setShowCommentBox] = useState(false);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);

    const currentDoc = order.documents[selectedDocIndex];

    const handleApprove = async () => {
        if (confirm('Tem certeza que deseja aprovar esta tradução?')) {
            setLoading(true);
            try {
                await approveTranslation(order.id);
                alert('Tradução aprovada com sucesso!');
                // Refresh handled by server action revalidatePath
            } catch (error) {
                alert('Erro ao aprovar tradução.');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleRequestAdjustment = async () => {
        if (!comment.trim()) {
            alert('Por favor, descreva o ajuste necessário.');
            return;
        }
        setLoading(true);
        try {
            await requestAdjustment(order.id, comment);
            alert('Solicitação de ajuste enviada com sucesso!');
            setShowCommentBox(false);
            setComment('');
        } catch (error) {
            alert('Erro ao solicitar ajuste.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)]">
            {/* Header / Tabs */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 overflow-x-auto">
                {order.documents.map((doc, index) => (
                    <button
                        key={doc.id}
                        onClick={() => setSelectedDocIndex(index)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${selectedDocIndex === index
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        {doc.docType}
                    </button>
                ))}
            </div>

            {/* Main Content - Side by Side */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Side: Original Document */}
                <div className="w-1/2 border-r border-gray-200 bg-gray-50 flex flex-col">
                    <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Original
                        </h3>
                        <a
                            href={currentDoc?.originalFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                            <Download className="w-3 h-3" /> Baixar
                        </a>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto flex items-center justify-center">
                        {currentDoc?.originalFileUrl.toLowerCase().endsWith('.pdf') ? (
                            <iframe
                                src={currentDoc.originalFileUrl}
                                className="w-full h-full border rounded-lg shadow-sm"
                            />
                        ) : (
                            <img
                                src={currentDoc?.originalFileUrl}
                                alt="Documento Original"
                                className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                            />
                        )}
                    </div>
                </div>

                {/* Right Side: Translation */}
                <div className="w-1/2 bg-white flex flex-col">
                    <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" /> Tradução
                        </h3>
                        {currentDoc?.translatedFileUrl && (
                            <a
                                href={currentDoc.translatedFileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                                <Download className="w-3 h-3" /> Baixar PDF
                            </a>
                        )}
                    </div>
                    <div className="flex-1 p-6 overflow-y-auto bg-gray-50">
                        {currentDoc?.translatedText ? (
                            <div className="prose max-w-none bg-white p-8 rounded-lg shadow-sm border border-gray-100 min-h-full">
                                <pre className="whitespace-pre-wrap font-serif text-gray-800 text-lg leading-relaxed">
                                    {currentDoc.translatedText}
                                </pre>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">
                                <p>Tradução ainda não disponível para visualização em texto.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="bg-white border-t border-gray-200 p-4 flex justify-between items-center shadow-lg z-10">
                <div className="text-sm text-gray-500">
                    Status atual: <span className="font-medium text-gray-900">{order.status}</span>
                </div>

                <div className="flex gap-4">
                    {showCommentBox ? (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                            <input
                                type="text"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Descreva o ajuste necessário..."
                                className="border border-gray-300 rounded-lg px-4 py-2 w-80 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                autoFocus
                            />
                            <button
                                onClick={handleRequestAdjustment}
                                disabled={loading}
                                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                                Confirmar
                            </button>
                            <button
                                onClick={() => setShowCommentBox(false)}
                                className="text-gray-500 hover:text-gray-700 px-2"
                            >
                                Cancelar
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowCommentBox(true)}
                            disabled={loading || order.status === 'COMPLETED'}
                            className="flex items-center gap-2 px-6 py-2.5 border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <MessageSquare className="w-4 h-4" />
                            Solicitar Ajuste
                        </button>
                    )}

                    <button
                        onClick={handleApprove}
                        disabled={loading || order.status === 'COMPLETED'}
                        className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                        <CheckCircle className="w-4 h-4" />
                        Aprovar Tradução
                    </button>
                </div>
            </div>
        </div>
    );
}
