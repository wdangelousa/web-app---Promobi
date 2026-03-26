'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  Inbox,
  Loader2,
  RefreshCcw,
} from 'lucide-react'
import { approveDocumentQuick, sendSelectedDocuments } from '@/app/actions/workbench'
import { useUIFeedback } from '@/components/UIFeedbackProvider'

type PendingDeadlineStatus = 'overdue' | 'due_today' | 'due_tomorrow' | 'upcoming' | 'no_deadline'
type PendingDocBucket = 'kit_ready' | 'error' | 'approved' | 'pending'
type PendingFilter = 'all' | 'pending' | 'error' | 'approved'

interface PendingDocument {
  id: number
  docType: string | null
  exactNameOnDoc: string | null
  translation_status: string | null
  isReviewed: boolean
  approvedKitUrl: string | null
  excludedFromScope: boolean
  scopedFileUrl: string | null
  billablePages: number | null
  totalPages: number | null
  externalTranslationUrl: string | null
  pendingBucket: PendingDocBucket
}

interface PendingOrder {
  id: number
  status: string
  urgency: string | null
  dueDate: string | null
  paidAt: string | null
  deadlineStatus: PendingDeadlineStatus
  businessDaysLeft: number | null
  hasError: boolean
  user: {
    fullName: string | null
    email: string | null
  } | null
  documents: PendingDocument[]
}

interface PendingResponse {
  orders: PendingOrder[]
}

const BRAND_COLOR = '#f58220'

const STATUS_BADGE_MAP: Record<PendingDocBucket, { label: string; className: string; icon: typeof Eye }> = {
  kit_ready: {
    label: 'Pronto para revisão',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: Eye,
  },
  error: {
    label: 'Erro',
    className: 'bg-red-50 text-red-600 border-red-200',
    icon: AlertCircle,
  },
  approved: {
    label: 'Aprovado',
    className: 'bg-blue-50 text-blue-600 border-blue-200',
    icon: Check,
  },
  pending: {
    label: 'Pendente',
    className: 'bg-gray-100 text-gray-500 border-gray-200',
    icon: Loader2,
  },
}

const FILTER_LABELS: Record<PendingFilter, string> = {
  all: 'Todos',
  pending: 'Pendentes',
  error: 'Erros',
  approved: 'Aprovados',
}

