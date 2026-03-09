// UI Layer: Modal Component
// Created: 2026-03-09

'use client';

import React, { useState } from 'react';
import { useOrderActions } from '@/hooks/useOrderActions';
import { RotateCcw, AlertTriangle, X, Loader2 } from 'lucide-react';

interface ReopenQuoteModalProps {
    orderId: number | string;
    onSuccess?: () => void;
}

export default function ReopenQuoteModal({ orderId, onSuccess }: ReopenQuoteModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { reopenQuote, isLoading } = useOrderActions();
    const [error, setError] = useState<string | null>(null);

    const handleConfirm = async () => {
        setError(null);
        // Step 2: Yield to main thread (IMPROVE INP)
        setTimeout(async () => {
            const result = await reopenQuote(orderId);

            if (result.success) {
                setIsOpen(false);
                if (onSuccess) onSuccess();
            } else {
                setError(result.error || 'Erro inesperado.');
            }
        }, 0);
    };

    return (
        <>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors border border-amber-200"
                title="Voltar pedido para rascunho"
            >
                <RotateCcw className="h-3.5 w-3.5" /> Reabrir Orçamento
            </button>

            {/* Modal Overlay */}
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">

                    {/* Modal Content */}
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 bg-amber-50 border-b border-amber-100">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-amber-600" />
                                <h3 className="text-sm font-bold text-amber-900 uppercase tracking-tight">
                                    Confirmar Reabertura
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-amber-400 hover:text-amber-600 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-700 leading-relaxed font-medium">
                                Deseja reabrir este orçamento?
                            </p>

                            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                                <p className="text-xs text-blue-800 leading-relaxed italic">
                                    "O pedido voltará para a fase de rascunho interno (Draft). O cliente NÃO será notificado até que você reenvie a proposta oficial."
                                </p>
                            </div>

                            {error && (
                                <p className="text-xs text-red-600 font-bold bg-red-50 p-2 rounded border border-red-100">
                                    ⚠️ {error}
                                </p>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
                            <button
                                onClick={() => setIsOpen(false)}
                                disabled={isLoading}
                                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50 uppercase"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={isLoading}
                                className="flex items-center gap-2 px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded shadow-md transition-all active:scale-95 disabled:opacity-50 uppercase tracking-wide"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Processando...
                                    </>
                                ) : (
                                    'Confirmar Reabertura'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
