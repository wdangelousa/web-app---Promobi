import { KanbanOrder } from './types'
import OrderCard from './OrderCard'

type Props = {
    id: string
    label: string
    color: string
    orders: KanbanOrder[]
    onOrderClick: (order: KanbanOrder) => void
}

export default function KanbanColumn({ id, label, color, orders, onOrderClick }: Props) {
    return (
        <div className="w-80 flex flex-col">
            <div className={`p-3 rounded-t-xl font-bold flex justify-between items-center ${color}`}>
                <span>{label}</span>
                <span className="bg-white/50 px-2 py-0.5 rounded-full text-xs">
                    {orders.length}
                </span>
            </div>
            <div className="flex-1 bg-gray-100/50 p-3 rounded-b-xl border border-t-0 border-gray-200 space-y-3 overflow-y-auto max-h-[calc(100vh-200px)]">
                {orders.map(order => (
                    <OrderCard
                        key={order.id}
                        order={order}
                        onClick={onOrderClick}
                    />
                ))}
            </div>
        </div>
    )
}
