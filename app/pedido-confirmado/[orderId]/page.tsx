'use client'

import { use } from 'react'
import Link from 'next/link'
import { CheckCircle, Home } from 'lucide-react'

export default function OrderConfirmed({ params }: { params: Promise<{ orderId: string }> }) {
    const { orderId } = use(params)

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full space-y-6">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="h-10 w-10 text-green-600" />
                </div>

                <h1 className="text-3xl font-bold text-gray-900">Pedido Confirmado!</h1>

                <p className="text-gray-600">
                    Seu pedido foi registrado com sucesso. Entraremos em contato em breve pelo e-mail/WhatsApp informado para os próximos passos.
                </p>

                <div className="bg-gray-100 p-4 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-bold">Número do Pedido</p>
                    <p className="text-xl font-mono font-bold text-gray-800">{orderId}</p>
                </div>

                <Link
                    href="/"
                    className="block w-full py-3 bg-[#f58220] text-white font-bold rounded-lg hover:bg-orange-600 transition-colors"
                >
                    Voltar para o Início
                </Link>
            </div>
        </div>
    )
}
