// app/admin/finance/page.tsx — ClickUp-style Financial Dashboard (Server Component)

import { getCurrentUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import {
    DollarSign,
    TrendingUp,
    Clock,
    CheckCircle2,
    ArrowRight,
    CreditCard,
    CalendarClock,
    Banknote,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function fmt(val: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(val)
}

function fmtDate(date: Date | string) {
    return new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

const PROVIDER_LABEL: Record<string, { label: string; cls: string }> = {
    STRIPE:         { label: 'Cartão',        cls: 'bg-indigo-100 text-indigo-700' },
    ZELLE:          { label: 'Zelle',          cls: 'bg-purple-100 text-purple-700' },
    PIX:            { label: 'Pix',            cls: 'bg-green-100 text-green-700' },
    PARCELADO_USA:  { label: 'Parcelado USA',  cls: 'bg-teal-100 text-teal-700' },
    MANUAL:         { label: 'Manual',         cls: 'bg-gray-100 text-gray-600' },
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
    AWAITING_VERIFICATION: { label: 'Ag. Verificação', cls: 'bg-yellow-100 text-yellow-700' },
    TRANSLATING:           { label: 'Pago · Em Prod.', cls: 'bg-blue-100 text-blue-700' },
    READY_FOR_REVIEW:      { label: 'Pago · Em Prod.', cls: 'bg-blue-100 text-blue-700' },
    NOTARIZING:            { label: 'Pago · Em Prod.', cls: 'bg-blue-100 text-blue-700' },
    MANUAL_TRANSLATION_NEEDED: { label: 'Pago · Em Prod.', cls: 'bg-blue-100 text-blue-700' },
    COMPLETED:             { label: 'Pago · Concluído', cls: 'bg-green-100 text-green-700' },
}

export default async function FinanceDashboard() {
    const currentUser = await getCurrentUser()
    const role = currentUser?.role as string | undefined

    if (!currentUser || (role !== 'FINANCIAL' && role !== 'OPERATIONS' && role !== 'ADMIN')) {
        redirect('/admin')
    }

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [orders, monthRevenue, pendingCount, completedCount] = await Promise.all([
        prisma.order.findMany({
            where: {
                status: { notIn: ['PENDING', 'PENDING_PAYMENT', 'CANCELLED'] },
            },
            include: { user: { select: { fullName: true, email: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        }),
        prisma.order.aggregate({
            _sum: { totalAmount: true },
            where: {
                status: { notIn: ['PENDING', 'PENDING_PAYMENT', 'CANCELLED', 'AWAITING_VERIFICATION'] },
                createdAt: { gte: monthStart },
            },
        }),
        prisma.order.count({
            where: { status: 'AWAITING_VERIFICATION' },
        }),
        prisma.order.count({
            where: { status: 'COMPLETED' },
        }),
    ])

    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0)
    const revenue = monthRevenue._sum.totalAmount ?? 0
    const avgTicket = orders.length > 0 ? totalRevenue / orders.length : 0

    const stats = [
        {
            label: 'Faturamento do Mês',
            value: fmt(revenue),
            sub: 'pedidos confirmados',
            icon: TrendingUp,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
        },
        {
            label: 'Ag. Verificação',
            value: pendingCount.toString(),
            sub: 'pagamentos a validar',
            icon: Clock,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            border: 'border-amber-100',
        },
        {
            label: 'Ticket Médio',
            value: fmt(avgTicket),
            sub: 'por pedido (total)',
            icon: DollarSign,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            border: 'border-blue-100',
        },
        {
            label: 'Pedidos Concluídos',
            value: completedCount.toString(),
            sub: 'entregues ao cliente',
            icon: CheckCircle2,
            color: 'text-green-600',
            bg: 'bg-green-50',
            border: 'border-green-100',
        },
    ]

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">
                            {new Date().toLocaleDateString('pt-BR', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                            })}
                        </p>
                        <h1 className="text-3xl font-bold text-slate-900">Dashboard Financeiro</h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            Conciliação de pagamentos e controle de receita.
                        </p>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {stats.map((s) => {
                        const Icon = s.icon
                        return (
                            <div
                                key={s.label}
                                className={`bg-white rounded-2xl border ${s.border} shadow-sm p-6`}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className={`p-2.5 ${s.bg} rounded-xl`}>
                                        <Icon className={`h-5 w-5 ${s.color}`} />
                                    </div>
                                </div>
                                <div className={`text-3xl font-bold ${s.color} mb-1`}>{s.value}</div>
                                <p className="text-sm font-semibold text-slate-700">{s.label}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
                            </div>
                        )
                    })}
                </div>

                {/* Transaction Table */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <Banknote className="h-4 w-4 text-slate-400" />
                            Transações
                        </h2>
                        <span className="text-xs text-slate-400 font-medium">{orders.length} registros</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[11px] text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Pedido</th>
                                    <th className="px-6 py-3 font-semibold">Cliente</th>
                                    <th className="px-6 py-3 font-semibold">Método</th>
                                    <th className="px-6 py-3 font-semibold">Status</th>
                                    <th className="px-6 py-3 font-semibold text-right">Total</th>
                                    <th className="px-6 py-3 font-semibold">Data</th>
                                    <th className="px-6 py-3 font-semibold sr-only">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {orders.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm">
                                            Nenhuma transação encontrada.
                                        </td>
                                    </tr>
                                )}
                                {orders.map((order) => {
                                    const provider = PROVIDER_LABEL[order.paymentProvider ?? ''] ?? {
                                        label: order.paymentProvider ?? '—',
                                        cls: 'bg-slate-100 text-slate-600',
                                    }
                                    const status = STATUS_MAP[order.status] ?? {
                                        label: order.status,
                                        cls: 'bg-slate-100 text-slate-600',
                                    }
                                    const ProviderIcon =
                                        order.paymentProvider === 'STRIPE' ? CreditCard :
                                        order.paymentProvider === 'PARCELADO_USA' ? CalendarClock :
                                        Banknote

                                    return (
                                        <tr key={order.id} className="hover:bg-slate-50/60 transition-colors group">
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                                    #{order.id}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="font-semibold text-slate-800 group-hover:text-[#f58220] transition-colors">
                                                    {order.user?.fullName ?? '—'}
                                                </p>
                                                <p className="text-[10px] text-slate-400 truncate max-w-[160px]">
                                                    {order.user?.email ?? ''}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${provider.cls}`}>
                                                    <ProviderIcon className="h-3 w-3" />
                                                    {provider.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${status.cls}`}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-slate-800">
                                                {fmt(order.totalAmount)}
                                            </td>
                                            <td className="px-6 py-4 text-slate-400 text-xs whitespace-nowrap">
                                                {fmtDate(order.createdAt)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <Link
                                                    href={`/admin/orders/${order.id}`}
                                                    className="text-[10px] text-slate-400 hover:text-[#f58220] font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    Ver <ArrowRight className="h-3 w-3" />
                                                </Link>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Table Footer */}
                    {orders.length > 0 && (
                        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <p className="text-xs text-slate-500">
                                Total acumulado (todos os pedidos):
                            </p>
                            <p className="text-sm font-bold text-slate-800">
                                {fmt(totalRevenue)}
                            </p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}
