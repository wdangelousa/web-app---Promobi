import prisma from '@/lib/prisma'
import { Badge } from 'lucide-react'
// Note: Lucide Badge is not a standard icon name in all versions, checking available icons.
// Using compatible icons: FileText, Stamp (if avail) or Award, CheckCircle, Clock.
import { FileText, Award, CheckCircle, Clock, AlertCircle, Search, Filter, MoreHorizontal, X, Upload, Send } from 'lucide-react'
import Link from 'next/link'
import { updateOrderStatus } from '@/app/actions/adminOrders'
import { redirect } from 'next/navigation'
import AdminOrderList from './components/AdminOrderList' // Client component for interactivity

export const dynamic = 'force-dynamic'

export default async function AdminOrdersPage() {
    // Fetch orders with relation to User
    const orders = await prisma.order.findMany({
        include: {
            user: true,
            documents: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    })

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                        <span className="text-[#f58220]">Promobi</span> Admin
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Gestão Centralizada de Pedidos</p>
                </div>

                <div className="flex gap-3">
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center min-w-[100px]">
                        <span className="text-2xl font-bold text-white">{orders.length}</span>
                        <span className="text-xs text-slate-400 uppercase tracking-wider">Total</span>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center min-w-[100px]">
                        <span className="text-2xl font-bold text-blue-400">
                            {orders.filter(o => o.status === 'PENDING').length}
                        </span>
                        <span className="text-xs text-slate-400 uppercase tracking-wider">Pendentes</span>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center min-w-[100px]">
                        <span className="text-2xl font-bold text-green-400">
                            {orders.filter(o => o.status === 'COMPLETED' || o.status === 'PAID').length}
                        </span>
                        <span className="text-xs text-slate-400 uppercase tracking-wider">Concluídos</span>
                    </div>
                </div>
            </div>

            {/* Main Content - Client Component for Interactivity */}
            <AdminOrderList initialOrders={orders} />
        </div>
    )
}
