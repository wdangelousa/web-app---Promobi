import React, { useState } from 'react';

interface BudgetSummaryCardProps {
    subtotal: number;
    totalDocs: number;
    totalPages: number;
    onGenerateProposal: (finalTotal: number, discountAmount: number, discountType: 'nominal' | 'percent') => void;
}

export default function BudgetSummaryCard({ subtotal, totalDocs, totalPages, onGenerateProposal }: BudgetSummaryCardProps) {
    const [discountValue, setDiscountValue] = useState(0);
    const [discountType, setDiscountType] = useState<'nominal' | 'percent'>('nominal');

    const discountAmount = discountType === 'percent'
        ? subtotal * (discountValue / 100)
        : discountValue;

    const finalTotal = Math.max(0, subtotal - discountAmount);

    return (
        <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#f58220] opacity-10 rounded-full -mr-16 -mt-16 blur-3xl" />
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Resumo do Orçamento</h4>

            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center text-slate-300">
                    <span>Subtotal</span>
                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>

                {/* Informações de Volume */}
                <div className="flex justify-between items-center text-slate-400 text-xs">
                    <span>Documentos/Páginas</span>
                    <span>{totalDocs} docs / {totalPages} págs.</span>
                </div>

                {/* Controle de Desconto UX */}
                <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                    <span className="text-slate-300 text-sm">Aplicar Desconto</span>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-slate-800 rounded-md p-1 border border-slate-600">
                            <button
                                onClick={() => setDiscountType('nominal')}
                                className={`px-3 py-1 text-xs rounded font-bold transition-colors ${discountType === 'nominal' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                $
                            </button>
                            <button
                                onClick={() => setDiscountType('percent')}
                                className={`px-3 py-1 text-xs rounded font-bold transition-colors ${discountType === 'percent' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                %
                            </button>
                        </div>
                        <input
                            type="number"
                            min="0"
                            value={discountValue || ''}
                            onChange={(e) => setDiscountValue(Number(e.target.value))}
                            placeholder="0.00"
                            className="w-24 bg-slate-900 border border-slate-600 text-white text-right pr-3 pl-2 py-1.5 rounded-md focus:outline-none focus:border-orange-500 transition-colors text-sm font-mono"
                        />
                    </div>
                </div>

                {discountAmount > 0 && (
                    <div className="flex justify-between items-center text-emerald-400 text-sm font-medium px-1">
                        <span>Valor Descontado</span>
                        <span>- ${discountAmount.toFixed(2)}</span>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-5 pt-4 border-t border-slate-700 mt-4">
                <div className="flex justify-between items-end px-1">
                    <span className="text-lg font-medium text-slate-200">Total Final</span>
                    <span className="text-3xl font-bold text-[#f97316]">${finalTotal.toFixed(2)}</span>
                </div>
                <button
                    onClick={() => onGenerateProposal(finalTotal, discountAmount, discountType)}
                    className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 shadow-md flex justify-center items-center gap-2"
                >
                    Gerar Proposta Comercial
                </button>
            </div>
        </div>
    );
}
