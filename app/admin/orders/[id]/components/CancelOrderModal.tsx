'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { cancelOrder } from '@/app/actions/adminOrders'

interface Props {
    orderId: number
    isCancelled: boolean
}

const CANCEL_REASON_OPTIONS = [
    { value: 'CLIENT_DROPOUT', label: 'Desistência do cliente' },
    { value: 'PAYMENT_NOT_CONFIRMED', label: 'Pagamento não confirmado' },
    { value: 'DUPLICATE_ORDER', label: 'Pedido duplicado' },
    { value: 'REGISTRATION_ERROR', label: 'Erro de cadastro' },
    { value: 'UNFEASIBLE_DOCUMENTATION', label: 'Documentação inviável' },
    { value: 'INTERNAL_REQUEST', label: 'Solicitação interna' },
    { value: 'OTHER', label: 'Outro' },
] as const

type CancelReasonCode = (typeof CANCEL_REASON_OPTIONS)[number]['value']

export default function CancelOrderButton({ orderId, isCancelled }: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [reasonCode, setReasonCode] = useState<CancelReasonCode | ''>('')
    const [reasonDetail, setReasonDetail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    if (isCancelled) return null

    const reasonRequiresDetail = reasonCode === 'OTHER'

    const handleConfirm = async () => {
        if (!reasonCode) {
            setError('Selecione um motivo para cancelar o pedido.')
            return
        }
        if (reasonRequiresDetail && !reasonDetail.trim()) {
            setError('Descreva o motivo do cancelamento.')
            return
        }

        setLoading(true)
        setError('')
        const res = await cancelOrder(orderId, {
            reasonCode,
            reasonDetail: reasonDetail.trim() || null,
        })
        if (res.success) {
            router.push('/admin/orders')
        } else {
            setError(res.error || 'Erro ao cancelar pedido.')
            setLoading(false)
        }
    }

    const handleClose = () => {
        if (loading) return
        setOpen(false)
        setReasonCode('')
        setReasonDetail('')
        setError('')
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
            >
                <XCircle className="h-3.5 w-3.5" />
                Cancelar Pedido
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900">Cancelar este pedido?</h2>
                                <p className="text-xs text-gray-500">
                                    Este pedido será removido da bancada principal e enviado para a área de cancelados. Essa ação poderá ser auditada posteriormente.
                                </p>
                            </div>
                        </div>

                        <div className="px-5 py-4 space-y-4">
                            <div>
                                <label htmlFor="cancel-reason" className="block text-xs font-semibold text-gray-700 mb-1.5">
                                    Motivo do cancelamento <span className="text-red-500">*</span>
                                </label>
                                <select
                                    id="cancel-reason"
                                    value={reasonCode}
                                    onChange={(e) => {
                                        setReasonCode(e.target.value as CancelReasonCode | '')
                                        setError('')
                                    }}
                                    disabled={loading}
                                    className="w-full h-10 text-sm border border-gray-200 rounded-lg px-3 focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none disabled:opacity-50"
                                >
                                    <option value="">Selecione um motivo</option>
                                    {CANCEL_REASON_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                    Detalhes adicionais {reasonRequiresDetail ? <span className="text-red-500">*</span> : <span className="text-gray-400">(opcional)</span>}
                                </label>
                                <textarea
                                    value={reasonDetail}
                                    onChange={(e) => {
                                        setReasonDetail(e.target.value)
                                        setError('')
                                    }}
                                    placeholder={
                                        reasonRequiresDetail
                                            ? 'Descreva o motivo com detalhes.'
                                            : 'Opcional: detalhe adicional sobre o cancelamento.'
                                    }
                                    rows={3}
                                    disabled={loading}
                                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none disabled:opacity-50 placeholder:text-gray-400"
                                />
                                <p className="mt-1 text-[11px] text-gray-500">
                                    Opcional, exceto quando o motivo for &ldquo;Outro&rdquo;.
                                </p>
                            </div>

                            {error && (
                                <p className="text-xs text-red-600">{error}</p>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 px-5 py-4 bg-gray-50 border-t border-gray-100">
                            <button
                                onClick={handleClose}
                                disabled={loading}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Voltar
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={loading || !reasonCode || (reasonRequiresDetail && !reasonDetail.trim())}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Confirmar cancelamento
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
