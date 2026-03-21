import { OrderStatus } from '@prisma/client';

export interface AdminOrderStatusVisual {
  value: OrderStatus;
  label: string;
  badgeClass: string;
  description: string;
}

const VISUAL_MAP: Record<OrderStatus, AdminOrderStatusVisual> = {
  PENDING: {
    value: 'PENDING',
    label: 'Novo',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    description: 'Pedido recém-criado aguardando avanço operacional.',
  },
  PENDING_PAYMENT: {
    value: 'PENDING_PAYMENT',
    label: 'Aguardando Aprovação',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
    description: 'Aguardando confirmação financeira/aprovação de pagamento.',
  },
  AWAITING_VERIFICATION: {
    value: 'AWAITING_VERIFICATION',
    label: 'Em Revisão',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
    description: 'Pedido em triagem operacional e verificação.',
  },
  TRANSLATING: {
    value: 'TRANSLATING',
    label: 'Em Andamento',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    description: 'Tradução em execução.',
  },
  NOTARIZING: {
    value: 'NOTARIZING',
    label: 'Em Andamento',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    description: 'Documento em etapa de notarização.',
  },
  READY_FOR_REVIEW: {
    value: 'READY_FOR_REVIEW',
    label: 'Em Revisão',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
    description: 'Pronto para revisão/validação operacional.',
  },
  PAID: {
    value: 'PAID',
    label: 'Aprovado',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Pagamento aprovado e fluxo autorizado.',
  },
  COMPLETED: {
    value: 'COMPLETED',
    label: 'Concluído',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    description: 'Pedido finalizado e entregue.',
  },
  MANUAL_TRANSLATION_NEEDED: {
    value: 'MANUAL_TRANSLATION_NEEDED',
    label: 'Bloqueado',
    badgeClass: 'bg-red-100 text-red-900 border-red-300',
    description: 'Fluxo automático interrompido; requer ação manual.',
  },
  CANCELLED: {
    value: 'CANCELLED',
    label: 'Cancelado',
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
    description: 'Pedido cancelado.',
  },
};

const FALLBACK_VISUAL: AdminOrderStatusVisual = {
  value: 'PENDING',
  label: 'Status desconhecido',
  badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
  description: 'Status não mapeado.',
};

export function getAdminOrderStatusVisual(
  status: OrderStatus | string | null | undefined,
): AdminOrderStatusVisual {
  if (!status) return FALLBACK_VISUAL;
  const mapped = VISUAL_MAP[status as OrderStatus];
  return mapped ?? { ...FALLBACK_VISUAL, label: String(status) };
}

export const OPERATIONAL_STATUS_FILTERS: AdminOrderStatusVisual[] = [
  VISUAL_MAP.PENDING,
  VISUAL_MAP.PENDING_PAYMENT,
  VISUAL_MAP.AWAITING_VERIFICATION,
  VISUAL_MAP.TRANSLATING,
  VISUAL_MAP.NOTARIZING,
  VISUAL_MAP.READY_FOR_REVIEW,
  VISUAL_MAP.PAID,
  VISUAL_MAP.MANUAL_TRANSLATION_NEEDED,
];

export const CANCELLED_STATUS_VISUAL = VISUAL_MAP.CANCELLED;
export const COMPLETED_STATUS_VISUAL = VISUAL_MAP.COMPLETED;
