'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { ArrowRight, Check } from 'lucide-react';

interface PriceCalculatorProps {
    pageCount: number;
    hasNotarization?: boolean;
    onFinalize: () => void;
    basePricePerPage?: number; // default 100
    notarizationFee?: number; // default 50
    currency?: 'BRL' | 'USD';
    isLoading?: boolean;
}

export const PriceCalculator = ({
    pageCount = 0,
    hasNotarization = false,
    onFinalize,
    basePricePerPage = 100,
    notarizationFee = 50,
    currency = 'BRL',
    isLoading = false
}: PriceCalculatorProps) => {

    const subtotal = useMemo(() => {
        return pageCount * basePricePerPage;
    }, [pageCount, basePricePerPage]);

    const total = useMemo(() => {
        return subtotal + (hasNotarization ? notarizationFee : 0);
    }, [subtotal, hasNotarization, notarizationFee]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'en-US', {
            style: 'currency',
            currency: currency
        }).format(value);
    };

    if (pageCount === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 opacity-75 grayscale-[0.8]">
                <h3 className="text-lg font-bold text-slate-400 mb-2">Resumo do Pedido</h3>
                <p className="text-sm text-slate-400">
                    Faça o upload dos documentos para ver o orçamento.
                </p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 md:p-8 sticky top-24"
        >
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                Resumo do Pedido
            </h3>

            {/* Line Items */}
            <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Tradução Certificada ({pageCount} pgs)</span>
                    <span className="font-medium text-slate-800">{formatCurrency(subtotal)}</span>
                </div>

                {hasNotarization && (
                    <div className="flex justify-between items-center text-sm text-blue-600 bg-blue-50 p-2 rounded-lg">
                        <span className="flex items-center gap-2">
                            <Check className="w-4 h-4" /> Notarização Oficial
                        </span>
                        <span className="font-bold">+{formatCurrency(notarizationFee)}</span>
                    </div>
                )}

                <div className="h-px bg-slate-100 my-4" />

                <div className="flex justify-between items-end">
                    <span className="text-slate-500 font-medium">Total Estimado</span>
                    <div className="text-right">
                        <span className="block text-3xl font-extrabold text-[var(--color-primary)] leading-none tracking-tight">
                            {formatCurrency(total)}
                        </span>
                        <span className="text-xs text-slate-400 mt-1">
                            {currency === 'BRL' ? 'Parcelamento disponível' : 'Pagamento seguro via Stripe'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Action Button */}
            <button
                onClick={onFinalize}
                disabled={isLoading}
                className="w-full bg-[var(--color-primary)] hover:bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-orange-200 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg group"
            >
                {isLoading ? (
                    'Processando...'
                ) : (
                    <>
                        Finalizar Pedido <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                )}
            </button>

            <div className="mt-4 flex items-center justify-center gap-4 text-slate-300">
                {/* Simple iconography for payment methods could go here */}
                <div className="text-[10px] uppercase font-bold tracking-widest">Site Seguro 256-bit SSL</div>
            </div>
        </motion.div>
    );
};

