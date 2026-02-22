import { getCurrentUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { DollarSign, FileText, PieChart } from 'lucide-react'

export const dynamic = 'force-dynamic'

const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
}

const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
}

export default async function FinanceDashboard() {
    const currentUser = await getCurrentUser()
    const role = currentUser?.role as unknown as string

    if (!currentUser || (role !== 'FINANCIAL' && role !== 'OPERATIONS')) {
        redirect('/admin')
    }

    const orders = await prisma.order.findMany({
        where: {
            // Include Stripe and Pix orders where possible
            // paymentMethod might not be fully populated conceptually, but we simulate a view
            paymentProvider: { in: ['STRIPE', 'PARCELADO_USA'] },
            status: { notIn: ['PENDING', 'PENDING_PAYMENT', 'CANCELLED'] as any },
        },
        include: {
            user: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    })

    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0)
    const pendingCount = orders.filter(o => o.status === 'PENDING').length

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8">
            <header>
                <h1 className="text-3xl font-bold text-gray-900">Dashboard Financeiro</h1>
                <p className="text-gray-500 mt-2">Conciliação de pagamentos e painel de controle.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-green-100 p-4 rounded-full text-green-600">
                        <DollarSign className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Receita Total Estimada</p>
                        <p className="text-2xl font-bold text-gray-900">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalRevenue)}
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-yellow-100 p-4 rounded-full text-yellow-600">
                        <FileText className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Pedidos Em Processo</p>
                        <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-blue-100 p-4 rounded-full text-blue-600">
                        <PieChart className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Saldos 50% Pendentes</p>
                        <p className="text-2xl font-bold text-gray-900">Visualizar</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-8">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 font-medium">Pedido</th>
                            <th className="px-6 py-4 font-medium">Data</th>
                            <th className="px-6 py-4 font-medium">Gateways</th>
                            <th className="px-6 py-4 font-medium">Valor</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {orders.map(order => (
                            <tr key={order.id} className="hover:bg-gray-50/50">
                                <td className="px-6 py-4 font-medium text-gray-900">#{order.id} - {order.user.fullName}</td>
                                <td className="px-6 py-4 text-gray-500">{formatDate(order.createdAt)}</td>
                                <td className="px-6 py-4 text-gray-500">{order.paymentProvider}</td>
                                <td className="px-6 py-4 font-bold text-green-600 mr-2">
                                    {formatCurrency(order.totalAmount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
