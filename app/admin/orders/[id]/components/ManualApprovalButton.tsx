'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { approvePaymentManually } from '../../../../actions/manualPaymentBypass'

interface ManualApprovalButtonProps {
    orderId: number
}

export default function ManualApprovalButton({ orderId }: ManualApprovalButtonProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [isBypassing, setIsBypassing] = useState(false)

    const handleBypass = () => {
        if (!confirm("Aprovar transação MANUALMENTE e acionar a Inteligência Artificial (DeepL)?")) return;

        setIsBypassing(true)

        startTransition(async () => {
            try {
                const result = await approvePaymentManually(orderId);

                if (result.success) {
                    // Feedback: Exiba um Toast de sucesso e em seguida propague o refresh
                    alert(result.message);
                    router.refresh();
                } else {
                    alert("Erro da API: " + result.error);
                }
            } catch (err: any) {
                console.error("Erro no Bypass Manual:", err);
                alert("Erro de execução: " + (err.message || "Falha na conexão com servidor."));
            } finally {
                setIsBypassing(false)
            }
        })
    }

    const isLoading = isPending || isBypassing

    return (
        <button
            onClick={handleBypass}
            disabled={isLoading}
            className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600 flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <CheckCircle className="h-3 w-3" /> {isLoading ? 'Aprovando e Traduzindo...' : 'Aprovar Pagamento (Manual)'}
        </button>
    )
}
