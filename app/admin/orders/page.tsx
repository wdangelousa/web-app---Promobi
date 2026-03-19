import prisma from '@/lib/prisma';
import { Eye, FileText, Calendar, User, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUser } from '@/app/actions/auth';
import { redirect } from 'next/navigation';
import { Role, OrderStatus } from '@prisma/client';
import { normalizeOrder } from '@/lib/orderAdapter';
import {
  getAdminOrderStatusVisual,
  OPERATIONAL_STATUS_FILTERS,
} from '@/lib/adminOrderStatus';

export const dynamic = 'force-dynamic';

const OPERATIONAL_STATUS_SET = new Set(OPERATIONAL_STATUS_FILTERS.map((s) => s.value));

function normalizeStatusFilter(rawStatus?: string): 'ALL' | OrderStatus {
  if (!rawStatus || rawStatus === 'ALL') return 'ALL';
  if (rawStatus === 'CANCELLED') return 'CANCELLED';
  return OPERATIONAL_STATUS_SET.has(rawStatus as OrderStatus)
    ? (rawStatus as OrderStatus)
    : 'ALL';
}

const formatCurrency = (amount: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      typeof amount === 'number' ? amount : 0,
    );
  } catch {
    return '$0.00';
  }
};

const formatDate = (date: unknown) => {
  if (!date) return 'N/A';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date as string | number | Date));
  } catch {
    return 'Data inválida';
  }
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const currentUser = await getCurrentUser();

  if (currentUser?.role === Role.FINANCIAL) redirect('/admin/finance');
  if (currentUser?.role === Role.PARTNER) redirect('/admin/executive');

  const { status: statusRaw, q: queryRaw } = await searchParams;
  const activeStatus = normalizeStatusFilter(statusRaw);
  const searchQuery = typeof queryRaw === 'string' ? queryRaw.trim() : '';

  if (activeStatus === 'CANCELLED') {
    const next = searchQuery
      ? `/admin/orders/cancelados?q=${encodeURIComponent(searchQuery)}`
      : '/admin/orders/cancelados';
    redirect(next);
  }

  let rawOrders: any[] = [];
  try {
    rawOrders = await prisma.order.findMany({
      where:
        activeStatus === 'ALL'
          ? { status: { not: 'CANCELLED' } }
          : { status: activeStatus as OrderStatus },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        urgency: true,
        metadata: true,
        user: { select: { fullName: true, email: true } },
        documents: { select: { id: true, docType: true, exactNameOnDoc: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 350,
    });
  } catch (err) {
    console.error('[AdminOrdersPage] Database error fetching orders:', err);
    rawOrders = [];
  }

  const normalizedOrders = (rawOrders || [])
    .map((order) => {
      try {
        return normalizeOrder(order);
      } catch (error) {
        console.error(`Failed to normalize order #${order?.id}:`, error);
        return null;
      }
    })
    .filter(Boolean) as Array<{
      id: number;
      status: string;
      totalAmount: number;
      createdAt: string;
      user: { fullName?: string; email?: string };
      documents: Array<{ id: number; docType?: string; exactNameOnDoc?: string | null }>;
    }>;

  const normalizedSearch = searchQuery.toLowerCase();
  const orders =
    normalizedSearch.length === 0
      ? normalizedOrders
      : normalizedOrders.filter((order) => {
          const docText = (order.documents ?? [])
            .map((doc) => `${doc.exactNameOnDoc ?? ''} ${doc.docType ?? ''}`)
            .join(' ')
            .toLowerCase();
          return (
            String(order.id).includes(normalizedSearch) ||
            (order.user?.fullName ?? '').toLowerCase().includes(normalizedSearch) ||
            (order.user?.email ?? '').toLowerCase().includes(normalizedSearch) ||
            docText.includes(normalizedSearch)
          );
        });

  const toolbarStatusValue = activeStatus === 'ALL' ? 'ALL' : activeStatus;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bancada de Pedidos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {orders.length} pedido(s) operacional(is) encontrado(s)
          </p>
        </div>
        <Link
          href="/admin/orcamento-manual"
          className="inline-flex items-center gap-2 bg-[#f58220] hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm w-fit"
        >
          <Plus className="w-5 h-5" />
          Gerar Proposta Comercial
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <form action="/admin/orders" method="get" className="grid gap-3 md:grid-cols-[1fr_260px_auto_auto]">
          <label className="relative">
            <span className="sr-only">Buscar pedidos</span>
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              name="q"
              defaultValue={searchQuery}
              placeholder="Buscar por cliente, pedido ou e-mail"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f58220]/25 focus:border-[#f58220]"
            />
          </label>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-700" htmlFor="status-filter">
              Status
            </label>
            <select
              id="status-filter"
              name="status"
              defaultValue={toolbarStatusValue}
              className="h-10 rounded-lg border border-gray-300 text-sm text-gray-900 px-3 focus:outline-none focus:ring-2 focus:ring-[#f58220]/25 focus:border-[#f58220]"
            >
              <option value="ALL">Todos os status</option>
              {OPERATIONAL_STATUS_FILTERS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="h-10 px-4 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Aplicar filtros
          </button>

          <Link
            href="/admin/orders"
            className="h-10 px-4 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center justify-center"
          >
            Limpar
          </Link>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-medium">Pedido</th>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Criado em</th>
                <th className="px-6 py-4 font-medium">Total</th>
                <th className="px-6 py-4 font-medium">Docs</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400 text-sm">
                    Nenhum pedido encontrado para os filtros aplicados.
                  </td>
                </tr>
              )}
              {orders.map((order) => {
                const statusVisual = getAdminOrderStatusVisual(order.status);
                return (
                  <tr key={order.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-900">#{order.id}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 truncate max-w-[220px]" title={order.user?.fullName}>
                            {order.user?.fullName || 'N/A'}
                          </div>
                          <div className="text-xs text-gray-500 truncate max-w-[220px]" title={order.user?.email}>
                            {order.user?.email || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusVisual.badgeClass}`}
                        title={statusVisual.description}
                      >
                        {statusVisual.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {formatDate(order.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">{formatCurrency(order.totalAmount)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-gray-500">
                        <FileText className="w-4 h-4" />
                        <span>{(order.documents || []).length}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Workbench
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
