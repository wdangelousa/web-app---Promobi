import { getCurrentUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { PieChart, TrendingUp, Users, CheckCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ExecutiveDashboard() {
    const currentUser = await getCurrentUser()
    const role = currentUser?.role as unknown as string

    if (!currentUser || (role !== 'PARTNER' && role !== 'OPERATIONS')) {
        redirect('/admin')
    }

    // 24h Executive View metrics
    const orders = await prisma.order.findMany({
        orderBy: { createdAt: 'desc' }
    })

    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0)
    const completedOrders = orders.filter(o => o.status === 'COMPLETED')
    const totalClients = new Set(orders.map(o => o.userId)).size

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Dashboard Executivo</h1>
                    <p className="text-gray-500 mt-2">Visão geral executiva 24h (Read-Only).</p>
                </div>
                <div className="bg-blue-50 text-blue-700 font-medium px-4 py-2 rounded-lg text-sm border border-blue-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                    Live Data
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Receita Total Acumulada</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue)}
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="bg-purple-50 p-3 rounded-lg text-purple-600">
                            <PieChart className="w-6 h-6" />
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Volume Total de Pedidos</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{orders.length}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="bg-green-50 p-3 rounded-lg text-green-600">
                            <CheckCircle className="w-6 h-6" />
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Pedidos Concluídos</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{completedOrders.length}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="bg-orange-50 p-3 rounded-lg text-orange-600">
                            <Users className="w-6 h-6" />
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Clientes Únicos</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{totalClients}</p>
                    </div>
                </div>
            </div>

            {/* Quick Chart Placeholder or List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center justify-center min-h-[300px] text-gray-400">
                <TrendingUp className="w-16 h-16 mb-4 text-gray-200" />
                <p>Gráficos em tempo real serão exibidos aqui.</p>
            </div>
        </div>
    )
}
