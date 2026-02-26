// app/admin/dashboard/page.tsx — ClickUp-style Dashboard (Server Component)

import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
    DollarSign,
    Layers,
    Clock,
    TrendingUp,
    ArrowRight,
    CheckCircle2,
    FileText,
    Zap,
    BarChart2,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(val)
}

function getGreeting(): string {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
    const user = await getCurrentUser()
    if (!user) redirect('/login')

    // ── Queries ──────────────────────────────────────────────────────────────
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [activeOrders, pendingOrders, monthRevenue, recentOrders] = await Promise.all([
        prisma.order.count({
            where: {
                status: {
                    in: ['TRANSLATING', 'READY_FOR_REVIEW', 'NOTARIZING', 'MANUAL_TRANSLATION_NEEDED'],
                },
            },
        }),
        prisma.order.count({
            where: {
                status: { in: ['PENDING', 'PENDING_PAYMENT', 'AWAITING_VERIFICATION'] },
            },
        }),
        prisma.order.aggregate({
            _sum: { totalAmount: true },
            where: {
                status: {
                    notIn: ['PENDING', 'PENDING_PAYMENT', 'CANCELLED', 'AWAITING_VERIFICATION'],
                },
                createdAt: { gte: monthStart },
            },
        }),
        prisma.order.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { fullName: true } } },
            where: { status: { not: 'CANCELLED' } },
        }),
    ])

    const revenue = monthRevenue._sum.totalAmount ?? 0

    const stats = [
        {
            label: 'Pedidos em Andamento',
            value: activeOrders.toString(),
            sub: 'em tradução ou revisão',
            icon: Layers,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            border: 'border-blue-100',
            href: '/admin/workbench',
        },
        {
            label: 'Orçamentos Pendentes',
            value: pendingOrders.toString(),
            sub: 'aguardando pagamento',
            icon: Clock,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            border: 'border-amber-100',
            href: '/admin/orders',
        },
        {
            label: 'Faturamento do Mês',
            value: fmt(revenue),
            sub: 'pedidos confirmados em ' + new Date().toLocaleDateString('pt-BR', { month: 'long' }),
            icon: DollarSign,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
            href: '/admin/finance',
        },
    ]

    const STATUS_MAP: Record<string, { label: string; cls: string }> = {
        PENDING:               { label: 'Pendente',          cls: 'bg-yellow-100 text-yellow-700' },
        PENDING_PAYMENT:       { label: 'Ag. Pagamento',     cls: 'bg-yellow-100 text-yellow-700' },
        AWAITING_VERIFICATION: { label: 'Ag. Verificação',   cls: 'bg-blue-100 text-blue-700' },
        TRANSLATING:           { label: 'Em Tradução',       cls: 'bg-indigo-100 text-indigo-700' },
        READY_FOR_REVIEW:      { label: 'Em Revisão',        cls: 'bg-teal-100 text-teal-700' },
        NOTARIZING:            { label: 'Notarizando',       cls: 'bg-purple-100 text-purple-700' },
        MANUAL_TRANSLATION_NEEDED: { label: 'Manual',        cls: 'bg-orange-100 text-orange-700' },
        COMPLETED:             { label: 'Concluído',         cls: 'bg-green-100 text-green-700' },
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

                {/* ── Welcome Header ─────────────────────────────────────── */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">
                            {new Date().toLocaleDateString('pt-BR', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                            })}
                        </p>
                        <h1 className="text-3xl font-bold text-slate-900">
                            {getGreeting()}, {user.fullName?.split(' ')[0] ?? 'Operador'} 👋
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            Resumo operacional da Promobi.
                        </p>
                    </div>

                    <Link
                        href="/admin/workbench"
                        className="flex items-center gap-2 bg-[#f58220] hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm hover:shadow-md"
                    >
                        <Zap className="h-4 w-4" />
                        Mesa de Operações
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>

                {/* ── Quick Stats ────────────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {stats.map((s) => {
                        const Icon = s.icon
                        return (
                            <Link key={s.label} href={s.href} className="group block">
                                <div
                                    className={`bg-white rounded-2xl border ${s.border} shadow-sm p-6 hover:shadow-md transition-all`}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={`p-2.5 ${s.bg} rounded-xl`}>
                                            <Icon className={`h-5 w-5 ${s.color}`} />
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                    </div>
                                    <div className={`text-3xl font-bold ${s.color} mb-1`}>
                                        {s.value}
                                    </div>
                                    <p className="text-sm font-semibold text-slate-700">{s.label}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
                                </div>
                            </Link>
                        )
                    })}
                </div>

                {/* ── Bottom Row ─────────────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Activity Feed */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="h-4 w-4 text-slate-400" />
                                Pedidos Recentes
                            </h2>
                            <Link
                                href="/admin/orders"
                                className="text-xs text-[#f58220] font-bold hover:underline"
                            >
                                Ver todos →
                            </Link>
                        </div>

                        <div className="space-y-2">
                            {recentOrders.length === 0 && (
                                <p className="text-sm text-slate-400 text-center py-8">
                                    Nenhum pedido ainda.
                                </p>
                            )}
                            {recentOrders.map((order) => {
                                const st = STATUS_MAP[order.status] ?? {
                                    label: order.status,
                                    cls: 'bg-slate-100 text-slate-600',
                                }
                                return (
                                    <Link
                                        key={order.id}
                                        href={`/admin/orders/${order.id}`}
                                        className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                                                #{order.id}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800 group-hover:text-[#f58220] transition-colors">
                                                    {order.user?.fullName ?? 'Cliente'}
                                                </p>
                                                <p className="text-xs text-slate-400">
                                                    {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                        </div>
                                        <span
                                            className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${st.cls}`}
                                        >
                                            {st.label}
                                        </span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-5">
                            <BarChart2 className="h-4 w-4 text-slate-400" />
                            Ações Rápidas
                        </h2>

                        <div className="space-y-2">
                            {([
                                {
                                    label: 'Mesa de Operações',
                                    desc: 'Fila de tradução e revisão',
                                    href: '/admin/workbench',
                                    icon: Zap,
                                    color: 'text-[#f58220]',
                                    bg: 'bg-orange-50',
                                },
                                {
                                    label: 'Quadro de Pedidos',
                                    desc: 'Visão geral de todos os pedidos',
                                    href: '/admin/orders',
                                    icon: Layers,
                                    color: 'text-blue-600',
                                    bg: 'bg-blue-50',
                                },
                                {
                                    label: 'Novo Orçamento Manual',
                                    desc: 'Crie um pedido para um cliente',
                                    href: '/admin/concierge',
                                    icon: FileText,
                                    color: 'text-purple-600',
                                    bg: 'bg-purple-50',
                                },
                                {
                                    label: 'Financeiro',
                                    desc: 'Relatórios e pagamentos',
                                    href: '/admin/finance',
                                    icon: TrendingUp,
                                    color: 'text-emerald-600',
                                    bg: 'bg-emerald-50',
                                },
                            ] as const).map((action) => {
                                const Icon = action.icon
                                return (
                                    <Link
                                        key={action.label}
                                        href={action.href}
                                        className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                                    >
                                        <div className={`p-2.5 ${action.bg} rounded-xl shrink-0`}>
                                            <Icon className={`h-4 w-4 ${action.color}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 group-hover:text-[#f58220] transition-colors">
                                                {action.label}
                                            </p>
                                            <p className="text-xs text-slate-400 truncate">
                                                {action.desc}
                                            </p>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
                                    </Link>
                                )
                            })}
                        </div>

                        <div className="mt-5 pt-5 border-t border-slate-100 flex items-center gap-3">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                            <p className="text-sm text-slate-500">
                                <span className="font-bold text-slate-700">{fmt(revenue)}</span>{' '}
                                faturado este mês
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
