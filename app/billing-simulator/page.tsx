'use client'

import { useState, useEffect } from 'react'

// --- MOCK DATA & TYPES ---

type OrderItem = {
    id: string;
    name: string;
    price: number;
}

type Order = {
    id: string;
    date: string;
    items: OrderItem[];
    subtotal: number;
    tax: number;
    total: number;
    status: 'PENDING' | 'PAID';
}

const INITIAL_PENDING_ORDER: Order = {
    id: '', // Not assigned until paid or formally generated
    date: new Date().toLocaleDateString('pt-BR'),
    items: [
        { id: 'item-1', name: 'Tradução Certificada - Certidão de Nascimento', price: 50.00 },
        { id: 'item-2', name: 'Taxa de Urgência (24h)', price: 25.00 }
    ],
    subtotal: 75.00,
    tax: 0.00,
    total: 75.00,
    status: 'PENDING'
}

const INITIAL_PAID_ORDERS: Order[] = [
    {
        id: '#PRO-9823',
        date: '10/10/2023',
        items: [
            { id: 'old-1', name: 'Tradução - Histórico Escolar', price: 120.00 },
            { id: 'old-2', name: 'Notarização', price: 25.00 }
        ],
        subtotal: 145.00,
        tax: 0.00,
        total: 145.00,
        status: 'PAID'
    }
]

