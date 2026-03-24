import React from 'react';

interface BudgetSummaryCardProps {
    subtotal: number;
    totalDocs: number;
    totalPages: number;
    onGenerateProposal: () => void;
}

export default function BudgetSummaryCard({ subtotal, totalDocs, totalPages, onGenerateProposal }: BudgetSummaryCardProps) {
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
            </div>

            <div className="flex flex-col gap-5 pt-4 border-t border-slate-700 mt-4">
                <div className="flex justify-between items-end px-1">
                    <span className="text-lg font-medium text-slate-200">Total Final</span>
                    <span className="text-3xl font-bold text-[#f97316]">${subtotal.toFixed(2)}</span>
                </div>
                <button
                    onClick={onGenerateProposal}
                    className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 shadow-md flex justify-center items-center gap-2"
                >
                    Gerar Proposta Comercial
                </button>
            </div>
        </div>
    );
}
