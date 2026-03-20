import React, { useState } from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import { UI_Z_INDEX } from '@/lib/uiZIndex';

interface FinancialAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentTotal: number;
    orderId: string | number;
    onConfirm: (newDiscount: number) => Promise<void>;
}

export default function FinancialAdjustmentModal({ isOpen, onClose, currentTotal, orderId, onConfirm }: FinancialAdjustmentModalProps) {
    const [discount, setDiscount] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setIsSubmitting(true);
        await onConfirm(discount);
        setIsSubmitting(false);
        onClose();
    };

    const newTotal = Math.max(0, currentTotal - discount);

    return (
        <ModalPortal>
            <div
                className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                style={{ zIndex: UI_Z_INDEX.modalOverlay }}
            >
                <div
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-slate-200"
                    style={{ zIndex: UI_Z_INDEX.modalContent }}
                >
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Ajuste Financeiro — Pedido #{orderId}</h3>
                    <p className="text-sm text-slate-600 mb-6">
                        Utilize esta opção para lançar descontos concedidos após a geração da proposta, garantindo a conciliação exata com o recebimento no banco.
                    </p>
                    <div className="space-y-4 mb-6">
                        <div className="flex justify-between text-slate-600">
                            <span>Valor Original:</span>
                            <span className="font-semibold">${currentTotal.toFixed(2)}</span>
                        </div>

                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <span className="text-sm font-medium text-slate-700">Desconto Extra ($):</span>
                            <input
                                type="number"
                                min="0"
                                value={discount || ''}
                                onChange={(e) => setDiscount(Number(e.target.value))}
                                className="w-24 border border-slate-300 rounded-md p-1.5 text-right focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-900"
                                placeholder="0.00"
                            />
                        </div>
                        <div className="flex justify-between text-lg font-bold text-slate-800 border-t pt-3">
                            <span>Novo Total a Receber:</span>
                            <span className="text-emerald-600">${newTotal.toFixed(2)}</span>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isSubmitting || discount <= 0}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg font-bold transition-colors"
                        >
                            {isSubmitting ? 'Salvando...' : 'Aplicar Ajuste'}
                        </button>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}
