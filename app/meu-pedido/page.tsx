'use client'

import { useState } from 'react'
import { Search, Loader2, CheckCircle, Clock, FileText, Truck, AlertCircle } from 'lucide-react'
import { getOrderStatus } from '../actions/getOrderStatus'

// Helper to format date
const formatDate = (dateString: Date) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

// Helper to estimate delivery based on urgency
const getEstimatedDelivery = (createdAt: Date, urgency: string) => {
    const date = new Date(createdAt);
    if (urgency === 'rushes') { // 12h
        date.setHours(date.getHours() + 12);
    } else if (urgency === 'urgent') { // 24h
        date.setHours(date.getHours() + 24);
    } else { // Normal (3-5 days) - avg 4 days
        date.setDate(date.getDate() + 4);
    }
    return formatDate(date);
}

export default function OrderTrackingPage() {
    const [searchId, setSearchId] = useState('')
    const [loading, setLoading] = useState(false)
    const [order, setOrder] = useState<any>(null)
    const [error, setError] = useState('')

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!searchId) return

        setLoading(true)
        setError('')
        setOrder(null)

        try {
            const numericId = parseInt(searchId)
            const result = await getOrderStatus(numericId)

            if (result.success && result.order) {
                setOrder(result.order)
            } else {
                setError('Pedido não encontrado. Verifique o número enviado no seu e-mail de confirmação.')
            }
        } catch (err) {
            setError('Erro ao buscar pedido. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    // Progress Logic
    // Steps: 1. Recebido -> 2. Em Tradução -> 3. Notarização -> 4. Concluído
    const getActiveStep = (status: string) => {
        if (status === 'PENDING') return 1;
        if (status === 'TRANSLATING') return 2;
        if (status === 'NOTARIZING') return 3;
        if (status === 'COMPLETED') return 4;
        return 1;
    }

    const activeStep = order ? getActiveStep(order.status) : 0;

    // Filter Steps based on Service Flags
    const showTranslation = order?.hasTranslation ?? true; // Default true if not present (legacy)
    const showNotary = order?.hasNotary ?? false;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
            {/* Header / Brand */}
            <div className="bg-white p-4 shadow-sm border-b border-gray-100 flex justify-center">
                <h1 className="text-xl font-bold text-gray-900">Promobi Rastreador</h1>
            </div>

            <div className="flex-1 max-w-lg mx-auto w-full p-4 md:pt-12">

                {/* Search Box */}
                <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 text-center">Acompanhe sua Tradução</h2>
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <input
                                type="number"
                                placeholder="Número do Pedido (Ex: 1024)"
                                value={searchId}
                                onChange={(e) => setSearchId(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#f58220] transition-all"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !searchId}
                            className="bg-[#f58220] hover:bg-orange-600 text-white p-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[50px]"
                        >
                            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                        </button>
                    </form>
                    {error && (
                        <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}
                </div>

                {/* Result */}
                {order && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Progress Tracker */}
                        <div className="bg-white rounded-2xl shadow-md p-6">
                            <div className="mb-6 pb-2 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                                    Progresso do Pedido #{order.id}
                                </h3>
                                <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded bg-orange-100 text-[#f58220]`}>
                                    {showTranslation && showNotary ? 'Tradução + Notarização' : showTranslation ? 'Tradução Certificada' : 'Notarização Oficial'}
                                </span>
                            </div>

                            <div className="relative flex flex-col gap-8 pl-4 border-l-2 border-gray-100 ml-4 md:ml-6">
                                {/* Step 1: Recebido (Always) */}
                                <div className="relative">
                                    <div className={`absolute -left-[25px] w-8 h-8 rounded-full border-4 border-white flex items-center justify-center ${activeStep >= 1 ? 'bg-green-500 text-white shadow-green-200 shadow-md' : 'bg-gray-200 text-gray-400'}`}>
                                        <CheckCircle className="h-4 w-4" />
                                    </div>
                                    <div className={`ml-4 ${activeStep >= 1 ? 'opacity-100' : 'opacity-40'}`}>
                                        <h4 className="font-bold text-sm">Recebido</h4>
                                        <p className="text-xs text-gray-500">Pagamento confirmado e análise iniciada.</p>
                                        <p className="text-[10px] text-gray-400 mt-1">{formatDate(order.createdAt)}</p>
                                    </div>
                                </div>

                                {/* Step 2: Em Tradução (Only if hasTranslation) */}
                                {showTranslation && (
                                    <div className="relative">
                                        <div className={`absolute -left-[25px] w-8 h-8 rounded-full border-4 border-white flex items-center justify-center transition-all ${activeStep >= 2 ? 'bg-[#32BCAD] text-white shadow-teal-200 shadow-md' : 'bg-gray-200 text-gray-400'} ${activeStep === 2 || (activeStep === 3 && !showNotary) ? 'animate-pulse' : ''}`}>
                                            {activeStep > 2 ? <CheckCircle className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                                        </div>
                                        <div className={`ml-4 ${activeStep >= 2 ? 'opacity-100' : 'opacity-40'}`}>
                                            <h4 className="font-bold text-sm">Em Tradução</h4>
                                            <p className="text-xs text-gray-500">Documento sendo traduzido por especialista.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Step 3: Notarização (Only if hasNotary) */}
                                {showNotary && (
                                    <div className="relative">
                                        <div className={`absolute -left-[25px] w-8 h-8 rounded-full border-4 border-white flex items-center justify-center transition-all ${activeStep >= 3 ? 'bg-blue-500 text-white shadow-blue-200 shadow-md' : 'bg-gray-200 text-gray-400'} ${activeStep === 3 ? 'animate-pulse' : ''}`}>
                                            {activeStep > 3 ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                        </div>
                                        <div className={`ml-4 ${activeStep >= 3 ? 'opacity-100' : 'opacity-40'}`}>
                                            <h4 className="font-bold text-sm">Notarização</h4>
                                            <p className="text-xs text-gray-500">Aplicação de selos e assinaturas oficiais.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Step 4: Concluído (Always) */}
                                <div className="relative">
                                    <div className={`absolute -left-[25px] w-8 h-8 rounded-full border-4 border-white flex items-center justify-center ${activeStep >= 4 ? 'bg-green-600 text-white shadow-green-200 shadow-md' : 'bg-gray-200 text-gray-400'}`}>
                                        {activeStep >= 4 ? <Truck className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                                    </div>
                                    <div className={`ml-4 ${activeStep >= 4 ? 'opacity-100' : 'opacity-40'}`}>
                                        <h4 className="font-bold text-sm">Concluído</h4>
                                        <p className="text-xs text-gray-500">Pronto para envio ou download.</p>

                                        {order.uspsTracking && (
                                            <a
                                                href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${order.uspsTracking}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-2 inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors"
                                            >
                                                <Truck className="h-3 w-3" />
                                                Rastrear USPS: {order.uspsTracking}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Details Card */}
                        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 text-sm">
                            <h4 className="font-bold text-gray-700 mb-2">Detalhes do Serviço</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Serviço Principal:</span>
                                    <span className="font-medium text-gray-900 capitalize">
                                        {showTranslation ? 'Tradução' : 'Notarização'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Previsão de Entrega:</span>
                                    <span className="font-medium text-[#f58220]">
                                        {getEstimatedDelivery(order.createdAt, order.urgency)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Urgência:</span>
                                    <span className="font-medium text-gray-900 capitalize">
                                        {order.urgency === 'normal' ? 'Padrão (3-5 dias)' : order.urgency === 'urgent' ? 'Urgente (24h)' : 'Super Urgente (12h)'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
