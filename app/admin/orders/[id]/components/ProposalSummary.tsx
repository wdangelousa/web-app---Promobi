'use client';

import { deriveProposalFinancialSummary } from '@/lib/proposalPricingSummary';

interface ProposalSummaryProps {
  order: {
    id: number;
    status: string;
    totalAmount: number;
    createdAt: string;
    dueDate?: string | null;
    documents: { billablePages?: number | null; totalPages?: number | null; excludedFromScope?: boolean }[];
    metadata: any;
    finalPaidAmount?: number | null;
    paymentMethod?: string | null;
    extraDiscount?: number | null;
    urgency?: string;
  };
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PENDING_PAYMENT: 'Aguardando Pagamento',
  AWAITING_VERIFICATION: 'Verificação Pendente',
  TRANSLATING: 'Em Tradução',
  READY_FOR_REVIEW: 'Pronto para Revisão',
  PAID: 'Pago',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  MANUAL_TRANSLATION_NEEDED: 'Tradução Manual',
};

const PAYMENT_LABELS: Record<string, string> = {
  STRIPE: 'Cartão (Stripe)',
  ZELLE: 'Zelle',
  PIX: 'Pix',
};

function fmt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
}

export default function ProposalSummary({ order }: ProposalSummaryProps) {
  const financial = deriveProposalFinancialSummary({
    totalAmount: order.totalAmount,
    extraDiscount: order.extraDiscount,
    metadata: order.metadata,
  });

  const docCount = order.documents.length;
  const totalPages = order.documents.reduce(
    (sum, d) => sum + (d.totalPages ?? d.billablePages ?? 0),
    0,
  );
  const billablePages = order.documents.reduce(
    (sum, d) => sum + (d.billablePages ?? d.totalPages ?? 0),
    0,
  );
  const excludedPages = order.documents.filter((d) => d.excludedFromScope).length;

  const proposalDate = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

  const statusLabel = STATUS_LABELS[order.status] ?? order.status;
  const dueDateLabel =
    typeof order.dueDate === 'string' && order.dueDate.trim().length > 0
      ? new Date(order.dueDate).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '—';
  const paymentLabel = order.paymentMethod
    ? PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod
    : '—';

  const hasSavings = financial.totalSavings > 0;
  const hasDiscount =
    financial.volumeDiscountAmount > 0 ||
    financial.manualDiscountAmount > 0 ||
    financial.operationalAdjustmentAmount > 0;

  const breakdown = order.metadata?.breakdown;
  const quoteNote =
    typeof breakdown?.quoteNote === 'string' && breakdown.quoteNote.trim()
      ? breakdown.quoteNote.trim()
      : null;

  return (
    <div className="bg-amber-50/60 border border-amber-200 rounded-lg px-4 py-3 text-xs">
      <h3 className="font-bold text-amber-900 text-[11px] uppercase tracking-wider mb-2">
        Resumo da Proposta
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-gray-700">
        {/* Row 1 */}
        <div>
          <span className="text-gray-400">Valor cotado</span>
          <p className="font-bold text-gray-900">{fmt(financial.totalPayable)}</p>
        </div>
        <div>
          <span className="text-gray-400">Data</span>
          <p className="font-semibold">{proposalDate}</p>
        </div>
        <div>
          <span className="text-gray-400">Prazo</span>
          <p className="font-semibold">{dueDateLabel}</p>
        </div>
        <div>
          <span className="text-gray-400">Documentos</span>
          <p className="font-semibold">
            {docCount} doc{docCount !== 1 ? 's' : ''} &middot; {billablePages} pág
            {totalPages > billablePages ? ` (${totalPages} total)` : ''}
          </p>
        </div>
        <div>
          <span className="text-gray-400">Status</span>
          <p className="font-semibold">{statusLabel}</p>
        </div>

        {/* Row 2 */}
        <div>
          <span className="text-gray-400">Pagamento</span>
          <p className="font-semibold">
            {order.finalPaidAmount != null ? fmt(order.finalPaidAmount) : paymentLabel}
          </p>
        </div>
        {hasSavings && (
          <div>
            <span className="text-gray-400">Economia (exclusões)</span>
            <p className="font-semibold text-green-700">-{fmt(financial.totalSavings)}</p>
          </div>
        )}
        {hasDiscount && (
          <div>
            <span className="text-gray-400">Descontos</span>
            <p className="font-semibold text-green-700">
              -{fmt(
                financial.volumeDiscountAmount +
                  financial.manualDiscountAmount +
                  financial.operationalAdjustmentAmount,
              )}
            </p>
          </div>
        )}
        {excludedPages > 0 && (
          <div>
            <span className="text-gray-400">Docs excluídos</span>
            <p className="font-semibold">{excludedPages}</p>
          </div>
        )}
      </div>

      {quoteNote && (
        <p className="mt-2 text-[10px] text-amber-700 italic border-t border-amber-200 pt-1.5">
          {quoteNote}
        </p>
      )}
    </div>
  );
}
