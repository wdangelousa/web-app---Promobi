import prisma from '../../../../lib/prisma'
import Workbench from './components/Workbench'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function OrderWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const orderId = parseInt(id)

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            user: true,
            documents: true
        }
    })

    if (!order) {
        return <div className="p-8 text-center text-red-600">Pedido não encontrado</div>
    }

    // Data Sanitization (Pruning) com verificação de nulidade para evitar erros na tela
    const sanitizedOrder = {
        ...order,
        createdAt: order.createdAt.toISOString(),
        user: order.user ? {
            ...order.user,
            createdAt: order.user.createdAt.toISOString()
        } : null,
        documents: order.documents ? order.documents.map(doc => ({
            ...doc,
            createdAt: doc.createdAt.toISOString()
        })) : []
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft className="h-5 w-5 text-gray-500" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Workbench de Tradução</h1>
                        <p className="text-xs text-gray-500">Pedido #{sanitizedOrder.id || '---'} • {sanitizedOrder.user?.fullName || 'Cliente Desconhecido'}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${sanitizedOrder.status === 'READY_FOR_REVIEW' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        sanitizedOrder.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' :
                            'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>
                        {sanitizedOrder.status || 'STATUS_ERROR'}
                    </span>
                </div>
            </div>

            {/* Workbench Client Component */}
            <div className="flex-1 overflow-hidden">
                <Workbench order={sanitizedOrder as any} />
            </div>
        </div>
    )
}