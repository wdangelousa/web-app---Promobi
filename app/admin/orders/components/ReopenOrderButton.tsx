'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Loader2, AlertTriangle } from 'lucide-react'
import { reopenOrder } from '@/app/actions/adminOrders'

export default function ReopenOrderButton({ orderId, status }: { orderId: number; status: string }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    if (status === 'COMPLETED') return null

    const handleConfirm = async () => {
        setLoading(true)
        setError('')
        // Yield to main thread (INP)
        setTimeout(async () => {
            try {
                const res = await reopenOrder(orderId)
                if (res.success) {
                    setOpen(false)
                    router.push(`/admin/concierge?orderId=${orderId}`)
                } else {
                    setError(res.error || 'Erro ao reabrir orçamento.')
                    setLoading(false)
                }
            } catch (err: any) {
                setError(err.message || 'Erro inesperado.')
                setLoading(false)
            }
        }, 0)
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors border border-amber-200"
                title="Reabrir orçamento internamente"
            >
                <RotateCcw className="w-3.5 h-3.5" />
                Reabrir
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-amber-600" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900">Reabrir Orçamento #{orderId}</h2>
                                <p className="text-xs text-gray-500">O pedido voltará para rascunho interno.</p>
                            </div>
                        </div>

                        <div className="px-5 py-4 text-sm text-gray-600 space-y-1">
                            <p>O pedido será revertido para a fase de <strong>rascunho interno (Draft)</strong>.</p>
                            <p className="text-xs text-gray-400 mt-2">O cliente <strong>NÃO</strong> será notificado até que você reenvie a proposta oficial.</p>
                            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
                        </div>

                        <div className="flex justify-end gap-2 px-5 py-4 bg-gray-50 border-t border-gray-100">
                            <button
                                onClick={() => { setOpen(false); setError('') }}
                                disabled={loading}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={loading}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                            >
                                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Confirmar Reabertura
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
