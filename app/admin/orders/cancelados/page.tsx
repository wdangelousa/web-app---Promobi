import prisma from '@/lib/prisma';
import Link from 'next/link';
import { getCurrentUser } from '@/app/actions/auth';
import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';
import { Eye, Search } from 'lucide-react';
import { CANCELLED_STATUS_VISUAL } from '@/lib/adminOrderStatus';
import { parseOrderMetadata } from '@/lib/translationArtifactSource';

export const dynamic = 'force-dynamic';

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

function resolveCancellationInfo(order: {
  metadata?: string | null;
  cancellation_reason?: string | null;
  createdAt: Date | string;
}) {
  const parsed = parseOrderMetadata(order.metadata ?? null) as Record<string, unknown>;
  const cancellationMeta =
    parsed.cancellation && typeof parsed.cancellation === 'object'
      ? (parsed.cancellation as Record<string, unknown>)
      : null;

  const cancelledAt =
    typeof cancellationMeta?.cancelledAt === 'string'
      ? cancellationMeta.cancelledAt
      : null;

  const cancelledBy =
    typeof cancellationMeta?.cancelledBy === 'string'
      ? cancellationMeta.cancelledBy
      : null;

  const reason =
    (() => {
      const baseReason =
        order.cancellation_reason?.trim() ||
        (typeof cancellationMeta?.cancellation_reason === 'string'
          ? String(cancellationMeta.cancellation_reason).trim()
          : '') ||
        (typeof cancellationMeta?.reasonLabel === 'string'
          ? String(cancellationMeta.reasonLabel).trim()
          : '');

      const details =
        (typeof cancellationMeta?.cancellation_details === 'string'
          ? String(cancellationMeta.cancellation_details).trim()
          : '') ||
        (typeof cancellationMeta?.reasonDetail === 'string'
          ? String(cancellationMeta.reasonDetail).trim()
          : '');

      if (baseReason && details) return `${baseReason}: ${details}`;
      if (baseReason) return baseReason;

      const fallbackReason =
        typeof cancellationMeta?.reason === 'string'
          ? String(cancellationMeta.reason).trim()
          : '';

      return fallbackReason || 'Motivo não informado';
    })();

  return {
    cancelledAt: cancelledAt ?? order.createdAt,
    cancelledBy,
    reason,
  };
}

export default async function CancelledOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const currentUser = await getCurrentUser();

  if (currentUser?.role === Role.FINANCIAL) redirect('/admin/finance');
  if (currentUser?.role === Role.PARTNER) redirect('/admin/executive');

  const { q: queryRaw } = await searchParams;
  const searchQuery = typeof queryRaw === 'string' ? queryRaw.trim() : '';
  const normalizedSearch = searchQuery.toLowerCase();

  let rawOrders: Array<{
    id: number;
    createdAt: Date;
    status: string;
    cancellation_reason: string | null;
    metadata: string | null;
    user: { fullName: string | null; email: string | null } | null;
  }> = [];

  try {
    rawOrders = await prisma.order.findMany({
      where: { status: 'CANCELLED' },
      select: {
        id: true,
        createdAt: true,
        status: true,
        cancellation_reason: true,
        metadata: true,
        user: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 400,
    });
  } catch (error) {
    console.error('[CancelledOrdersPage] Failed to fetch cancelled orders', error);
    rawOrders = [];
  }

  const rows = rawOrders
    .map((order) => {
      const cancellation = resolveCancellationInfo(order);
      return {
        id: order.id,
        customerName: order.user?.fullName ?? 'N/A',
        customerEmail: order.user?.email ?? 'N/A',
        cancelledAt: cancellation.cancelledAt,
        cancelledBy: cancellation.cancelledBy,
        reason: cancellation.reason,
        status: order.status,
      };
    })
    .filter((row) => {
      if (!normalizedSearch) return true;
      return (
        String(row.id).includes(normalizedSearch) ||
        row.customerName.toLowerCase().includes(normalizedSearch) ||
        row.customerEmail.toLowerCase().includes(normalizedSearch) ||
        row.reason.toLowerCase().includes(normalizedSearch)
      );
    });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pedidos Cancelados</h1>
        <p className="text-sm text-gray-500 mt-1">
          {rows.length} pedido(s) cancelado(s)
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <form action="/admin/orders/cancelados" method="get" className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="relative">
            <span className="sr-only">Buscar cancelados</span>
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              name="q"
              defaultValue={searchQuery}
              placeholder="Buscar por cliente, pedido ou e-mail"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f58220]/25 focus:border-[#f58220]"
            />
          </label>
          <button
            type="submit"
            className="h-10 px-4 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Buscar
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-medium">Pedido</th>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Cancelado em</th>
                <th className="px-6 py-4 font-medium">Motivo</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                    Nenhum pedido cancelado encontrado para este filtro.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-900">#{row.id}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{row.customerName}</div>
                    <div className="text-xs text-gray-500">{row.customerEmail}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    <div>{formatDate(row.cancelledAt)}</div>
                    {row.cancelledBy && (
                      <div className="text-xs text-gray-500 mt-0.5">por {row.cancelledBy}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-700 max-w-[320px]">
                    <div className="line-clamp-3" title={row.reason}>
                      {row.reason}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${CANCELLED_STATUS_VISUAL.badgeClass}`}
                    >
                      {CANCELLED_STATUS_VISUAL.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/orders/${row.id}`}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Detalhes
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
