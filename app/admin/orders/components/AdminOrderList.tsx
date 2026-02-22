'use client'

import { useState } from 'react'
import { FileText, Award, CheckCircle, Clock, AlertCircle, Search, Filter, MoreHorizontal, X, Upload, Send, ChevronRight, Eye } from 'lucide-react'
import { updateOrderStatus } from '@/app/actions/adminOrders'
import Link from 'next/link'

// Helper to format currency
const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

// Helper to format date
const formatDate = (dateString: Date | string) => {
    return new Date(dateString).toLocaleDateString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AdminOrderList({ initialOrders }: { initialOrders: any[] }) {
    const [orders, setOrders] = useState(initialOrders)
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState('ALL')

    // Modal State
    const [selectedOrder, setSelectedOrder] = useState<any>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [loadingAction, setLoadingAction] = useState(false)
    const [deliveryUrl, setDeliveryUrl] = useState('')

    // Filter Logic
    const filteredOrders = orders.filter(order => {
        const matchesSearch =
            order.user?.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.id.toString().includes(searchTerm);

        const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;

        return matchesSearch && matchesStatus;
    })

    const handleOpenModal = (order: any) => {
        setSelectedOrder(order)
        setDeliveryUrl(order.deliveryUrl || '')
        setIsModalOpen(true)
    }

    const handleUpdateStatus = async (newStatus: string) => {
        if (!selectedOrder) return;
        setLoadingAction(true);

        // Optimistic update
        const updatedOrders = orders.map(o => o.id === selectedOrder.id ? { ...o, status: newStatus } : o);
        setOrders(updatedOrders);

        // Server Action
        await updateOrderStatus(selectedOrder.id, newStatus, deliveryUrl || undefined);

        // Update selected order locally
        setSelectedOrder({ ...selectedOrder, status: newStatus });

        setLoadingAction(false);
        setIsModalOpen(false); // Close on success? Or keep open? Let's close.
    }

    const handleNotifyClient = async () => {
        if (!selectedOrder) return;
        setLoadingAction(true);
        // Simulate notification
        await new Promise(resolve => setTimeout(resolve, 1000));
        alert(`E-mail de notificação enviado para ${selectedOrder.user?.email}`);
        setLoadingAction(false);
    }

    return (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-700 flex flex-col sm:flex-row gap-4 justify-between">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, email ou ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 pl-10 pr-4 py-2 rounded-lg focus:ring-2 focus:ring-[#f58220] outline-none"
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg focus:ring-2 focus:ring-[#f58220] outline-none cursor-pointer"
                    >
                        <option value="ALL">Todos os Status</option>
                        <option value="PENDING">Pendente</option>
                        <option value="PAID">Pago</option>
                        <option value="TRANSLATING">Em Tradução</option>
                        <option value="NOTARIZING">Notarizando</option>
                        <option value="COMPLETED">Concluído</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider">
                            <th className="p-4 font-semibold">ID</th>
                            <th className="p-4 font-semibold">Cliente</th>
                            <th className="p-4 font-semibold text-center">Svcs</th>
                            <th className="p-4 font-semibold text-center">Status</th>
                            <th className="p-4 font-semibold text-right">Data</th>
                            <th className="p-4 font-semibold text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {filteredOrders.map(order => (
                            <tr key={order.id} className="hover:bg-slate-700/50 transition-colors group">
                                <td className="p-4 text-slate-300 font-mono">#{order.id}</td>
                                <td className="p-4">
                                    <div className="font-medium text-slate-200">{order.user?.fullName || 'Cliente não ident.'}</div>
                                    <div className="text-xs text-slate-500">{order.user?.email}</div>
                                </td>
                                <td className="p-4">
                                    <div className="flex justify-center gap-1">
                                        {/* Translation Icon */}
                                        <div className={`p-1.5 rounded-md ${order.hasTranslation ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-600 opacity-30'}`} title="Tradução">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        {/* Notary Icon */}
                                        <div className={`p-1.5 rounded-md ${order.hasNotary ? 'bg-[#f58220]/10 text-[#f58220]' : 'bg-slate-800 text-slate-600 opacity-30'}`} title="Notarização">
                                            <Award className="w-4 h-4" />
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 text-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                        ${order.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400' :
                                            order.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400' :
                                                order.status === 'PAID' ? 'bg-blue-500/10 text-blue-400' :
                                                    'bg-slate-700 text-slate-300'}
                                    `}>
                                        {order.status === 'PAID' ? 'PAGO' :
                                            order.status === 'COMPLETED' ? 'CONCLUÍDO' :
                                                order.status === 'PENDING' ? 'PENDENTE' :
                                                    order.status}
                                    </span>
                                </td>
                                <td className="p-4 text-right text-slate-400 text-sm">
                                    {formatDate(order.createdAt)}
                                </td>
                                <td className="p-4 text-right">
                                    <button
                                        onClick={() => handleOpenModal(order)}
                                        className="bg-slate-900 border border-slate-700 hover:border-[#f58220] hover:text-[#f58220] text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                    >
                                        Gerenciar
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredOrders.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-12 text-center text-slate-500">
                                    Nenhum pedido encontrado.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-slate-700 flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    Pedido #{selectedOrder.id}
                                    {selectedOrder.status === 'COMPLETED' && <CheckCircle className="w-5 h-5 text-green-500" />}
                                </h3>
                                <p className="text-sm text-slate-400 mt-1">{selectedOrder.user?.fullName}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-6">

                            {/* Service Info */}
                            <div className="flex gap-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                                <div className={`flex-1 flex flex-col items-center p-2 rounded-lg ${selectedOrder.hasTranslation ? 'text-blue-400' : 'text-slate-600 grayscale'}`}>
                                    <FileText className="w-6 h-6 mb-1" />
                                    <span className="text-xs font-bold">Tradução</span>
                                </div>
                                <div className="w-px bg-slate-700"></div>
                                <div className={`flex-1 flex flex-col items-center p-2 rounded-lg ${selectedOrder.hasNotary ? 'text-[#f58220]' : 'text-slate-600 grayscale'}`}>
                                    <Award className="w-6 h-6 mb-1" />
                                    <span className="text-xs font-bold">Notarização</span>
                                </div>
                            </div>

                            {/* Status Changer */}
                            <div>
                                <label className="block text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Alterar Status</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['PENDING', 'TRANSLATING', 'NOTARIZING', 'COMPLETED'].map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => handleUpdateStatus(status)}
                                            disabled={loadingAction}
                                            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all
                                                ${selectedOrder.status === status
                                                    ? 'bg-[#f58220] border-[#f58220] text-white'
                                                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'}
                                            `}
                                        >
                                            {status}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* File Upload (Delivery) */}
                            <div>
                                <label className="block text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Arquivo Final (URL)</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="https://..."
                                        value={deliveryUrl}
                                        onChange={(e) => setDeliveryUrl(e.target.value)}
                                        className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg focus:ring-1 focus:ring-[#f58220] outline-none text-sm"
                                    />
                                    {/* Mock Upload Button functionality */}
                                    <button className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-lg transition-colors" title="Upload (Simulado)">
                                        <Upload className="w-5 h-5" />
                                    </button>
                                </div>
                                {deliveryUrl && (
                                    <button
                                        onClick={() => handleUpdateStatus('COMPLETED')}
                                        disabled={loadingAction}
                                        className="mt-2 w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold transition-all"
                                    >
                                        <CheckCircle className="w-4 h-4" /> Salvar URL e Concluir Pedido
                                    </button>
                                )}
                            </div>

                            {/* Notify Actions */}
                            <div className="pt-4 border-t border-slate-700">
                                <button
                                    onClick={handleNotifyClient}
                                    disabled={loadingAction}
                                    className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-white text-slate-900 py-3 rounded-xl font-bold transition-all disabled:opacity-50"
                                >
                                    <Send className="w-4 h-4" /> Notificar Cliente
                                </button>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
