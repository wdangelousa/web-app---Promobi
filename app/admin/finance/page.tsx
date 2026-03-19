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
    Banknote,
    Wallet,
} from 'lucide-react'
import { readFinancialLedger, type FinancialStatus } from '@/lib/manualPayment'

export const dynamic = 'force-dynamic'

function fmt(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0)
}

function fmtDate(date: Date | string | null | undefined) {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

const FINANCIAL_STATUS_VISUAL: Record<FinancialStatus, { label: string; cls: string }> = {
    unpaid: { label: 'Unpaid', cls: 'bg-slate-100 text-slate-700' },
    partially_paid: { label: 'Partially paid', cls: 'bg-amber-100 text-amber-800' },
    paid: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-800' },
    overpaid: { label: 'Overpaid', cls: 'bg-cyan-100 text-cyan-800' },
}

const METHOD_VISUAL: Record<string, { label: string; cls: string }> = {
    STRIPE: { label: 'Card', cls: 'bg-indigo-100 text-indigo-700' },
    ZELLE: { label: 'Zelle', cls: 'bg-purple-100 text-purple-700' },
    PIX: { label: 'Pix', cls: 'bg-green-100 text-green-700' },
    PARCELADO_USA: { label: 'Parcelado USA', cls: 'bg-teal-100 text-teal-700' },
    BANK_TRANSFER: { label: 'Bank transfer', cls: 'bg-slate-100 text-slate-700' },
    CASH: { label: 'Cash', cls: 'bg-slate-100 text-slate-700' },
    OTHER: { label: 'Other', cls: 'bg-slate-100 text-slate-700' },
    MANUAL: { label: 'Manual', cls: 'bg-slate-100 text-slate-700' },
}

export default async function FinanceDashboard() {
    const currentUser = await getCurrentUser()
    const role = currentUser?.role as string | undefined

    if (!currentUser || (role !== 'FINANCIAL' && role !== 'OPERATIONS' && role !== 'ADMIN')) {
        redirect('/admin')
    }

    const orders = await prisma.order.findMany({
        where: {
            status: { not: 'CANCELLED' },
        },
        include: { user: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 150,
    })

    const enrichedOrders = orders.map((order) => {
        const metadata =
            typeof order.metadata === 'string'
                ? (() => {
                      try {
                          const parsed = JSON.parse(order.metadata)
                          return parsed && typeof parsed === 'object' ? parsed : {}
                      } catch {
                          return {}
                      }
                  })()
                : {}

        const financial = readFinancialLedger(
            metadata as Record<string, unknown>,
            order.totalAmount ?? 0,
            typeof order.finalPaidAmount === 'number' ? order.finalPaidAmount : null,
        )

        const lastPayment = financial.payments[financial.payments.length - 1] ?? null
        const methodRaw = (lastPayment?.paymentMethod || order.paymentMethod || 'MANUAL').toUpperCase()
        const method = METHOD_VISUAL[methodRaw] ?? { label: methodRaw, cls: 'bg-slate-100 text-slate-700' }
        const statusVisual = FINANCIAL_STATUS_VISUAL[financial.status]

        return {
            ...order,
            financial,
            lastPayment,
            method,
            statusVisual,
        }
    })

    const totalReceived = enrichedOrders.reduce((sum, order) => sum + order.financial.amountReceived, 0)
    const totalRemaining = enrichedOrders.reduce((sum, order) => sum + order.financial.remainingBalance, 0)
    const partiallyPaidCount = enrichedOrders.filter((o) => o.financial.status === 'partially_paid').length
    const fullyPaidCount = enrichedOrders.filter(
        (o) => o.financial.status === 'paid' || o.financial.status === 'overpaid',
    ).length
    const unpaidCount = enrichedOrders.filter((o) => o.financial.status === 'unpaid').length

    const stats = [
        {
            label: 'Amount Received',
            value: fmt(totalReceived),
            sub: 'manual + automatic records',
            icon: TrendingUp,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
        },
        {
            label: 'Open Balance',
            value: fmt(totalRemaining),
            sub: 'remaining receivables',
            icon: Wallet,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            border: 'border-amber-100',
        },
        {
            label: 'Partially Paid',
            value: partiallyPaidCount.toString(),
            sub: 'orders in installments',
            icon: Clock,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            border: 'border-blue-100',
        },
        {
            label: 'Fully Paid',
            value: fullyPaidCount.toString(),
            sub: `${unpaidCount} unpaid`,
            icon: CheckCircle2,
            color: 'text-green-600',
            bg: 'bg-green-50',
            border: 'border-green-100',
        },
    ]

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">
                            {new Date().toLocaleDateString('pt-BR', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                            })}
                        </p>
                        <h1 className="text-3xl font-bold text-slate-900">Finance Dashboard</h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            Financial status is tracked independently from operational workflow status.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {stats.map((stat) => {
                        const Icon = stat.icon
                        return (
                            <div
                                key={stat.label}
                                className={`bg-white rounded-2xl border ${stat.border} shadow-sm p-6`}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className={`p-2.5 ${stat.bg} rounded-xl`}>
                                        <Icon className={`h-5 w-5 ${stat.color}`} />
                                    </div>
                                </div>
                                <div className={`text-3xl font-bold ${stat.color} mb-1`}>{stat.value}</div>
                                <p className="text-sm font-semibold text-slate-700">{stat.label}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
                            </div>
                        )
                    })}
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <Banknote className="h-4 w-4 text-slate-400" />
                            Payment Ledger
                        </h2>
                        <span className="text-xs text-slate-400 font-medium">
                            {enrichedOrders.length} orders
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[11px] text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Order</th>
                                    <th className="px-6 py-3 font-semibold">Client</th>
                                    <th className="px-6 py-3 font-semibold">Financial status</th>
                                    <th className="px-6 py-3 font-semibold text-right">Total</th>
                                    <th className="px-6 py-3 font-semibold text-right">Received</th>
                                    <th className="px-6 py-3 font-semibold text-right">Remaining</th>
                                    <th className="px-6 py-3 font-semibold">Installments</th>
                                    <th className="px-6 py-3 font-semibold">Last payment</th>
                                    <th className="px-6 py-3 font-semibold sr-only">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {enrichedOrders.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-slate-400 text-sm">
                                            No financial records found.
                                        </td>
                                    </tr>
                                )}
                                {enrichedOrders.map((order) => (
                                    <tr
                                        key={order.id}
                                        className="hover:bg-slate-50/60 transition-colors group align-top"
                                    >
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                                #{order.id}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="font-semibold text-slate-800 group-hover:text-[#f58220] transition-colors">
                                                {order.user?.fullName ?? '—'}
                                            </p>
                                            <p className="text-[10px] text-slate-400 truncate max-w-[180px]">
                                                {order.user?.email ?? ''}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full ${order.statusVisual.cls}`}
                                            >
                                                {order.statusVisual.label}
                                            </span>
                                            <p className="mt-1 text-[10px] text-slate-500">
                                                workflow: {order.status}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 text-right font-semibold text-slate-700">
                                            {fmt(order.totalAmount)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-emerald-700">
                                            {fmt(order.financial.amountReceived)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-semibold text-amber-700">
                                            {fmt(order.financial.remainingBalance)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="space-y-1">
                                                <p className="text-xs font-semibold text-slate-700">
                                                    {order.financial.payments.length} record(s)
                                                </p>
                                                {order.lastPayment && (
                                                    <span
                                                        className={`inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-full ${order.method.cls}`}
                                                    >
                                                        {order.method.label}
                                                    </span>
                                                )}
                                                {order.financial.payments
                                                    .slice(-2)
                                                    .reverse()
                                                    .map((payment) => (
                                                        <p
                                                            key={payment.id}
                                                            className="text-[10px] text-slate-500 leading-tight"
                                                        >
                                                            {fmtDate(payment.paymentDate)} · {fmt(payment.amount)}
                                                        </p>
                                                    ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 text-xs whitespace-nowrap">
                                            {order.lastPayment
                                                ? `${fmtDate(order.lastPayment.paymentDate)} · ${fmt(order.lastPayment.amount)}`
                                                : 'No payments'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Link
                                                href={`/admin/orders/${order.id}`}
                                                className="text-[10px] text-slate-400 hover:text-[#f58220] font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                View <ArrowRight className="h-3 w-3" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {enrichedOrders.length > 0 && (
                        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <p className="text-xs text-slate-500">
                                Financial totals for listed orders:
                            </p>
                            <div className="flex items-center gap-5 text-sm">
                                <p className="font-bold text-emerald-700 flex items-center gap-1">
                                    <DollarSign className="h-3.5 w-3.5" />
                                    {fmt(totalReceived)} received
                                </p>
                                <p className="font-bold text-amber-700">
                                    {fmt(totalRemaining)} remaining
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
