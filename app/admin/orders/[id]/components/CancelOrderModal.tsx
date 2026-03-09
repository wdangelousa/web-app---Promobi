'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { cancelOrder } from '@/app/actions/adminOrders'

interface Props {
    orderId: number
    isCancelled: boolean
}

export default function CancelOrderButton({ orderId, isCancelled }: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [reason, setReason] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    if (isCancelled) return null

    const handleConfirm = async () => {
        if (!reason.trim()) {
            setError('A justificativa é obrigatória.')
            return
        }
        setLoading(true)
        setError('')
        const res = await cancelOrder(orderId, reason)
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
        setReason('')
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900">Cancelar Pedido #{orderId}</h2>
                                <p className="text-xs text-gray-500">Esta ação não pode ser desfeita.</p>
                            </div>
                        </div>

                        <div className="px-5 py-4">
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                Justificativa <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => { setReason(e.target.value); setError('') }}
                                placeholder="Descreva o motivo do cancelamento (ex: pedido de teste, duplicado, solicitação do cliente...)"
                                rows={4}
                                disabled={loading}
                                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none disabled:opacity-50 placeholder:text-gray-400"
                            />
                            {error && (
                                <p className="mt-1.5 text-xs text-red-600">{error}</p>
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
                                disabled={loading || !reason.trim()}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Confirmar Cancelamento
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
