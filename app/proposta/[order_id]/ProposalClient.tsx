'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Info, FileText, ChevronDown, Clock, ShieldCheck, Mail, Smartphone, Zap, ArrowRight, CreditCard, Lock } from 'lucide-react'
import { createCheckoutSession } from '@/app/actions/checkout'
import { useUIFeedback } from '@/components/UIFeedbackProvider'

export default function ProposalClient({ order }: { order: any }) {
    const [expandedDocs, setExpandedDocs] = useState<string[]>([])
    const [paymentMethod, setPaymentMethod] = useState<'STRIPE' | 'ZELLE' | 'PIX' | null>(null)
    const [isConfirmingTransfer, setIsConfirmingTransfer] = useState(false)
    const [isProcessingStripe, setIsProcessingStripe] = useState(false)

    // Safety check for metadata
    const metadata = order.metadata ? JSON.parse(order.metadata) : null;
    const breakdown = metadata?.breakdown || {};

    const { toast } = useUIFeedback()

    const urgencyLabels: Record<string, string> = {
        standard: 'Standard (4-10 dias)',
        urgent: 'Urgente (48h)',
        flash: 'Flash (24h)'
    }

    const urgencyColors: Record<string, string> = {
        standard: 'bg-blue-100 text-blue-800',
        urgent: 'bg-orange-100 text-orange-800',
        flash: 'bg-red-100 text-red-800'
    }

    const requires100Upfront = order.urgency === 'urgent' || order.urgency === 'flash';

    const toggleDocExpand = (id: string) => {
        setExpandedDocs(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
    }

    const handleStripeCheckout = async () => {
        setIsProcessingStripe(true)
        try {
            const result = await createCheckoutSession(order.id)
            if (result.success && result.url) {
                window.location.href = result.url
            } else {
                toast.error('Erro ao conectar com a plataforma de pagamento.')
                setIsProcessingStripe(false)
            }
        } catch (error) {
            console.error(error)
            toast.error('Falha na conexão.')
            setIsProcessingStripe(false)
        }
    }

    const handleManualPaymentConfirmation = async (method: 'ZELLE' | 'PIX') => {
        setIsConfirmingTransfer(true)
        try {
            const res = await fetch('/api/confirm-manual-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: order.id, method })
            })
            if (res.ok) {
                toast.success('Notificação de pagamento enviada com sucesso!')
                // Refresh or redirect
                setTimeout(() => window.location.reload(), 2000)
            } else {
                toast.error('Ocorreu um erro ao notificar. Tente novamente.')
                setIsConfirmingTransfer(false)
            }
        } catch (e) {
            toast.error('Falha de conexão.')
            setIsConfirmingTransfer(false)
        }
    }

    // Determine initial state gracefully
    if (order.status !== 'PENDING_PAYMENT') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full">
                    <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 mb-2">Proposta Atualizada</h2>
                    <p className="text-slate-500 mb-8">Esta proposta já foi aprovada ou seu status foi atualizado pelo nosso time.</p>
                    <a href="https://promobi.us" className="bg-[#f58220] hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-full transition-all block w-full">
                        Voltar ao Site
                    </a>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
            {/* A. Cabeçalho Executivo */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-3xl mx-auto px-6 py-4 flex flex-col items-center justify-center text-center">
                    <Image src="/logo.png" width={180} height={60} alt="Promobi" className="h-10 w-auto mb-3" />
                    <h1 className="text-xl md:text-2xl font-black text-slate-900 leading-tight">Proposta de Serviços de Tradução Certificada</h1>
                    <div className="flex items-center gap-2 mt-2 text-sm text-slate-600 font-medium">
                        <span className="bg-slate-100 px-3 py-1 rounded-full text-slate-500">Cotação #{order.id}</span>
                        <span>•</span>
                        <span>{order.user.fullName}</span>
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 mt-8 space-y-6">

                {/* Intro / Executive Summary */}
                <section className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border border-slate-100">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                        <FileText className="text-[#f58220] w-5 h-5" /> Visão Geral do Pedido
                    </h2>
                    <p className="text-sm text-slate-600 leading-relaxed mb-6">
                        Analisamos cuidadosamente seus documentos via motor inteligente. Abaixo detalhamos a matemática exata, baseada puramente na densidade de texto (volume de palavras) encontrada nas páginas processadas. Padrão exigido pelo USCIS.
                    </p>

                    {/* C. Prazos, Garantias e Chancelas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock className="w-4 h-4 text-slate-500" />
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prazo Selecionado</span>
                            </div>
                            <div className={`inline-block px-3 py-1 rounded-md text-sm font-bold ${urgencyColors[order.urgency] || 'bg-slate-200'}`}>
                                {urgencyLabels[order.urgency] || order.urgency}
                            </div>
                        </div>

                        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                            <div className="flex items-center gap-2 mb-2">
                                <ShieldCheck className="w-5 h-5 text-blue-600" />
                                <span className="text-sm font-bold text-blue-900">100% USCIS Acceptance</span>
                            </div>
                            <p className="text-xs text-blue-800 leading-tight">
                                Tradução Certificada rigorosamente revisada por membro da ATA. Pronta para imigração.
                            </p>
                        </div>
                    </div>
                </section>

                {/* B. O "Raio-X" da Transparência (Densidade) */}
                <section className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border border-slate-100">
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                                <Zap className="text-[#f58220] w-5 h-5" /> Raio-X de Transparência
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">Análise inteligente página por página</p>
                        </div>
                        <div className="hidden md:block">
                            <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" /> Preço Justo Garantido
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {metadata?.documents?.map((doc: any, i: number) => {
                            const isExpanded = expandedDocs.includes(doc.id)
                            return (
                                <div key={doc.id || i} className="border border-slate-200 rounded-xl overflow-hidden">
                                    <div
                                        className="bg-slate-50 p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                                        onClick={() => toggleDocExpand(doc.id)}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="bg-white p-2 rounded-lg shadow-sm shrink-0">
                                                <FileText className="w-5 h-5 text-slate-400" />
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="font-bold text-sm text-slate-800 truncate">{doc.fileName}</p>
                                                <p className="text-xs text-slate-500">{doc.count} página(s)</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            {doc.analysis && (
                                                <span className="font-bold text-slate-900">${doc.analysis.totalPrice?.toFixed(2)}</span>
                                            )}
                                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {isExpanded && doc.analysis && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="bg-white border-t border-slate-200 p-4"
                                            >
                                                <div className="space-y-3">
                                                    {doc.analysis.pages.map((p: any, pIdx: number) => {
                                                        const pct = Math.round(p.confidence * 100)
                                                        let color = 'text-green-600'; let bg = 'bg-green-500'
                                                        if (pct > 60) { color = 'text-[#f58220]'; bg = 'bg-[#f58220]' }

                                                        return (
                                                            <div key={pIdx} className="flex items-center gap-4 text-xs">
                                                                <span className="text-slate-400 font-mono w-16">Pág. {p.pageNumber}:</span>
                                                                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div className={`h-full ${bg} rounded-full`} style={{ width: `${pct}%` }}></div>
                                                                </div>
                                                                <span className={`font-bold w-12 text-right ${color}`}>{pct}%</span>
                                                                <span className="font-mono text-slate-600 w-16 text-right">${p.price.toFixed(2)}</span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )
                        })}
                    </div>
                </section>

                {/* D. Resumo Financeiro e Condições */}
                <section className="bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 text-white relative overflow-hidden">
                    {/* Background glow */}
                    <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-[#f58220] rounded-full blur-3xl opacity-20"></div>

                    <h2 className="text-xl font-bold mb-6 text-slate-100">Resumo Financeiro</h2>

                    <div className="space-y-3 mb-6 font-mono text-sm border-b border-slate-700 pb-6">
                        <div className="flex justify-between text-slate-300">
                            <span>Base (Cálculo de Densidade)</span>
                            <span>${breakdown.basePrice?.toFixed(2) || '---'}</span>
                        </div>
                        {breakdown.urgencyFee > 0 && (
                            <div className="flex justify-between text-orange-300">
                                <span>Taxa de Urgência ({urgencyLabels[order.urgency]})</span>
                                <span>+${breakdown.urgencyFee.toFixed(2)}</span>
                            </div>
                        )}
                        {breakdown.notaryFee > 0 && (
                            <div className="flex justify-between text-blue-300">
                                <span>Notarização Oficial</span>
                                <span>+${breakdown.notaryFee.toFixed(2)}</span>
                            </div>
                        )}
                        {breakdown.totalDiscountApplied > 0 && (
                            <div className="flex justify-between text-green-400">
                                <span>Desconto Especial</span>
                                <span>-${breakdown.totalDiscountApplied.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-end mb-6 relative z-10">
                        <div>
                            <span className="block text-slate-400 text-sm mb-1 uppercase tracking-wider font-bold">Total a Pagar</span>
                            {requires100Upfront ? (
                                <span className="text-xs text-orange-300 bg-orange-900/50 px-2 py-1 rounded inline-flex items-center gap-1">
                                    <Info className="w-3 h-3" /> 100% Upfront (Sem parcelamento p/ Urgência)
                                </span>
                            ) : (
                                <span className="text-xs text-green-300 bg-green-900/50 px-2 py-1 rounded inline-flex items-center gap-1">
                                    Elegível para pagamento 50/50
                                </span>
                            )}
                        </div>
                        <div className="text-4xl font-black text-white">
                            ${order.totalAmount.toFixed(2)}
                        </div>
                    </div>
                </section>

                {/* E. Central de Pagamento Inteligente */}
                <section className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border border-slate-100">
                    <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
                        <Lock className="w-5 h-5 text-[#f58220]" /> Pagamento Seguro
                    </h2>

                    <div className="space-y-3">
                        {/* 1. Stripe (Default/Primary) */}
                        <div
                            className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${paymentMethod === 'STRIPE' ? 'border-[#f58220] bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}
                            onClick={() => setPaymentMethod('STRIPE')}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-[#635BFF]/10 p-2 rounded-lg"><CreditCard className="w-6 h-6 text-[#635BFF]" /></div>
                                    <div>
                                        <h3 className="font-bold text-slate-900">Cartão de Crédito</h3>
                                        <p className="text-xs text-slate-500">Google Pay, Apple Pay via Stripe</p>
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'STRIPE' ? 'border-[#f58220]' : 'border-slate-300'}`}>
                                    {paymentMethod === 'STRIPE' && <div className="w-2.5 h-2.5 bg-[#f58220] rounded-full"></div>}
                                </div>
                            </div>

                            <AnimatePresence>
                                {paymentMethod === 'STRIPE' && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 pt-4 border-t border-orange-200">
                                        <button
                                            disabled={isProcessingStripe}
                                            onClick={handleStripeCheckout}
                                            className="w-full bg-[#f58220] hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-70"
                                        >
                                            {isProcessingStripe ? 'Conectando seguro...' : 'Pagar com Cartão'} <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* 2. Zelle */}
                        <div
                            className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${paymentMethod === 'ZELLE' ? 'border-[#741cd9] bg-purple-50' : 'border-slate-200 hover:border-slate-300'}`}
                            onClick={() => setPaymentMethod('ZELLE')}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-[#741cd9]/10 p-2 rounded-lg"><Smartphone className="w-6 h-6 text-[#741cd9]" /></div>
                                    <div>
                                        <h3 className="font-bold text-slate-900">Transferência Zelle</h3>
                                        <p className="text-xs text-slate-500">Sem taxas de processamento</p>
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'ZELLE' ? 'border-[#741cd9]' : 'border-slate-300'}`}>
                                    {paymentMethod === 'ZELLE' && <div className="w-2.5 h-2.5 bg-[#741cd9] rounded-full"></div>}
                                </div>
                            </div>

                            <AnimatePresence>
                                {paymentMethod === 'ZELLE' && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 pt-4 border-t border-purple-200 text-sm">
                                        <div className="bg-white p-4 rounded-lg border border-purple-100 mb-4 text-center">
                                            <p className="text-slate-500 mb-1">Envie o valor exato para o Zelle abaixo:</p>
                                            <p className="font-mono font-bold text-lg text-slate-900 select-all">financeiro@promobi.us</p>
                                            <p className="text-xs text-slate-400 mt-2">Promobi Corporate Services LLC</p>
                                        </div>
                                        <button
                                            disabled={isConfirmingTransfer}
                                            onClick={() => handleManualPaymentConfirmation('ZELLE')}
                                            className="w-full bg-[#741cd9] hover:bg-purple-800 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-70"
                                        >
                                            {isConfirmingTransfer ? 'Aguarde...' : 'Já realizei a transferência Zelle'}
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* 3. Pix */}
                        <div
                            className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${paymentMethod === 'PIX' ? 'border-[#32bcad] bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}
                            onClick={() => setPaymentMethod('PIX')}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-[#32bcad]/10 p-2 rounded-lg">
                                        <Image src="/pix-icon.svg" width={24} height={24} alt="Pix" className="w-6 h-6 opacity-70" style={{ filter: 'brightness(0) saturate(100%) invert(62%) sepia(34%) saturate(738%) hue-rotate(124deg) brightness(88%) contrast(90%)' }} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900">Pix (BRL)</h3>
                                        <p className="text-xs text-slate-500">Pague em Reais (Conversão Oficial)</p>
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'PIX' ? 'border-[#32bcad]' : 'border-slate-300'}`}>
                                    {paymentMethod === 'PIX' && <div className="w-2.5 h-2.5 bg-[#32bcad] rounded-full"></div>}
                                </div>
                            </div>

                            <AnimatePresence>
                                {paymentMethod === 'PIX' && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 pt-4 border-t border-teal-200 text-sm">
                                        <div className="bg-white p-4 rounded-lg border border-teal-100 mb-4 text-center">
                                            <p className="text-slate-500 mb-2">Chave Pix (Telefone Celular):</p>
                                            <p className="font-mono font-bold text-xl text-slate-900 select-all tracking-wider">+14076396154</p>
                                            <p className="text-xs text-slate-400 mt-2">Nominal/Favorecido: Walter D'Angelo</p>
                                            <p className="text-xs text-teal-600 font-bold mt-2 mt-4 bg-teal-50 py-1.5 px-3 rounded-full inline-block">Valor em R$: R$ {(order.totalAmount * 5.2).toFixed(2)}</p>
                                        </div>
                                        <button
                                            disabled={isConfirmingTransfer}
                                            onClick={() => handleManualPaymentConfirmation('PIX')}
                                            className="w-full bg-[#32bcad] hover:bg-[#259c8f] text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-70"
                                        >
                                            {isConfirmingTransfer ? 'Aguarde...' : 'Já realizei o Pix'}
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </section>

                {/* F. Rodapé Institucional */}
                <footer className="pt-8 pb-12 text-center border-t border-slate-200 mt-12">
                    <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed mb-4">
                        Ao prosseguir com o pagamento, você atesta a veracidade dos documentos originais e concorda com nossos <br /><a href="#" className="underline">Termos de Serviço</a>.
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                        Promobi Corporate Services LLC<br />
                        13550 Village Park Dr. Unit 250 - Orlando, FL – 32837
                    </p>
                </footer>
            </main>
        </div>
    )
}
