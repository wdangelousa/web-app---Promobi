'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Loader2 } from 'lucide-react'
import { reopenOrder } from '@/app/actions/adminOrders'

const DRAFT_STATUSES = ['PENDING', 'PENDING_PAYMENT', 'AWAITING_VERIFICATION', 'CANCELLED']

export default function ReopenOrderButton({ orderId, status }: { orderId: number; status: string }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    if (DRAFT_STATUSES.includes(status)) return null

    const handleClick = async () => {
        if (!confirm('Deseja reabrir este orçamento? O pedido voltará para a fase de rascunho interno (Draft). O cliente NÃO será notificado até que você reenvie a proposta oficial.')) return
        setLoading(true)
        try {
            const res = await reopenOrder(orderId)
            if (res.success) {
                router.refresh()
            } else {
                alert('Erro ao reabrir: ' + res.error)
            }
        } catch (err: any) {
            alert('Erro inesperado: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleClick}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors border border-amber-200 disabled:opacity-50"
            title="Reabrir orçamento internamente"
        >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Reabrir
        </button>
    )
}