function formatDateLabel(value: string | null): string {
  if (!value) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function formatPaidAtLabel(value: string | null): string {
  if (!value) return 'Pagamento sem data'
  return `Pago em ${formatDateLabel(value)}`
}

function formatBusinessDaysLeft(value: number | null): string {
  if (value === null) return 'Sem prazo'
  if (value < 0) return `${Math.abs(value)} dia${Math.abs(value) === 1 ? '' : 's'} úteis em atraso`
  if (value === 0) return 'Vence hoje'
  return `${value} dia${value === 1 ? '' : 's'} úteis restantes`
}

function getDeadlineBadge(order: PendingOrder): { label: string; className: string } {
  switch (order.deadlineStatus) {
    case 'overdue':
      return { label: 'Atrasado', className: 'bg-red-100 text-red-700 border-red-200 animate-pulse' }
    case 'due_today':
      return { label: 'Vence hoje', className: 'bg-orange-100 text-orange-700 border-orange-200' }
    case 'due_tomorrow':
      return { label: 'Vence amanhã', className: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'upcoming':
      return { label: formatDateLabel(order.dueDate), className: 'bg-blue-50 text-blue-700 border-blue-200' }
    default:
      return { label: 'Sem prazo', className: 'bg-slate-100 text-slate-600 border-slate-200' }
  }
}

function normalizeUrgencyLabel(urgency: string | null): string {
  return urgency ? urgency.replace(/_/g, ' ') : 'standard'
}

function orderMatchesFilter(order: PendingOrder, filter: PendingFilter): boolean {
  const inScopeDocs = order.documents.filter((document) => !document.excludedFromScope)

  if (filter === 'all') return true
  if (filter === 'error') return inScopeDocs.some((document) => document.pendingBucket === 'error')
  if (filter === 'approved') {
    return inScopeDocs.length > 0 && inScopeDocs.every((document) => document.pendingBucket === 'approved')
  }
  return inScopeDocs.some((document) => (
    document.pendingBucket === 'pending' || document.pendingBucket === 'kit_ready'
  ))
}

export default function AdminPendenciasPage() {
  const { toast } = useUIFeedback()
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<PendingFilter>('all')
  const [workingDocId, setWorkingDocId] = useState<number | null>(null)
  const [workingOrderId, setWorkingOrderId] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const loadPending = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const response = await fetch('/api/pendencias', { cache: 'no-store' })
      const data: PendingResponse = await response.json()

      if (!response.ok) {
        throw new Error('Falha ao carregar pendências.')
      }

      setOrders(Array.isArray(data.orders) ? data.orders : [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao carregar pendências.'
      toast.error(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    void loadPending()
  }, [loadPending])

  const filterCounts = useMemo(() => ({
    all: orders.length,
    pending: orders.filter((order) => orderMatchesFilter(order, 'pending')).length,
    error: orders.filter((order) => orderMatchesFilter(order, 'error')).length,
    approved: orders.filter((order) => orderMatchesFilter(order, 'approved')).length,
  }), [orders])

  const visibleOrders = useMemo(
    () => orders.filter((order) => orderMatchesFilter(order, filter)),
    [orders, filter],
  )

  const handleApproveQuick = (docId: number) => {
    setWorkingDocId(docId)
    startTransition(async () => {
      const result = await approveDocumentQuick(docId)
      if (result.success) {
        toast.success('Documento aprovado com sucesso.')
        await loadPending('refresh')
      } else {
        toast.error(result.error || 'Erro ao aprovar documento.')
      }
      setWorkingDocId(null)
    })
  }

  const handleSendToClient = (order: PendingOrder) => {
    const docIds = order.documents
      .filter((document) => !document.excludedFromScope)
      .map((document) => document.id)

    setWorkingOrderId(order.id)
    startTransition(async () => {
      const result = await sendSelectedDocuments(order.id, docIds, 'Isabele', {
        sendToClient: true,
        sendToTranslator: false,
        isRetry: false,
      })

      if (result.success) {
        toast.success('Documentos enviados ao cliente.')
        await loadPending('refresh')
      } else {
        toast.error(result.error || 'Erro ao enviar documentos.')
      }

      setWorkingOrderId(null)
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/40 p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-orange-100 bg-white/90 p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em]" style={{ color: BRAND_COLOR }}>
              Caixa Operacional
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Caixa de Pendências</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Traduções prontas para revisão, erros operacionais e pedidos quase prontos para envio.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadPending('refresh')}
            disabled={loading || refreshing || isPending}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABELS) as PendingFilter[]).map((item) => {
            const active = filter === item
            return (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                  active
                    ? 'border-orange-300 bg-orange-100 text-orange-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:text-orange-700'
                }`}
              >
                {FILTER_LABELS[item]} ({filterCounts[item]})
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="grid gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-52 animate-pulse rounded-3xl border border-slate-200 bg-white/80"
              />
            ))}
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <Inbox className="mx-auto mb-4 h-7 w-7 text-slate-400" />
            <h2 className="text-lg font-black text-slate-800">Nenhuma pendência neste filtro</h2>
            <p className="mt-2 text-sm text-slate-500">
              Ajuste o filtro ou atualize a lista para ver novos documentos.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleOrders.map((order) => {
              const inScopeDocs = order.documents.filter((document) => !document.excludedFromScope)
              const approvedCount = inScopeDocs.filter((document) => document.pendingBucket === 'approved').length
              const allApproved = inScopeDocs.length > 0 && approvedCount === inScopeDocs.length
              const progressPercent = inScopeDocs.length > 0 ? (approvedCount / inScopeDocs.length) * 100 : 0
              const deadlineBadge = getDeadlineBadge(order)

              return (
                <section key={order.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-black text-slate-900">#{order.id}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                          {normalizeUrgencyLabel(order.urgency)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${deadlineBadge.className}`}>
                          {deadlineBadge.label}
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                          {formatPaidAtLabel(order.paidAt)}
                        </span>
                      </div>

                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {order.user?.fullName || 'Cliente sem nome'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {order.user?.email || 'Sem email cadastrado'} • {formatBusinessDaysLeft(order.businessDaysLeft)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                      {allApproved && (
                        <button
                          type="button"
                          onClick={() => handleSendToClient(order)}
                          disabled={workingOrderId === order.id && isPending}
                          className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {workingOrderId === order.id && isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Enviar pro cliente
                        </button>
                      )}

                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-orange-200 hover:text-orange-700"
                      >
                        Workbench
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      <span>{approvedCount}/{inScopeDocs.length} aprovados</span>
                      <span>{Math.round(progressPercent)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {inScopeDocs.map((document) => {
                      const badge = STATUS_BADGE_MAP[document.pendingBucket]
                      const BadgeIcon = badge.icon
                      const isApproving = workingDocId === document.id && isPending

                      return (
                        <div
                          key={document.id}
                          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-slate-800">
                                {document.exactNameOnDoc || document.docType || `Documento #${document.id}`}
                              </span>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${badge.className}`}>
                                <BadgeIcon className={`h-3.5 w-3.5 ${document.pendingBucket === 'pending' ? 'animate-spin' : ''}`} />
                                {badge.label}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {document.billablePages ?? document.totalPages ?? 0} página(s) úteis
                              {document.scopedFileUrl ? ' • scoped materializado' : ''}
                              {document.externalTranslationUrl ? ' • PDF externo' : ''}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {document.pendingBucket === 'kit_ready' && (
                              <button
                                type="button"
                                onClick={() => handleApproveQuick(document.id)}
                                disabled={isApproving}
                                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isApproving ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                                Aprovar
                              </button>
                            )}

                            {document.pendingBucket === 'error' && (
                              <Link
                                href={`/admin/orders/${order.id}`}
                                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100"
                              >
                                Abrir no Workbench
                              </Link>
                            )}

                            {document.pendingBucket === 'approved' && (
                              <span className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600">
                                <Check className="h-4 w-4" />
                                Aprovado
                              </span>
                            )}

                            {document.pendingBucket === 'pending' && (
                              <Link
                                href={`/admin/orders/${order.id}`}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-orange-200 hover:text-orange-700"
                              >
                                Abrir no Workbench
                              </Link>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
