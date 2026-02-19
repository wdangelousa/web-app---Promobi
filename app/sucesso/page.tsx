import Link from 'next/link'
import { CheckCircle, Home } from 'lucide-react'

export default async function SuccessPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const { orderId } = await searchParams

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full space-y-6">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="h-10 w-10 text-green-600" />
                </div>

                <h1 className="text-3xl font-bold text-gray-900">Pagamento Confirmado!</h1>
                <p className="text-gray-600">
                    Seu pedido #{orderId} foi recebido com sucesso. Nossa equipe iniciará o processamento da sua tradução imediatamente.
                </p>

                <div className="pt-4">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-[#f58220] font-bold hover:underline"
                    >
                        <Home className="h-4 w-4" />
                        Voltar para o Início
                    </Link>
                </div>
            </div>
        </div>
    )
}
