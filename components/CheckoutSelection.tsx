'use client';

import { motion } from 'framer-motion';
import { CreditCard, Globe, Smartphone, Check, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

type PaymentProvider = 'STRIPE' | 'PARCELADO_USA';

interface CheckoutSelectionProps {
    totalAmount: number;
    orderId: string;
    onSelect: (provider: PaymentProvider) => void;
    isLoading?: boolean;
}

export const CheckoutSelection = ({
    totalAmount,
    orderId,
    onSelect,
    isLoading = false
}: CheckoutSelectionProps) => {
    const [selected, setSelected] = useState<PaymentProvider | null>(null);

    const handleSelect = (provider: PaymentProvider) => {
        setSelected(provider);
    };

    const handleConfirm = () => {
        if (selected) {
            onSelect(selected);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-800 text-center">
                Como você prefere pagar?
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
                {/* Option 1: Stripe (International) */}
                <div
                    onClick={() => handleSelect('STRIPE')}
                    className={`
                        relative group cursor-pointer
                        bg-white rounded-2xl p-6 border-2 transition-all duration-300
                        ${selected === 'STRIPE'
                            ? 'border-[var(--color-primary)] shadow-lg ring-1 ring-[var(--color-primary)]'
                            : 'border-slate-100 hover:border-slate-300 hover:shadow-md'
                        }
                    `}
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className={`p-3 rounded-xl ${selected === 'STRIPE' ? 'bg-orange-50 text-[var(--color-primary)]' : 'bg-slate-50 text-slate-500'}`}>
                            <Globe className="w-6 h-6" />
                        </div>
                        {selected === 'STRIPE' && (
                            <div className="bg-[var(--color-primary)] text-white rounded-full p-1">
                                <Check className="w-4 h-4" />
                            </div>
                        )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-1">Cartão Internacional</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        Pagamento em <strong>USD</strong> via Stripe. Aceitamos todos os cartões, Apple Pay e Google Pay.
                    </p>
                    <div className="mt-4 flex gap-2 opacity-50 grayscale hover:grayscale-0 transition-all">
                        {/* Placeholder for card icons if needed, using text for now or Lucide */}
                        <CreditCard className="w-5 h-5" />
                    </div>
                </div>

                {/* Option 2: Parcelado USA (Brazil) */}
                <div
                    onClick={() => handleSelect('PARCELADO_USA')}
                    className={`
                        relative group cursor-pointer
                        bg-white rounded-2xl p-6 border-2 transition-all duration-300
                        ${selected === 'PARCELADO_USA'
                            ? 'border-green-500 shadow-lg ring-1 ring-green-500' // Using Green for Brazil differentiation or keep Orange? Prompt said "Logo Orange/Black". Let's stick to Orange/Black theme but highlight differenly.
                            // Actually, let's use the Brand Secondary (Navy) for contrast or keep consistency.
                            // Let's use Orange as primary selection color for consistency.
                            : 'border-slate-100 hover:border-slate-300 hover:shadow-md'
                        }
                         ${selected === 'PARCELADO_USA' ? 'border-[var(--color-primary)] ring-[var(--color-primary)]' : ''}
                    `}
                >
                    {/* Brazil Flag Badge or similar */}
                    <div className="absolute top-4 right-4 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide">
                        Opção Brasil
                    </div>

                    <div className="flex justify-between items-start mb-4">
                        <div className={`p-3 rounded-xl ${selected === 'PARCELADO_USA' ? 'bg-orange-50 text-[var(--color-primary)]' : 'bg-slate-50 text-slate-500'}`}>
                            <Smartphone className="w-6 h-6" />
                        </div>
                        {selected === 'PARCELADO_USA' && (
                            <div className="bg-[var(--color-primary)] text-white rounded-full p-1">
                                <Check className="w-4 h-4" />
                            </div>
                        )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-1">Pix ou Parcelado</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        Pague em <strong>Reais (R$)</strong>. Use Pix ou parcele em até 12x no cartão de crédito brasileiro.
                    </p>
                </div>
            </div>

            {/* Confirm Action */}
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: selected ? 1 : 0, height: selected ? 'auto' : 0 }}
                className="overflow-hidden"
            >
                <button
                    onClick={handleConfirm}
                    disabled={isLoading || !selected}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                >
                    {isLoading ? 'Redirecionando...' : 'Ir para Pagamento'}
                    <ArrowRight className="w-5 h-5" />
                </button>
                <p className="text-center text-xs text-slate-400 mt-3">
                    Você será redirecionado para um ambiente seguro.
                </p>
            </motion.div>
        </div>
    );
};