export default function FaturamentoPage() {
    const [currentOrder, setCurrentOrder] = useState<Order | null>(INITIAL_PENDING_ORDER)
    const [paidOrders, setPaidOrders] = useState<Order[]>(INITIAL_PAID_ORDERS)

    const [isProcessing, setIsProcessing] = useState(false)
    const [paymentSuccess, setPaymentSuccess] = useState(false)

    // --- LOGIC ---

    const handleAddItem = () => {
        if (!currentOrder) return;

        const newItem: OrderItem = {
            id: `item-${Date.now()}`,
            name: 'Tradução Adicional - Documento Extra',
            price: 35.00
        }

        const newItems = [...currentOrder.items, newItem]
        const newSubtotal = newItems.reduce((acc, item) => acc + item.price, 0)
        // Simulate a 5% tax or processing fee, or flat fee if you want
        const newTax = newSubtotal * 0.05
        const newTotal = newSubtotal + newTax

        setCurrentOrder({
            ...currentOrder,
            items: newItems,
            subtotal: newSubtotal,
            tax: newTax,
            total: newTotal
        })
    }

    const simulatePayment = () => {
        if (!currentOrder || currentOrder.items.length === 0) return;

        setIsProcessing(true)

        // Simulate network request
        setTimeout(() => {
            const completedOrder: Order = {
                ...currentOrder,
                id: `#PRO-${Math.floor(1000 + Math.random() * 9000)}`,
                date: new Date().toLocaleDateString('pt-BR'),
                status: 'PAID'
            }

            setPaidOrders([completedOrder, ...paidOrders])
            setCurrentOrder(null)
            setIsProcessing(false)
            setPaymentSuccess(true)

            // Hide success message after 3 seconds
            setTimeout(() => setPaymentSuccess(false), 3000)
        }, 1500)
    }

    const startNewOrder = () => {
        setCurrentOrder({
            id: '',
            date: new Date().toLocaleDateString('pt-BR'),
            items: [],
            subtotal: 0,
            tax: 0,
            total: 0,
            status: 'PENDING'
        })
    }

    // --- RENDER ---

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 p-6 md:p-12">
            <div className="max-w-6xl mx-auto">
                <header className="mb-10">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Faturamento & Orçamentos 💳</h1>
                    <p className="text-slate-500 mt-2">Gerencie seus serviços, pagamentos e histórico financeiro.</p>
                </header>

                {paymentSuccess && (
                    <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                        <span className="text-2xl">🎉</span>
                        <div>
                            <p className="font-bold text-green-800">Pagamento Confirmado!</p>
                            <p className="text-sm text-green-700">Obrigado pela preferência. Seu pedido foi processado com sucesso.</p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* COLUNA ESQUERDA: ORÇAMENTO ATUAL (CARRINHO) */}
                    <div className="lg:col-span-7 space-y-6">
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                                    🛒 Orçamento Pendente
                                </h2>
                                {!currentOrder && (
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">VAZIO</span>
                                )}
                            </div>

                            <div className="p-6">
                                {currentOrder ? (
                                    <div className="space-y-6">

                                        {/* Lista de Itens (Mutável) */}
                                        <div className="space-y-3">
                                            {currentOrder.items.length === 0 ? (
                                                <p className="text-sm text-slate-500 italic text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                                    Nenhum serviço adicionado ainda.
                                                </p>
                                            ) : (
                                                currentOrder.items.map((item, index) => (
                                                    <div key={item.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold">
                                                                {index + 1}
                                                            </div>
                                                            <span className="text-sm font-medium text-slate-700">{item.name}</span>
                                                        </div>
                                                        <span className="font-semibold text-slate-900">${item.price.toFixed(2)}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* Ação Secundária: Adicionar mais */}
                                        <button
                                            onClick={handleAddItem}
                                            className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all flex items-center justify-center gap-2 text-sm"
                                        >
                                            ➕ Adicionar Documento/Serviço
                                        </button>

                                        {/* Resumo de Custos */}
                                        <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-2">
                                            <div className="flex justify-between text-sm text-slate-500">
                                                <span>Subtotal</span>
                                                <span>${currentOrder.subtotal.toFixed(2)}</span>
                                            </div>
                                            {currentOrder.tax > 0 && (
                                                <div className="flex justify-between text-sm text-slate-500">
                                                    <span>Taxas Administrativas</span>
                                                    <span>${currentOrder.tax.toFixed(2)}</span>
                                                </div>
                                            )}
                                            <div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-end">
                                                <span className="font-bold text-slate-800">Total a Pagar</span>
                                                <span className="text-3xl font-black text-slate-900 tracking-tight">
                                                    ${currentOrder.total.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Ação Primária: Pagamento */}
                                        <div className="pt-2">
                                            <button
                                                onClick={simulatePayment}
                                                disabled={isProcessing || currentOrder.items.length === 0}
                                                className="w-full bg-[#22c55e] hover:bg-green-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg shadow-green-500/20 transition-all flex items-center justify-center gap-2 text-lg active:scale-[0.98]"
                                            >
                                                {isProcessing ? (
                                                    <span className="animate-pulse">Processando pagamento... ⏳</span>
                                                ) : (
                                                    <>💳 Ir para Pagamento Seguro (${currentOrder.total.toFixed(2)})</>
                                                )}
                                            </button>
                                            <div className="text-center mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500 font-medium">
                                                <span>🔒</span> Transação criptografada de ponta a ponta
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-12 text-center flex flex-col items-center">
                                        <div className="text-4xl mb-4 opacity-50">🛒</div>
                                        <h3 className="text-lg font-bold text-slate-700">Nenhum orçamento pendente</h3>
                                        <p className="text-slate-500 mt-1 max-w-sm">Você não possui pedidos aguardando pagamento no momento.</p>
                                        <button
                                            onClick={startNewOrder}
                                            className="mt-6 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-6 rounded-lg transition-colors text-sm"
                                        >
                                            ➕ Iniciar Novo Orçamento
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* COLUNA DIREITA: HISTÓRICO DE SERVIÇOS (PEDIDOS PAGOS) */}
                    <div className="lg:col-span-5 space-y-6">
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                                    🧾 Serviços Contratados
                                </h2>
                                <p className="text-xs text-slate-500 mt-1">Histórico de pedidos já pagos e finalizados.</p>
                            </div>

                            <div className="p-6 flex-1 bg-slate-50/30 overflow-y-auto space-y-4 max-h-[800px]">
                                {paidOrders.length === 0 ? (
                                    <p className="text-sm text-slate-500 italic text-center py-8">
                                        Nenhum histórico encontrado.
                                    </p>
                                ) : (
                                    paidOrders.map((order) => (
                                        <div key={order.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-[#22c55e]/30 transition-colors group">

                                            {/* Cabeçalho do Card */}
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded uppercase tracking-wider mb-2">
                                                        Pago ✅
                                                    </span>
                                                    <h4 className="font-bold text-slate-900">{order.id}</h4>
                                                    <p className="text-xs text-slate-400">{order.date}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="block font-bold text-slate-900">${order.total.toFixed(2)}</span>
                                                </div>
                                            </div>

                                            {/* Linha Divisória */}
                                            <div className="h-px bg-slate-100 my-3 w-full"></div>

                                            {/* Itens do Pedido (Trancados) */}
                                            <div className="space-y-2 mb-4">
                                                {order.items.map(item => (
                                                    <div key={item.id} className="flex justify-between text-xs text-slate-500">
                                                        <span className="truncate pr-2">↳ {item.name}</span>
                                                        <span className="shrink-0">${item.price.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Botões do Histórico */}
                                            <div className="flex gap-2 mt-4 pt-3 border-t border-slate-50">
                                                <button className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                                                    📥 Baixar Recibo (PDF)
                                                </button>
                                                <button className="w-10 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center" title="Detalhes do Pedido">
                                                    👁️
                                                </button>
                                            </div>

                                            {/* Warning Imutabilidade (Aparece no Hover) */}
                                            <p className="text-[9px] text-slate-400 mt-3 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                ⚠️ Pedido trancado. Para novos serviços, crie um novo orçamento.
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                    </div>

                </div>
            </div>
        </div>
    )
}
