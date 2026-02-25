import prisma from '@/lib/prisma';
import { Eye, FileText, Calendar, User, Plus } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUser } from '@/app/actions/auth';
import { redirect } from 'next/navigation';
import { Role, OrderStatus } from '@prisma/client';
import { normalizeOrder } from '@/lib/orderAdapter';

export const dynamic = 'force-dynamic';

// Status chips with labels, colors and priority order for Isabele's workflow
const STATUS_CHIPS = [
    { value: 'ALL',                      label: 'Todos',              color: 'bg-gray-100 text-gray-700 border-gray-200' },
    { value: 'MANUAL_TRANSLATION_NEEDED', label: '⚠️ Tradução Manual', color: 'bg-orange-100 text-orange-800 border-orange-300' },
    { value: 'READY_FOR_REVIEW',          label: '✅ Pronto p/ Revisão', color: 'bg-teal-100 text-teal-800 border-teal-300' },
    { value: 'TRANSLATING',               label: 'Em Tradução (IA)',   color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    { value: 'PAID',                      label: 'Pago',               color: 'bg-green-100 text-green-800 border-green-200' },
    { value: 'PENDING',                   label: 'Pendente',           color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    { value: 'NOTARIZING',                label: 'Notarizando',        color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { value: 'COMPLETED',                 label: 'Concluído',          color: 'bg-blue-100 text-blue-800 border-blue-200' },
];

const getStatusColor = (status: string) => {
    const chip = STATUS_CHIPS.find(c => c.value === status);
    return chip?.color ?? 'bg-gray-100 text-gray-800 border-gray-200';
};

const formatCurrency = (amount: number) => {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
            typeof amount === 'number' ? amount : 0
        );
    } catch {
        return '$0.00';
    }
};

const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
        return new Intl.DateTimeFormat('en-US', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        }).format(new Date(date));
    } catch {
        return 'Invalid Date';
    }
};

export default async function AdminOrdersPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string }>
}) {
    const currentUser = await getCurrentUser();
    if (currentUser?.role === Role.FINANCIAL) redirect('/admin/finance');
    if (currentUser?.role === Role.PARTNER) redirect('/admin/executive');

    const { status: activeFilter = 'ALL' } = await searchParams;

    let rawOrders: any[] = [];
    try {
        rawOrders = await prisma.order.findMany({
            where: activeFilter !== 'ALL' ? { status: activeFilter as OrderStatus } : undefined,
            select: {
                id: true,
                status: true,
                totalAmount: true,
                createdAt: true,
                urgency: true,
                metadata: true,
                user: { select: { fullName: true, email: true } },
                documents: { select: { id: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    } catch (err) {
        console.error('[AdminOrdersPage] Critical error fetching orders:', err);
        throw err;
    }

    // Count per status for chip badges (only when showing ALL, to avoid extra query)
    let countsByStatus: Record<string, number> = {};
    if (activeFilter === 'ALL') {
        const grouped = await prisma.order.groupBy({ by: ['status'], _count: { id: true } });
        for (const g of grouped) countsByStatus[g.status] = g._count.id;
    }

    const orders = rawOrders
        .map(o => { try { return normalizeOrder(o); } catch { return null; } })
        .filter(Boolean);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Gerenciamento de Pedidos</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {activeFilter === 'ALL'
                            ? `${orders.length} pedidos no total`
                            : `${orders.length} pedidos com status "${activeFilter.replace(/_/g, ' ')}"`}
                    </p>
                </div>
                <Link
                    href="/admin/orcamento-manual"
                    className="inline-flex items-center gap-2 bg-[#f58220] hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                    <Plus className="w-5 h-5" />
                    Gerar Proposta Comercial
                </Link>
            </div>

            {/* Quick-filter chips — Server-side navigation, zero JS required */}
            <div className="flex flex-wrap gap-2">
                {STATUS_CHIPS.map(chip => {
                    const isActive = activeFilter === chip.value;
                    const count = chip.value === 'ALL'
                        ? Object.values(countsByStatus).reduce((a, b) => a + b, 0)
                        : countsByStatus[chip.value];

                    return (
                        <Link
                            key={chip.value}
                            href={chip.value === 'ALL' ? '/admin/orders' : `/admin/orders?status=${chip.value}`}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                isActive
                                    ? `${chip.color} ring-2 ring-offset-1 ring-current shadow-sm`
                                    : `${chip.color} opacity-60 hover:opacity-100`
                            }`}
                        >
                            {chip.label}
                            {count !== undefined && (
                                <span className="bg-white/60 px-1.5 py-0.5 rounded-full text-[10px] font-black">
                                    {count}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 font-medium">ID</th>
                                <th className="px-6 py-4 font-medium">Cliente</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Data</th>
                                <th className="px-6 py-4 font-medium">Total</th>
                                <th className="px-6 py-4 font-medium">Docs</th>
                                <th className="px-6 py-4 font-medium text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {orders.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400 text-sm">
                                        Nenhum pedido encontrado para este filtro.
                                    </td>
                                </tr>
                            )}
                            {orders.map((order: any) => (
                                <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900">#{order.id}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900 truncate max-w-[150px]" title={order.user?.fullName}>
                                                    {order.user?.fullName || 'N/A'}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate max-w-[150px]" title={order.user?.email}>
                                                    {order.user?.email || 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getStatusColor(order.status)}`}>
                                            {order.status?.replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-gray-400" />
                                            {formatDate(order.createdAt)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-gray-900">
                                        {formatCurrency(order.totalAmount)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1 text-gray-500">
                                            <FileText className="w-4 h-4" />
                                            <span>{(order.documents || []).length}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link
                                            href={`/admin/orders/${order.id}`}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                            Workbench
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
