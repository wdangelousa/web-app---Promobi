'use client'

import { useState, useEffect } from 'react'
import { getDashboardMetrics } from '../../actions/getDashboardMetrics'
import { DollarSign, ShoppingBag, TrendingUp, Calendar, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function AdminDashboard() {
    const [period, setPeriod] = useState<'today' | '7days' | 'month'>('month')
    const [metrics, setMetrics] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadMetrics()
    }, [period])

    const loadMetrics = async () => {
        setLoading(true)
        try {
            const result = await getDashboardMetrics(period)
            if (result.success) {
                setMetrics(result.data)
            }
        } catch (error) {
            console.error("Failed to load metrics", error)
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (val: number, currency: 'USD' | 'BRL') => {
        return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'pt-BR', {
            style: 'currency',
            currency: currency
        }).format(val)
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
            {/* Header */}
            <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Link href="/admin" className="text-slate-400 hover:text-slate-600 transition-colors">
                            <ArrowLeft className="h-6 w-6" />
                        </Link>
                        Dashboard Executivo
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Visão geral de performance da Promobi.</p>
                </div>

                <div className="bg-white rounded-lg p-1 border border-gray-200 shadow-sm flex gap-1">
                    <button onClick={() => setPeriod('today')} className={`px-4 py-2 text-sm rounded-md transition-all ${period === 'today' ? 'bg-[#f58220] text-white font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>Hoje</button>
                    <button onClick={() => setPeriod('7days')} className={`px-4 py-2 text-sm rounded-md transition-all ${period === '7days' ? 'bg-[#f58220] text-white font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>7 Dias</button>
                    <button onClick={() => setPeriod('month')} className={`px-4 py-2 text-sm rounded-md transition-all ${period === 'month' ? 'bg-[#f58220] text-white font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>Este Mês</button>
                </div>
            </div>

            {loading ? (
                <div className="max-w-7xl mx-auto h-64 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#f58220]"></div>
                </div>
            ) : metrics && (
                <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Revenue Card */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-green-50 text-green-600 rounded-xl">
                                    <DollarSign className="h-6 w-6" />
                                </div>
                                <h3 className="text-gray-500 font-medium">Faturamento Total</h3>
                            </div>
                            <div className="space-y-1">
                                <div className="text-2xl font-bold text-slate-800">
                                    {formatCurrency(metrics.revenue.usd, 'USD')}
                                </div>
                                <div className="text-lg font-bold text-slate-500">
                                    {formatCurrency(metrics.revenue.brl, 'BRL')}
                                </div>
                            </div>
                        </div>

                        {/* Open Orders */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                                    <ShoppingBag className="h-6 w-6" />
                                </div>
                                <h3 className="text-gray-500 font-medium">Pedidos em Aberto</h3>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-bold text-slate-800">{metrics.openOrders}</span>
                                <span className="text-sm text-slate-400">ativos agora</span>
                            </div>
                        </div>

                        {/* Ticket Avg */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                                    <TrendingUp className="h-6 w-6" />
                                </div>
                                <h3 className="text-gray-500 font-medium">Ticket Médio (USD)</h3>
                            </div>
                            <div className="text-3xl font-bold text-slate-800">
                                {formatCurrency(metrics.ticketAvgUSD, 'USD')}
                            </div>
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                        {/* Top Services */}
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-slate-800 mb-6">Serviços Mais Vendidos</h3>
                            <div className="space-y-4">
                                {metrics.topServices.map((svc: any, i: number) => (
                                    <div key={i} className="group">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="capitalize font-medium text-slate-700">{svc.name.replace(/-/g, ' ')}</span>
                                            <span className="text-slate-500">{svc.count} pedidos</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-[#f58220] rounded-full transition-all duration-1000 ease-out group-hover:bg-orange-600"
                                                style={{ width: `${(svc.count / Math.max(...metrics.topServices.map((s: any) => s.count))) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                ))}
                                {metrics.topServices.length === 0 && (
                                    <p className="text-center text-gray-400 py-4">Nenhum dado neste período.</p>
                                )}
                            </div>
                        </div>

                        {/* Payment Split */}
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-slate-800 mb-6">Método de Pagamento</h3>
                            <div className="flex flex-col gap-4">
                                {metrics.paymentSplit.map((item: any) => (
                                    <div key={item.paymentProvider} className="flex items-center p-4 bg-gray-50 rounded-xl border border-gray-100 justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${item.paymentProvider === 'STRIPE' ? 'bg-[#635BFF]' : 'bg-[#32BCAD]'}`}></div>
                                            <span className="font-bold text-slate-700">
                                                {item.paymentProvider === 'STRIPE' ? 'Stripe (USA)' : 'Parcelado (Brasil)'}
                                            </span>
                                        </div>
                                        <div className="font-bold text-slate-900">{item._count.id} pedidos</div>
                                    </div>
                                ))}
                                {metrics.paymentSplit.length === 0 && (
                                    <p className="text-center text-gray-400 py-4">Nenhum dado neste período.</p>
                                )}
                            </div>
                        </div>

                    </div>

                </div>
            )}
        </div>
    )
}
