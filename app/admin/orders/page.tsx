import prisma from '@/lib/prisma';
import { Eye, FileText, Calendar, DollarSign, User, Plus } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUser } from '@/app/actions/auth';
import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage() {
    const currentUser = await getCurrentUser();

    // Role protection
    if (currentUser?.role === Role.FINANCIAL) redirect('/admin/finance');
    if (currentUser?.role === Role.PARTNER) redirect('/admin/executive');

    const orders = await prisma.order.findMany({
        include: {
            user: true,
            documents: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PAID':
                return 'bg-green-100 text-green-800 border-green-200';
            case 'COMPLETED':
                return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'PENDING':
                return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'TRANSLATING':
                return 'bg-indigo-100 text-indigo-800 border-indigo-200';
            case 'NOTARIZING':
                return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'FAILED':
            case 'CANCELLED':
                return 'bg-red-100 text-red-800 border-red-200';
            case 'READY_FOR_REVIEW':
                return 'bg-teal-100 text-teal-800 border-teal-200';
            case 'MANUAL_TRANSLATION_NEEDED':
                return 'bg-orange-100 text-orange-800 border-orange-200';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);
    };

    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('en-US', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Gerenciamento de Pedidos</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Visualizando {orders.length} pedidos
                    </p>
                </div>
                <Link
                    href="/admin/orcamento-manual"
                    className="inline-flex items-center gap-2 bg-[#f58220] hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                    <Plus className="w-5 h-5" />
                    Gerar Proposta Comercial
                </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 font-medium">ID</th>
                                <th className="px-6 py-4 font-medium">Cliente</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium">Data</th>
                                <th className="px-6 py-4 font-medium">Total</th>
                                <th className="px-6 py-4 font-medium">Documentos</th>
                                <th className="px-6 py-4 font-medium text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {orders.map((order) => (
                                <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        #{order.id}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <div>
                                                {/* Exibir User ou N/A se null */}
                                                <div className="font-medium text-gray-900">{order.user?.fullName || 'N/A'}</div>
                                                <div className="text-xs text-gray-500">{order.user?.email || 'N/A'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                                                order.status
                                            )}`}
                                        >
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-gray-400" />
                                            {formatDate(order.createdAt)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        {formatCurrency(order.totalAmount)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1 text-gray-500">
                                            <FileText className="w-4 h-4" />
                                            <span>{order.documents.length} arquivos</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link
                                            href={`/admin/orders/${order.id}`} // Verifique se essa rota de detalhe existe ou crie
                                            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                            Ver Detalhes
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {orders.length === 0 && (
                    <div className="p-12 text-center text-gray-500 bg-gray-50 bg-opacity-50">
                        <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-gray-900">Nenhum pedido encontrado</h3>
                        <p>Os novos pedidos aparecerão aqui.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
