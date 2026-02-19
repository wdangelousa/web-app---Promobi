import Link from 'next/link'
import { QrCode, Home } from 'lucide-react'

export default async function PixSuccessPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const { orderId, simulated } = await searchParams

    // Server Action for button
    async function triggerSimulation() {
        'use server'
        const { simulateWebhook } = await import('../actions/simulateWebhook');
        if (orderId) await simulateWebhook(parseInt(String(orderId)));
        // Redirect to admin or just refresh? For now just refresh or show success.
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full space-y-6">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                    <QrCode className="h-10 w-10 text-blue-600" />
                </div>

                <h1 className="text-3xl font-bold text-gray-900">Pagar com Pix</h1>
                <p className="text-gray-600">
                    Pedido #{orderId} criado. Para finalizar, escaneie o código abaixo (Simulação).
                </p>

                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 bg-gray-50 my-4">
                    <p className="font-mono text-sm text-gray-500 break-all">
                        00020126360014BR.GOV.BCB.PIX0114+551199999999520400005303986540510.005802BR5913Promobi LLC6008Orlando62070503***6304E2CA
                    </p>
                </div>

                <div className="space-y-4 pt-4">
                    {simulated && (
                        <form action={triggerSimulation}>
                            <button type="submit" className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition-colors shadow-lg animate-pulse">
                                Simular "Pagamento Confirmado"
                            </button>
                            <p className="text-xs text-gray-400 mt-2">Isso disparará o Webhook e a IA do DeepL.</p>
                        </form>
                    )}

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
