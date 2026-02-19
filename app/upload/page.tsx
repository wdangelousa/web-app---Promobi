'use client';

import { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { uploadDocument } from '@/app/actions/uploadDocument';

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null);
    const [orderId, setOrderId] = useState('');
    const [docType, setDocType] = useState('RG / CNH (Original)');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !orderId) {
            setMessage({ type: 'error', text: 'Por favor, preencha todos os campos.' });
            return;
        }

        setLoading(true);
        setMessage(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('orderId', orderId);
        formData.append('docType', docType);

        try {
            await uploadDocument(formData);
            setMessage({ type: 'success', text: 'Arquivo enviado com sucesso!' });
            setFile(null);
            setOrderId('');
            // Resetar o input de arquivo
            const fileInput = document.getElementById('file-upload') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
        } catch (error) {
            console.error(error);
            setMessage({ type: 'error', text: 'Erro ao enviar arquivo. Tente novamente.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Upload className="w-8 h-8 text-blue-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Upload de Documentos</h1>
                    <p className="text-gray-500 mt-2">Envie os arquivos para o seu pedido</p>
                </div>

                {message && (
                    <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                        {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        <span className="text-sm font-medium">{message.text}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="orderId" className="block text-sm font-medium text-gray-700 mb-1">
                            ID do Pedido
                        </label>
                        <input
                            type="text"
                            id="orderId"
                            value={orderId}
                            onChange={(e) => setOrderId(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            placeholder="Ex: 123"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="docType" className="block text-sm font-medium text-gray-700 mb-1">
                            Tipo de Documento
                        </label>
                        <select
                            id="docType"
                            value={docType}
                            onChange={(e) => setDocType(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        >
                            <option>RG / CNH (Original)</option>
                            <option>Certidão de Nascimento</option>
                            <option>Certidão de Casamento</option>
                            <option>Diploma / Histórico</option>
                            <option>Outros</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Arquivo
                        </label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-blue-500 transition-colors cursor-pointer relative">
                            <input
                                id="file-upload"
                                name="file-upload"
                                type="file"
                                className="sr-only"
                                onChange={handleFileChange}
                                accept=".pdf,.png,.jpg,.jpeg"
                            />
                            <label htmlFor="file-upload" className="cursor-pointer text-center w-full h-full block">
                                <div className="space-y-1 text-center">
                                    {file ? (
                                        <div className="flex flex-col items-center">
                                            <FileText className="mx-auto h-12 w-12 text-blue-500" />
                                            <p className="mt-2 text-sm text-gray-900 font-medium truncate max-w-[200px]">
                                                {file.name}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {(file.size / 1024 / 1024).toFixed(2)} MB
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                            <div className="flex text-sm text-gray-600 justify-center">
                                                <span className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                                    Selecione um arquivo
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                PDF, PNG, JPG até 10MB
                                            </p>
                                        </>
                                    )}
                                </div>
                            </label>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white transition-all ${loading
                                ? 'bg-blue-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                            }`}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                                Enviando...
                            </>
                        ) : (
                            'Enviar Documento'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
