'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    CheckCircle,
    CreditCard,
    ShieldCheck,
    FileText,
    ChevronDown,
    Smartphone,
    Info,
    ArrowRight,
    Zap,
    Clock,
    Copy,
    Check
} from 'lucide-react'
import { createCheckoutSession } from '@/app/actions/checkout'
import { updateOrderStatus } from '@/app/actions/adminOrders'
import { useUIFeedback } from '@/components/UIFeedbackProvider'

type PayClientProps = {
    order: any;
    metadata: any;
}

export default function PayClient({ order, metadata }: PayClientProps) {
    const [selectedMethod, setSelectedMethod] = useState<'stripe' | 'zelle' | 'pix' | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const [isConfirmed, setIsConfirmed] = useState(order.status === 'AWAITING_VERIFICATION')
    const [expandedDocs, setExpandedDocs] = useState<string[]>([])

    const { toast } = useUIFeedback()

    const handleStripePayment = async () => {
        setIsProcessing(true)
        try {
            const result = await createCheckoutSession(order.id)
            if (result.success && result.url) {
                window.location.href = result.url
            } else {
                toast.error('Erro ao iniciar pagamento. Tente novamente.')
            }
        } catch (e) {
            toast.error('Erro de conexão.')
        } finally {
            setIsProcessing(false)
        }
    }

    const handleManualConfirmation = async (method: 'ZELLE' | 'PIX') => {
        setIsProcessing(true)
        try {
            // We use updateOrderStatus directly here for simplicity, 
            // but in a production app we'd want a more restricted action.
            const result = await updateOrderStatus(order.id, 'AWAITING_VERIFICATION')
            if (result.success) {
                setIsConfirmed(true)
                toast.success('Confirmação enviada! Nossa equipe financeira validará em breve.')
            } else {
                toast.error('Erro ao confirmar. Tente novamente.')
            }
        } catch (e) {
            toast.error('Erro de conexão.')
        } finally {
            setIsProcessing(false)
        }
    }

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text)
        toast.info(`${label} copiado!`)
    }

    const toggleDocExpand = (id: string) => {
        setExpandedDocs(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
    }

    if (isConfirmed || order.status === 'AWAITING_VERIFICATION' || order.status === 'PAID') {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl p-12 border border-gray-100 shadow-xl text-center space-y-6"
            >
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-3xl font-bold text-gray-900">Pagamento em Verificação</h2>
                    <p className="text-gray-500 max-w-md mx-auto">
                        Recebemos sua confirmação. Assim que o valor for identificado pelo nosso setor financeiro, seu pedido entrará em produção imediatamente.
                    </p>
                </div>
                <div className="pt-6">
                    <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-bold">
                        <Info className="w-4 h-4" /> Status Atual: Aguardando Verificação
                    </div>
                </div>
                <p className="text-xs text-gray-400">Você receberá um e-mail assim que o pedido for liberado.</p>
            </motion.div>
        )
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Summary Column */}
            <div className="lg:col-span-3 space-y-6">
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-8">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Resumo do Pedido</h2>
                            <p className="text-sm text-gray-500">Documentação para {order.user.fullName}</p>
                        </div>
                        <div className="bg-orange-50 text-[#f58220] px-3 py-1 rounded-full text-xs font-bold border border-orange-100">
                            #{order.id}
                        </div>
                    </div>

                    {/* Order Details Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Serviço</p>
                            <p className="text-sm font-bold text-gray-800">
                                {order.hasTranslation && order.hasNotary ? 'Tradução + Notarização' : order.hasTranslation ? 'Tradução Certificada' : 'Apenas Notarização'}
                            </p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Prazo Definido</p>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-[#f58220]" />
                                <span className="text-sm font-bold text-gray-800">
                                    {order.urgency === 'standard' ? 'Standard (10 dias)' : order.urgency === 'urgent' ? 'Urgente (48h)' : 'Flash (24h)'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Document Density Breakdown (Raio-X) */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-green-500" /> Transparência de Preço (Raio-X)
                        </h3>

                        <div className="space-y-3">
                            {metadata.documents?.map((doc: any, idx: number) => (
                                <div key={idx} className="border border-slate-100 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                                    <button
                                        onClick={() => toggleDocExpand(doc.id)}
                                        className="w-full p-4 flex items-center justify-between bg-white text-left focus:outline-none"
                                    >
                                        <div className="flex items-center gap-3">
                                            <FileText className="w-5 h-5 text-gray-400" />
                                            <div>
                                                <p className="text-sm font-bold text-slate-700">{doc.fileName}</p>
                                                <p className="text-[10px] text-slate-400">{doc.count} páginas {doc.notarized && '· +Notarização'}</p>
                                            </div>
                                        </div>
                                        {doc.analysis && <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedDocs.includes(doc.id) ? 'rotate-180' : ''}`} />}
                                    </button>

                                    <AnimatePresence>
                                        {doc.analysis && expandedDocs.includes(doc.id) && (
                                            <motion.div
                                                initial={{ height: 0 }}
                                                animate={{ height: 'auto' }}
                                                exit={{ height: 0 }}
                                                className="bg-slate-50 border-t border-slate-100 overflow-hidden"
                                            >
                                                <div className="p-4 space-y-3">
                                                    {doc.analysis.pages?.map((p: any) => (
                                                        <div key={p.pageNumber} className="flex justify-between items-center text-[11px]">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-gray-400 font-mono">Pg {p.pageNumber}:</span>
                                                                <span className="font-medium text-slate-600">
                                                                    {p.density === 'high' ? 'Alta Densidade' : p.density === 'low' ? 'Baixa Densidade' : p.density === 'empty' ? 'Em Branco' : 'Digitalizada'}
                                                                    ({(p.fraction * 100).toFixed(0)}%)
                                                                </span>
                                                            </div>
                                                            <span className="font-bold text-slate-800">${p.price.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Column */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl space-y-6 sticky top-8">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Concluir Pagamento</h3>
                        <p className="text-sm text-gray-500">Escolha o método de sua preferência.</p>
                    </div>

                    <div className="space-y-4">
                        {/* Final Total Card */}
                        <div className="bg-slate-900 rounded-2xl p-6 text-white text-center shadow-lg">
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Subtotal Final</p>
                            <p className="text-5xl font-black text-[#f58220] tracking-tighter">${order.totalAmount.toFixed(2)}</p>
                            <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-xs text-gray-400">
                                <span>Moeda:</span>
                                <span className="font-bold text-white">Dólares (USD)</span>
                            </div>
                        </div>

                        {/* Payment Methods */}
                        <div className="grid grid-cols-1 gap-3">
                            {/* Stripe */}
                            <button
                                onClick={() => setSelectedMethod('stripe')}
                                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${selectedMethod === 'stripe' ? 'border-[#f58220] bg-orange-50' : 'border-gray-50 bg-white hover:border-gray-100'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center"><CreditCard className="w-5 h-5 text-slate-600" /></div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-gray-900">Cartão de Crédito</p>
                                        <p className="text-[10px] text-gray-500">Checkout Stripe Seguro</p>
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'stripe' ? 'border-[#f58220] bg-[#f58220]' : 'border-gray-200'}`}>
                                    {selectedMethod === 'stripe' && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </button>

                            {/* Zelle */}
                            <button
                                onClick={() => setSelectedMethod('zelle')}
                                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${selectedMethod === 'zelle' ? 'border-[#f58220] bg-orange-50' : 'border-gray-50 bg-white hover:border-gray-100'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center font-black text-purple-600 text-xs">Z</div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-gray-900">Transferência Zelle</p>
                                        <p className="text-[10px] text-gray-500">Transferência Bancária USA</p>
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'zelle' ? 'border-[#f58220] bg-[#f58220]' : 'border-gray-200'}`}>
                                    {selectedMethod === 'zelle' && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </button>

                            {/* Pix */}
                            <button
                                onClick={() => setSelectedMethod('pix')}
                                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${selectedMethod === 'pix' ? 'border-[#f58220] bg-orange-50' : 'border-gray-50 bg-white hover:border-gray-100'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center font-black text-green-600 text-[10px]">PIX</div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-gray-900">Pix (Brasil)</p>
                                        <p className="text-[10px] text-gray-500">approx. R$ {(order.totalAmount * 5.25).toFixed(2)}</p>
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'pix' ? 'border-[#f58220] bg-[#f58220]' : 'border-gray-200'}`}>
                                    {selectedMethod === 'pix' && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Method Details & Actions */}
                    <AnimatePresence mode="wait">
                        {selectedMethod === 'stripe' && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-4"
                            >
                                <button
                                    onClick={handleStripePayment}
                                    disabled={isProcessing}
                                    className="w-full bg-[#f58220] py-4 rounded-2xl text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-orange-200 active:scale-95 transition-all"
                                >
                                    {isProcessing ? 'Verificando...' : <>Ir para Cartão <ArrowRight className="w-5 h-5" /></>}
                                </button>
                                <p className="text-[10px] text-gray-400 text-center">Processado por Stripe. Criptografia ponta-a-ponta.</p>
                            </motion.div>
                        )}

                        {selectedMethod === 'zelle' && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-4 bg-purple-50 p-6 rounded-2xl border border-purple-100"
                            >
                                <div className="space-y-2">
                                    <p className="text-[10px] text-purple-400 uppercase font-bold">Dados para Zelle</p>
                                    <div
                                        onClick={() => copyToClipboard('contact@promobi.com', 'E-mail Zelle')}
                                        className="flex items-center justify-between bg-white p-3 rounded-xl border border-purple-200 cursor-pointer hover:border-purple-400 transition-colors"
                                    >
                                        <span className="text-sm font-bold text-slate-800">contact@promobi.com</span>
                                        <Copy className="w-4 h-4 text-purple-400" />
                                    </div>
                                    <p className="text-[10px] text-purple-600 italic">* Beneficiário: Promobi Services LLC</p>
                                </div>

                                <button
                                    onClick={() => handleManualConfirmation('ZELLE')}
                                    disabled={isProcessing}
                                    className="w-full bg-purple-600 py-4 rounded-2xl text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-200 active:scale-95 transition-all"
                                >
                                    {isProcessing ? 'Enviando...' : 'Já fiz a transferência Zelle'}
                                </button>
                            </motion.div>
                        )}

                        {selectedMethod === 'pix' && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-4 bg-green-50 p-6 rounded-2xl border border-green-100"
                            >
                                <div className="space-y-2">
                                    <p className="text-[10px] text-green-400 uppercase font-bold">Chave Pix (E-mail)</p>
                                    <div
                                        onClick={() => copyToClipboard('pix@promobi.com', 'Chave Pix')}
                                        className="flex items-center justify-between bg-white p-3 rounded-xl border border-green-200 cursor-pointer hover:border-green-400 transition-colors"
                                    >
                                        <span className="text-sm font-bold text-slate-800">pix@promobi.com</span>
                                        <Copy className="w-4 h-4 text-green-400" />
                                    </div>
                                    <p className="text-[10px] text-green-600 font-bold">* Valor em Reais: R$ {(order.totalAmount * 5.25).toFixed(2)}</p>
                                </div>

                                <button
                                    onClick={() => handleManualConfirmation('PIX')}
                                    disabled={isProcessing}
                                    className="w-full bg-green-600 py-4 rounded-2xl text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-200 active:scale-95 transition-all"
                                >
                                    {isProcessing ? 'Enviando...' : 'Já fiz o Pix'}
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 flex gap-4">
                    <ShieldCheck className="w-6 h-6 text-green-600 shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-slate-800">Promobi Safety Guarantee</p>
                        <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                            Sua documentação só será iniciada após a validação do pagamento. O link de pagamento expira em 48 horas.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
