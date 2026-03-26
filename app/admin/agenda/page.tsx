'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  RefreshCcw,
} from 'lucide-react'

type AgendaDeadlineStatus = 'overdue' | 'due_today' | 'due_tomorrow' | 'upcoming' | 'no_deadline'

interface AgendaOrder {
  id: number
  status: string
  urgency: string | null
  dueDate: string | null
  paidAt: string | null
  businessDaysLeft: number | null
  deadlineStatus: AgendaDeadlineStatus
  user: {
    fullName: string | null
    email: string | null
  } | null
  documents: Array<{
    id: number
    excludedFromScope: boolean
    scopedFileUrl: string | null
  }>
}

interface AgendaResponse {
  orders: AgendaOrder[]
}

interface SectionConfig {
  id: AgendaDeadlineStatus
  title: string
  emptyTitle: string
  emptyDescription: string
  icon: typeof AlertTriangle
  shellClassName: string
  iconClassName: string
}

const BRAND_COLOR = '#f58220'

const SECTION_CONFIG: SectionConfig[] = [
  {
    id: 'overdue',
    title: 'Atrasados',
    emptyTitle: 'Nenhum pedido atrasado',
    emptyDescription: 'Tudo sob controle nesta faixa critica.',
    icon: AlertTriangle,
    shellClassName: 'border-red-200 bg-red-50/70',
    iconClassName: 'text-red-600 animate-pulse',
  },
  {
    id: 'due_today',
    title: 'Vence hoje',
    emptyTitle: 'Nada vencendo hoje',
    emptyDescription: 'Nenhum pedido precisa fechar hoje.',
    icon: Clock3,
    shellClassName: 'border-orange-200 bg-orange-50/70',
    iconClassName: 'text-orange-600',
  },
  {
    id: 'due_tomorrow',
    title: 'Vence amanha',
    emptyTitle: 'Nada vencendo amanha',
    emptyDescription: 'A fila de amanha esta leve no momento.',
    icon: CalendarClock,
    shellClassName: 'border-amber-200 bg-amber-50/80',
    iconClassName: 'text-amber-700',
  },
  {
    id: 'upcoming',
    title: 'Proximos',
    emptyTitle: 'Nenhum prazo futuro',
    emptyDescription: 'Ainda nao ha pedidos com prazo atribuido para os proximos dias.',
    icon: CheckCircle2,
    shellClassName: 'border-blue-200 bg-blue-50/70',
    iconClassName: 'text-blue-600',
  },
  {
    id: 'no_deadline',
    title: 'Sem prazo',
    emptyTitle: 'Todos os pedidos tem prazo',
    emptyDescription: 'Nenhum pedido ficou sem data de entrega registrada.',
    icon: Inbox,
    shellClassName: 'border-slate-200 bg-slate-50',
    iconClassName: 'text-slate-500',
  },
]

const STATUS_BADGE_MAP: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  TRANSLATING: 'bg-amber-50 text-amber-800 border-amber-200',
  READY_FOR_REVIEW: 'bg-violet-50 text-violet-800 border-violet-200',
  MANUAL_TRANSLATION_NEEDED: 'bg-red-100 text-red-900 border-red-300',
  NOTARIZING: 'bg-sky-50 text-sky-800 border-sky-200',
}

function formatDateLabel(value: string | null): string {
  if (!value) return 'Sem prazo'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatBusinessDaysLeft(value: number | null): string {
  if (value === null) return 'Sem calculo'
  if (value < 0) return `${Math.abs(value)} dia${Math.abs(value) === 1 ? '' : 's'} uteis em atraso`
  if (value === 0) return 'Entrega hoje'
  return `${value} dia${value === 1 ? '' : 's'} uteis restantes`
}

function normalizeUrgencyLabel(urgency: string | null): string {
  if (!urgency) return 'standard'
  return urgency.replace(/_/g, ' ')
}

export default function AdminAgendaPage() {
  const [orders, setOrders] = useState<AgendaOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAgenda = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const response = await fetch('/api/agenda', { cache: 'no-store' })
      const data: AgendaResponse = await response.json()

      if (!response.ok) {
        throw new Error('Falha ao carregar agenda.')
      }

      setOrders(Array.isArray(data.orders) ? data.orders : [])
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Falha ao carregar agenda.'
      setError(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadAgenda()
  }, [loadAgenda])

  const sections = useMemo(() => {
    return SECTION_CONFIG.map((config) => ({
      ...config,
      orders: orders.filter((order) => order.deadlineStatus === config.id),
    }))
  }, [orders])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/40 p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-orange-100 bg-white/90 p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em]" style={{ color: BRAND_COLOR }}>
              Agenda Operacional
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Agenda de prazos</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Visualize o que esta atrasado, o que vence hoje e o que ja esta na fila de entrega.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadAgenda('refresh')}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-3xl border border-slate-200 bg-white/80"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {sections.map((section) => {
              const SectionIcon = section.icon

              return (
                <section
                  key={section.id}
                  className={`rounded-3xl border p-5 shadow-sm ${section.shellClassName}`}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
                        <SectionIcon className={`h-5 w-5 ${section.iconClassName}`} />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-slate-900">{section.title}</h2>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {section.orders.length} pedido{section.orders.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {section.orders.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-center">
                      <Inbox className="mx-auto mb-3 h-6 w-6 text-slate-400" />
                      <p className="text-sm font-bold text-slate-700">{section.emptyTitle}</p>
                      <p className="mt-1 text-xs text-slate-500">{section.emptyDescription}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {section.orders.map((order) => {
                        const activeDocs = order.documents.filter((document) => !document.excludedFromScope)
                        const scopedDocs = activeDocs.filter((document) => Boolean(document.scopedFileUrl))

                        return (
                          <Link
                            key={order.id}
                            href={`/admin/orders/${order.id}`}
                            className="group block rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-base font-black text-slate-900">#{order.id}</span>
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                                    {normalizeUrgencyLabel(order.urgency)}
                                  </span>
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_BADGE_MAP[order.status] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                    {order.status}
                                  </span>
                                </div>

                                <p className="mt-3 truncate text-sm font-bold text-slate-800">
                                  {order.user?.fullName || 'Cliente sem nome'}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                  {order.user?.email || 'Sem email cadastrado'}
                                </p>
                              </div>

                              <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-slate-300 transition group-hover:text-orange-500" />
                            </div>

                            <div className="mt-4 grid gap-3 text-xs text-slate-600 sm:grid-cols-3">
                              <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                <p className="font-bold uppercase tracking-[0.12em] text-slate-400">Prazo</p>
                                <p className="mt-1 text-sm font-bold text-slate-800">{formatDateLabel(order.dueDate)}</p>
                              </div>
                              <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                <p className="font-bold uppercase tracking-[0.12em] text-slate-400">Janela</p>
                                <p className="mt-1 text-sm font-bold text-slate-800">
                                  {formatBusinessDaysLeft(order.businessDaysLeft)}
                                </p>
                              </div>
                              <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                <p className="font-bold uppercase tracking-[0.12em] text-slate-400">Docs</p>
                                <p className="mt-1 text-sm font-bold text-slate-800">
                                  {activeDocs.length} ativos
                                  {scopedDocs.length > 0 ? ` • ${scopedDocs.length} scoped` : ''}
                                </p>
                              </div>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
