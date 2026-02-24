// app/admin/workbench/page.tsx — Fila de Pedidos (Mesa de Operações)

import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, ArrowRight, User } from 'lucide-react'

function progressOf(documents: any[]) {
  const total = documents.length
  if (!total) return { done: 0, total: 0, pct: 0 }
  const done = documents.filter(d => d.translation_status === 'approved').length
  return { done, total, pct: Math.round((done / total) * 100) }
}

function urgencyBadge(urgency: string | null) {
  if (urgency === 'rush') return { label: 'RUSH', cls: 'bg-red-100 text-red-700 border border-red-200' }
  if (urgency === 'express') return { label: 'EXPRESS', cls: 'bg-amber-100 text-amber-700 border border-amber-200' }
  return { label: 'STANDARD', cls: 'bg-slate-100 text-slate-600 border border-slate-200' }
}

function statusLabel(documents: any[]) {
  const s = documents.map(d => d.translation_status)
  if (s.every(x => x === 'approved')) return { label: 'Pronto para liberar', color: 'text-green-600', icon: '✅' }
  if (s.some(x => x === 'ai_draft')) return { label: 'Rascunho DeepL pronto', color: 'text-orange-500', icon: '🤖' }
  if (s.some(x => x === 'needs_manual')) return { label: 'Requer tradução manual', color: 'text-amber-600', icon: '✍️' }
  if (s.every(x => x === 'pending')) return { label: 'Aguardando DeepL', color: 'text-blue-500', icon: '⏳' }
  return { label: 'Em andamento', color: 'text-slate-500', icon: '🔄' }
}

export default async function WorkbenchQueuePage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'OPERATIONS') redirect('/admin')

  const orders = await prisma.order.findMany({
    where: { status: { in: ['TRANSLATING', 'READY_FOR_REVIEW'] } },
    orderBy: [{ urgency: 'desc' }, { createdAt: 'asc' }],
    include: {
      user: { select: { fullName: true, email: true } },
      documents: {
        select: { id: true, translation_status: true, delivery_pdf_url: true },
      },
    },
  })

  const totalPending = orders.length
  const totalReady = orders.filter(o =>
    o.documents.length > 0 &&
    o.documents.every(d => d.translation_status === 'approved' && d.delivery_pdf_url)
  ).length

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-orange-400 tracking-widest mb-1">PROMOBI OPS</p>
            <h1 className="text-white text-xl font-bold">Mesa de Operações</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-slate-400 text-xs">Na fila</p>
              <p className="text-white font-bold text-2xl">{totalPending}</p>
            </div>
            {totalReady > 0 && (
              <div className="text-right bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2">
                <p className="text-green-400 text-xs">Prontos para liberar</p>
                <p className="text-green-400 font-bold text-2xl">{totalReady}</p>
              </div>
            )}
            <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-4 py-2">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300 text-sm">{user.fullName}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="h-0.5 bg-orange-500" />

      <div className="max-w-5xl mx-auto px-6 py-8">
        {orders.length === 0 ? (
          <div className="text-center py-20">
            <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-700 mb-2">Fila limpa!</h2>
            <p className="text-slate-500">Nenhum pedido aguardando tradução no momento.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => {
              const { done, total, pct } = progressOf(order.documents)
              const urgency = urgencyBadge(order.urgency)
              const st = statusLabel(order.documents)
              const allReady = done === total && total > 0 &&
                order.documents.every(d => d.delivery_pdf_url)

              return (
                <Link key={order.id} href={`/admin/workbench/${order.id}`} className="block group">
                  <div className={`
                    bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-200
                    group-hover:shadow-md group-hover:border-orange-300
                    ${allReady ? 'border-green-300 shadow-green-100' : 'border-slate-200'}
                  `}>
                    {/* Progress bar */}
                    <div className="h-1 bg-slate-100">
                      <div
                        className={`h-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="p-5 flex items-center gap-4">
                      {/* Order ID */}
                      <div className="text-center bg-slate-100 rounded-xl px-4 py-3 min-w-[64px] shrink-0">
                        <p className="text-[9px] font-bold text-slate-500 tracking-wider">PEDIDO</p>
                        <p className="text-xl font-bold text-slate-900">#{order.id}</p>
                      </div>

                      {/* Client + status */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-slate-900 truncate">{order.user?.fullName ?? 'Cliente'}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${urgency.cls}`}>
                            {urgency.label}
                          </span>
                        </div>
                        <p className="text-slate-500 text-sm truncate">{order.user?.email}</p>
                        <p className={`text-xs font-medium mt-1.5 ${st.color}`}>{st.icon} {st.label}</p>
                      </div>

                      {/* Progress */}
                      <div className="text-center shrink-0">
                        <div className={`text-2xl font-bold ${pct === 100 ? 'text-green-600' : 'text-slate-800'}`}>
                          {done}/{total}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">aprovados</p>
                      </div>

                      {/* Value + CTA */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-lg font-bold text-slate-800">${(order.totalAmount ?? 0).toFixed(0)}</p>
                          <p className="text-[10px] text-slate-400">valor</p>
                        </div>
                        <div className={`
                          flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-colors
                          ${allReady ? 'bg-green-100 text-green-700' : 'bg-orange-50 text-orange-600 group-hover:bg-orange-100'}
                        `}>
                          {allReady ? 'Liberar' : 'Traduzir'}
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
