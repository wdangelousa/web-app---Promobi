import { FileText } from 'lucide-react'
import { KanbanOrder } from './types'

type Props = {
    order: KanbanOrder
    onClick: (order: KanbanOrder) => void
}

export default function OrderCard({ order, onClick }: Props) {
    return (
        <div
            onClick={() => onClick(order)}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group"
        >
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-gray-400 font-mono">#{order.id.toString().padStart(6, '0')}</span>
                {order.urgency !== 'normal' && (
                    <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                        ⚡ URGENTE
                    </span>
                )}
            </div>
            <h4 className="font-bold text-gray-800 mb-1">{order.user.fullName}</h4>
            <div className="flex justify-between items-end text-sm text-gray-500">
                <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <span>{order.documents.length} docs</span>
                </div>
                <span className="font-bold text-gray-900">${order.totalAmount.toFixed(2)}</span>
            </div>
        </div>
    )
}
