'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KanbanOrder, DetailOrder } from './types' // Updated types
import KanbanColumn from './KanbanColumn'
import OrderDetailModal from './OrderDetailModal'
import { getOrderDetails } from '../actions' // New action

type Props = {
    initialOrders: KanbanOrder[]
}

const COLUMNS = [
    { id: 'PENDING', label: 'Novos Pedidos', color: 'bg-yellow-100 text-yellow-800' },
    { id: 'TRANSLATING', label: 'Em Tradução', color: 'bg-blue-100 text-blue-800' },
    { id: 'NOTARIZING', label: 'Para Notarização', color: 'bg-purple-100 text-purple-800' },
    { id: 'COMPLETED', label: 'Concluídos', color: 'bg-green-100 text-green-800' },
]

export default function AdminDashboard({ initialOrders }: Props) {
    const [orders, setOrders] = useState<KanbanOrder[]>(initialOrders)
    const [selectedOrder, setSelectedOrder] = useState<DetailOrder | null>(null)
    const [loadingDetails, setLoadingDetails] = useState(false)
    const router = useRouter()

    const getColumnOrders = (status: string) => orders.filter(o => o.status === status)

    // Handle click on card: Fetch full details then show modal
    const handleCardClick = async (order: KanbanOrder) => {
        setLoadingDetails(true)
        const result = await getOrderDetails(order.id)
        if (result.success && result.data) {
            // Cast the result to DetailOrder because the action return type logic 
            // in client component might infer incorrectly without explicit shared type or Zod
            // But our types.ts aligns with the query.
            setSelectedOrder(result.data as unknown as DetailOrder)
        } else {
            alert("Erro ao carregar detalhes do pedido")
        }
        setLoadingDetails(false)
    }

    const handleOrderUpdate = (updatedOrder: DetailOrder) => {
        // Update the efficient list with the new status/tracking from the detailed view
        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? {
            ...o,
            status: updatedOrder.status,
            uspsTracking: updatedOrder.uspsTracking
        } : o))

        setSelectedOrder(updatedOrder)
        router.refresh() // Sync server components
    }

    return (
        <div className="h-full flex flex-col">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Quadro de Pedidos</h2>
                    <p className="text-gray-500">Gerencie o fluxo de trabalho</p>
                </div>
                <button
                    onClick={() => router.refresh()}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                >
                    Atualizar
                </button>
            </header>

            {/* Kanban Board */}
            <div className={`flex-1 overflow-x-auto ${loadingDetails ? 'opacity-70 pointer-events-none' : ''}`}>
                <div className="flex gap-6 min-w-max h-full pb-4">
                    {COLUMNS.map(col => (
                        <KanbanColumn
                            key={col.id}
                            id={col.id}
                            label={col.label}
                            color={col.color}
                            orders={getColumnOrders(col.id)}
                            onOrderClick={handleCardClick}
                        />
                    ))}
                </div>
            </div>

            {/* simple loading overlay */}
            {loadingDetails && (
                <div className="fixed inset-0 z-40 bg-black/10 flex items-center justify-center">
                    <div className="bg-white p-4 rounded-full shadow-lg">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f58220]"></div>
                    </div>
                </div>
            )}

            {/* Order Detail Modal */}
            {selectedOrder && (
                <OrderDetailModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onUpdate={handleOrderUpdate}
                />
            )}
        </div>
    )
}
