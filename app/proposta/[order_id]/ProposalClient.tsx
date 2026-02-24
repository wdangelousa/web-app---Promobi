'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Info, FileText, ChevronDown, Clock, ShieldCheck, Mail, Smartphone, Zap, ArrowRight, CreditCard, Lock, Eye, X } from 'lucide-react'
import { createCheckoutSession } from '@/app/actions/checkout'
import { useUIFeedback } from '@/components/UIFeedbackProvider'

import { Download } from 'lucide-react'
import { getLogoBase64 } from '@/app/actions/get-logo-base64'
import { generatePremiumProposalPDF } from '@/app/actions/generate-proposal-pdf'
import { useEffect } from 'react'

export default function ProposalClient({ order, globalSettings }: { order: any, globalSettings: any }) {
    const metadata = order.metadata ? JSON.parse(order.metadata) : null;

    const [expandedDocs, setExpandedDocs] = useState<number[]>(
        metadata?.documents?.map((d: any) => d.id) || []
    )
    const [quicklookData, setQuicklookData] = useState<{ url: string, pageNumber: number } | null>(null)
    const [paymentMethod, setPaymentMethod] = useState<'STRIPE' | 'ZELLE' | 'PIX' | null>(null)
    const [isConfirmingTransfer, setIsConfirmingTransfer] = useState(false)
    const [isProcessingStripe, setIsProcessingStripe] = useState(false)
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
    const [logoBase64, setLogoBase64] = useState<string | null>(null)

    useEffect(() => {
        getLogoBase64().then(setLogoBase64)
    }, [])

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

    const toggleDocExpand = (id: number) => {
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

    const handleDownloadPDF = async () => {
        if (isGeneratingPDF) return;
        setIsGeneratingPDF(true);
        try {
            const result = await generatePremiumProposalPDF(order, globalSettings);
            if (result.success && result.base64) {
                const link = document.createElement('a');
                link.href = `data:application/pdf;base64,${result.base64}`;
                link.download = result.fileName || `Proposta-Promobi-${order.id}.pdf`;
                link.click();
                toast.success('PDF gerado com sucesso!');
            } else {
                toast.error(result.error || 'Erro ao gerar PDF.');
            }
        } catch (err) {
            console.error('PDF generation error:', err);
            toast.error('Falha ao gerar PDF.');
        } finally {
            setIsGeneratingPDF(false);
        }
    }

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

            {/* ── HEADER ──────────────────────────────────────────────────────────
                ANTES: telefone era `absolute right-6` → sobrepunha o título.
                AGORA:  layout em 3 colunas (espaço | centro | telefone) para que
                        o título fique sempre centralizado sem colisão.           */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-3xl mx-auto px-6 py-4">

                    {/* Grid 3 colunas: placeholder | conteúdo central | telefone */}
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">

                        {/* Coluna esquerda — vazia, só para contrabalançar */}
                        <div className="hidden md:block" />

                        {/* Coluna central */}
                        <div className="flex flex-col items-center text-center col-start-1 md:col-start-2">
                            <Image
                                src="/logo.png"
                                width={140}
                                height={46}
                                alt="Promobi"
                                className="h-10 w-auto mb-3"
                                style={{ objectFit: 'contain' }}
                            />
                            <h1 className="text-lg md:text-2xl font-black text-slate-900 leading-tight">
                                Proposta de Serviços de Tradução Certificada
                            </h1>
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-2 text-sm text-slate-600 font-medium">
                                <span className="bg-slate-100 px-3 py-1 rounded-full text-slate-500">
                                    Cotação #{order.id}
                                </span>
                                {globalSettings && (
                                    <button
                                        onClick={handleDownloadPDF}
                                        disabled={isGeneratingPDF}
                                        className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1 rounded-full text-[10px] font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                    >
                                        <Download className="w-3 h-3" />
                                        {isGeneratingPDF ? 'Gerando...' : 'Baixar PDF'}
                                    </button>
                                )}
                                <span>•</span>
                                <span>{order.user.fullName}</span>
                            </div>
                        </div>

                        {/* Coluna direita — telefone, alinhado à direita */}
                        <div className="hidden md:flex justify-end">
                            <a
                                href="https://wa.me/13213245851"
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 font-bold px-4 py-2 rounded-full text-sm transition-colors border border-green-200 shadow-sm whitespace-nowrap"
                            >
                                <Smartphone className="w-4 h-4" /> (321) 324-5851
                            </a>
                        </div>
                    </div>

                    {/* Telefone em mobile — aparece abaixo, centralizado */}
                    <div className="flex justify-center mt-3 md:hidden">
                        <a
                            href="https://wa.me/13213245851"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 font-bold px-4 py-2 rounded-full text-sm transition-colors border border-green-200 shadow-sm"
                        >
                            <Smartphone className="w-4 h-4" /> (321) 324-5851
                        </a>
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 mt-8 space-y-6">

                {/* Visão Geral */}
                <section className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border border-slate-100">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                        <FileText className="text-[#f58220] w-5 h-5" /> Visão Geral do Pedido
                    </h2>
                    <p className="text-sm text-slate-600 leading-relaxed mb-6">
                        Analisamos cuidadosamente seus documentos via motor inteligente. Abaixo detalhamos a matemática exata, baseada puramente na densidade de texto (volume de palavras) encontrada nas páginas processadas. Padrão exigido pelo USCIS.
                    </p>

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

                {/* Raio-X */}
                <section className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border border-slate-100">
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                                <Zap className="text-[#f58220] w-5 h-5" /> Raio-X de Transparência
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">Análise inteligente página por página</p>
                        </div>
                        <div className="hidden md:block">
                            <span className="bg-green-100 text-green-700 text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 max-w-xs text-right leading-tight">
                                <CheckCircle className="w-5 h-5 shrink-0" /> Auditoria Promobi: Orçamento calculado página por página pela nossa IA. Preço justo garantido.
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
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="bg-white p-2 rounded-lg shadow-sm shrink-0">
                                                <FileText className="w-5 h-5 text-slate-400" />
                                            </div>
                                            <div className="min-w-0">
                                                {/* break-words para não truncar nomes longos */}
                                                <p className="font-bold text-sm text-slate-800 break-words leading-snug">{doc.exactNameOnDoc}</p>
                                                <p className="text-xs text-slate-500">{doc.count} página(s)</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0 ml-3">
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
                                                        let color = 'bg-gray-100 text-gray-500';
                                                        let label = '⚪ Em Branco';
                                                        if (p.density === 'high') { color = 'bg-red-100 text-red-800'; label = '🔴 Alta (100%)'; }
                                                        else if (p.density === 'medium') { color = 'bg-yellow-100 text-yellow-800'; label = '🟡 Média (50%)'; }
                                                        else if (p.density === 'low') { color = 'bg-green-100 text-green-800'; label = '🟢 Baixa (25%)'; }
                                                        else if (p.density === 'scanned') { color = 'bg-orange-100 text-orange-800'; label = '🟠 Digitalizado'; }

                                                        return (
                                                            <div key={pIdx} className="flex items-center gap-3 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                <span className="text-slate-400 font-mono w-14 shrink-0">Pg {p.pageNumber}:</span>
                                                                <span className="text-slate-600 font-mono w-20 shrink-0">
                                                                    {p.wordCount ?? 0} pal. <span className="text-slate-300">{'->'}</span>
                                                                </span>
                                                                <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${color}`}>
                                                                    {label}
                                                                </span>
                                                                <div className="ml-auto flex items-center gap-3 shrink-0">
                                                                    <span className="font-mono text-slate-700 font-bold">${p.price.toFixed(2)}</span>
                                                                    <button
                                                                        onClick={() => {
                                                                            if (doc.originalFileUrl) {
                                                                                setQuicklookData({ url: doc.originalFileUrl, pageNumber: p.pageNumber });
                                                                            }
                                                                        }}
                                                                        className="text-slate-400 hover:text-[#f58220] transition-colors p-1 bg-slate-100 hover:bg-orange-50 rounded"
                                                                        title="Visualizar Página Original"
                                                                    >
                                                                        <Eye className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
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

                {/* Resumo Financeiro */}
                <section className="bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 text-white relative overflow-hidden">
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

                {/* Pagamento */}
                <section className="bg-white rounded-2xl shadow-lg p-6 md:p-8 border border-slate-100">
                    <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
                        <Lock className="w-5 h-5 text-[#f58220]" /> Pagamento Seguro
                    </h2>

                    <div className="space-y-3">
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
                                            <p className="text-slate-500 mb-1">Envie o valor exato para o número Zelle abaixo:</p>
                                            <p className="font-mono font-bold text-xl text-slate-900 select-all">(321) 324-5851</p>
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
                                            <p className="text-xs text-teal-600 font-bold mt-4 bg-teal-50 py-1.5 px-3 rounded-full inline-block">
                                                Valor em R$: R$ {(order.totalAmount * 5.2).toFixed(2)}
                                            </p>
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

                <footer className="pt-8 pb-12 text-center border-t border-slate-200 mt-12">
                    <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed mb-4">
                        Ao prosseguir com o pagamento, você atesta a veracidade dos documentos originais e concorda com nossos{' '}
                        <a href="#" className="underline">Termos de Serviço</a>.
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                        Promobi Corporate Services LLC<br />
                        13550 Village Park Dr. Unit 250 - Orlando, FL – 32837<br />
                        Dúvidas? Fale conosco no WhatsApp (321) 324-5851
                    </p>
                </footer>
            </main>

            {/* Quicklook Modal */}
            {quicklookData && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setQuicklookData(null)}>
                    <div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                            <span className="text-sm font-bold text-slate-700">Página {quicklookData.pageNumber}</span>
                            <button onClick={() => setQuicklookData(null)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <iframe src={`${quicklookData.url}#page=${quicklookData.pageNumber}`} className="flex-1 w-full" style={{ minHeight: '70vh' }} />
                    </div>
                </div>
            )}
        </div>
    )
}
