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
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group"
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-400 font-mono">#{order.id?.toString().padStart(6, '0') || '000000'}</span>
                    {order.status === 'PENDING_PAYMENT' && (
                        <button
                            onClick={handleCopyLink}
                            className="flex items-center gap-1 text-[10px] font-medium text-[#f58220] hover:text-[#d46d1a] transition-colors"
                            title="Copiar link da proposta"
                        >
                            <Copy className="h-3 w-3" />
                            Copiar Link
                        </button>
                    )}
                </div>
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
            <h4 className="font-bold text-gray-800 mb-1">{order.user?.fullName || 'Cliente N/A'}</h4>
            <div className="flex justify-between items-end text-sm text-gray-500">
                <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <span>{order.documents?.length || 0} docs</span>
                </div>
                <span className="font-bold text-gray-900">${(typeof order.totalAmount === 'number' ? order.totalAmount : 0).toFixed(2)}</span>
            </div>
        </div>
    );
}
