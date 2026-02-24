'use client'

// components/admin/ConfirmPaymentButton.tsx
//
// Button + modal for Walter to manually confirm a Zelle payment.
// Shows only when order.status is PENDING_PAYMENT and paymentMethod
// suggests manual payment (or when admin chooses to override).
//
// Usage in order detail page:
//   <ConfirmPaymentButton order={order} onConfirmed={refreshOrder} />

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Clock,
  FileText,
} from 'lucide-react'
import { confirmPayment } from '@/app/actions/confirm-payment'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id: number
  status: string
  totalAmount: number
  paymentMethod?: string | null
  user?: { fullName?: string; email?: string } | null
  documents?: any[]
  urgency?: string
}

interface ConfirmPaymentButtonProps {
  order: Order
  confirmedByName: string   // Current admin user's name (Walter)
  onConfirmed?: () => void  // Callback to refresh order in parent
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfirmPaymentButton({
  order,
  confirmedByName,
  onConfirmed,
}: ConfirmPaymentButtonProps) {
  const [open, setOpen]         = useState(false)
  const [reference, setRef]     = useState('')
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  // Only show when payment can still be confirmed
  const canConfirm = ['PENDING_PAYMENT', 'PENDING', 'AWAITING_VERIFICATION'].includes(order.status)
  if (!canConfirm) return null

  const handleConfirm = async () => {
    if (!reference.trim()) {
      setError('Informe a referência da transferência Zelle.')
      return
    }

    setLoading(true)
    setError(null)

    const result = await confirmPayment(order.id, 'ZELLE', {
      reference:   reference.trim(),
      confirmedBy: confirmedByName,
      notes:       notes.trim() || undefined,
    })

    setLoading(false)

    if (result.success) {
      setConfirmed(true)
      setTimeout(() => {
        setOpen(false)
        setConfirmed(false)
        onConfirmed?.()
      }, 2200)
    } else {
      setError(result.error ?? 'Erro ao confirmar pagamento.')
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all text-sm"
      >
        <DollarSign className="w-4 h-4" />
        Confirmar Pagamento Zelle
      </button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => !loading && setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1,    opacity: 1, y: 0  }}
              exit={{    scale: 0.95, opacity: 0, y: 16 }}
              transition={{ type: 'spring', damping: 24, stiffness: 320 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              {/* ── Header ────────────────────────────────────────── */}
              <div className="bg-slate-900 rounded-t-2xl px-6 py-5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-orange-400 tracking-widest mb-1">CONFIRMAÇÃO MANUAL</p>
                  <h2 className="text-white font-bold text-lg">Pagamento via Zelle</h2>
                </div>
                <button
                  onClick={() => !loading && setOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="h-0.5 bg-orange-500" />

              {/* ── Success state ─────────────────────────────────── */}
              {confirmed ? (
                <div className="px-6 py-10 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-9 h-9 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Pagamento Confirmado!</h3>
                  <p className="text-slate-500 text-sm">
                    O pedido entrou em tradução e a Isabele foi notificada por e-mail.
                  </p>
                </div>
              ) : (
                <div className="px-6 py-5">

                  {/* ── Order summary card ──────────────────────── */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Cliente</p>
                        <p className="text-sm font-bold text-slate-800">{order.user?.fullName ?? '—'}</p>
                        <p className="text-xs text-slate-500">{order.user?.email ?? ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Valor</p>
                        <p className="text-xl font-bold text-green-600">${(order.totalAmount ?? 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Documentos</p>
                        <p className="text-sm font-semibold text-slate-700">
                          {order.documents?.length ?? 0} docs
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Urgência</p>
                        <p className="text-sm font-semibold text-slate-700 capitalize">{order.urgency ?? 'standard'}</p>
                      </div>
                    </div>
                  </div>

                  {/* ── Reference field ─────────────────────────── */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Referência da transferência Zelle <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={reference}
                      onChange={e => { setRef(e.target.value); setError(null) }}
                      placeholder="Ex: ZL-2024-0048, últimos 4 dígitos, nome remetente..."
                      className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all"
                      disabled={loading}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Número de confirmação, nome ou qualquer referência da transferência
                    </p>
                  </div>

                  {/* ── Notes field ──────────────────────────────── */}
                  <div className="mb-5">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Observações (opcional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Ex: pagamento em duas parcelas, data diferente..."
                      rows={2}
                      className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all resize-none"
                      disabled={loading}
                    />
                  </div>

                  {/* ── Error ────────────────────────────────────── */}
                  {error && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mb-4">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* ── What happens next ────────────────────────── */}
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5">
                    <p className="text-xs font-bold text-orange-700 mb-2.5">Ao confirmar, automaticamente:</p>
                    <div className="space-y-2">
                      {[
                        { icon: ShieldCheck, text: 'Pedido marcado como Em Tradução' },
                        { icon: FileText,    text: 'DeepL processa todos os documentos' },
                        { icon: Clock,       text: 'Isabele recebe notificação por e-mail' },
                        { icon: CheckCircle, text: 'Cliente recebe confirmação por e-mail' },
                      ].map(({ icon: Icon, text }) => (
                        <div key={text} className="flex items-center gap-2.5">
                          <Icon className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                          <span className="text-xs text-orange-800">{text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Actions ──────────────────────────────────── */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setOpen(false)}
                      disabled={loading}
                      className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-all text-sm disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleConfirm}
                      disabled={loading || !reference.trim()}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-md"
                    >
                      {loading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirmando...</>
                        : <><CheckCircle className="w-4 h-4" /> Confirmar Pagamento</>
                      }
                    </button>
                  </div>

                  {/* Audit trail note */}
                  <p className="text-[10px] text-slate-400 text-center mt-3">
                    Confirmado por: <strong>{confirmedByName}</strong> · {new Date().toLocaleDateString('pt-BR')}
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
