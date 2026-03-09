import { FileText, Copy, Link as LinkIcon } from 'lucide-react'
import { KanbanOrder } from './types'
import { useUIFeedback } from '../../../components/UIFeedbackProvider'

type Props = {
    order: KanbanOrder
    onClick: (order: KanbanOrder) => void
}

export default function OrderCard({ order, onClick }: Props) {
    const metadataStr = typeof order.metadata === 'string' ? order.metadata : JSON.stringify(order.metadata || {});
    const { toast } = useUIFeedback();

    const hasNotary = metadataStr.includes('"notarize":true') ||
        metadataStr.includes('"notarized":true') ||
        metadataStr.includes('"serviceType":"notarization"');

    const handleCopyLink = (e: React.MouseEvent) => {
        e.stopPropagation();
        const link = `${window.location.origin}/proposta/${order.id}`;
        navigator.clipboard.writeText(link);
        toast.success('Link da proposta copiado!');
    };

    return (
        <div
            onClick={() => onClick(order)}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group flex flex-col h-full"
        >
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-gray-400 font-mono">#{order.id?.toString().padStart(6, '0') || '000000'}</span>
                <div className="flex gap-1 flex-col items-end">
                    {order.urgency !== 'normal' && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                            ⚡ URGENTE
                        </span>
                    )}
                    {hasNotary && (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                            ⚖️ NOTARIZAÇÃO
                        </span>
                    )}
                </div>
            </div>
            <h4 className="font-bold text-gray-800 mb-1 flex-1">{order.user?.fullName || 'Cliente N/A'}</h4>
            <div className="flex justify-between items-end text-sm text-gray-500">
                <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <span>{order.documents?.length || 0} docs</span>
                </div>
                <span className="font-bold text-gray-900">${(typeof order.totalAmount === 'number' ? order.totalAmount : 0).toFixed(2)}</span>
            </div>

            {order.status === 'PENDING_PAYMENT' && (
                <button
                    onClick={handleCopyLink}
                    className="mt-auto w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-50 text-[#f58220] hover:bg-[#f58220] hover:text-white border border-orange-200 hover:border-[#f58220] rounded-md text-xs font-bold transition-colors"
                    title="Copiar link para o cliente"
                >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Link
                </button>
            )}
        </div>
    );
}
