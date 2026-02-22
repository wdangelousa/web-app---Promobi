import prisma from '@/lib/prisma'
import { notFound } from 'next/navigation'
import PayClient from './PayClient'
import Image from 'next/image'

export default async function PayPage({ params }: { params: { orderId: string } }) {
    const orderId = parseInt(params.orderId)

    if (isNaN(orderId)) {
        notFound()
    }

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            user: true,
            documents: true
        }
    })

    if (!order) {
        notFound()
    }

    // Parse metadata for breakdown and density
    let metadataParsed = {}
    try {
        metadataParsed = order.metadata ? JSON.parse(order.metadata) : {}
    } catch (e) {
        console.error("Failed to parse metadata", e)
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-[#f58220]/20 pb-20">
            {/* Header / Brand */}
            <header className="bg-white border-b border-gray-100 py-6">
                <div className="max-w-7xl mx-auto px-4 flex items-center justify-center">
                    <Image src="/logo.png" width={480} height={165} alt="Promobi" className="object-contain h-12 w-auto" />
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 pt-12">
                <PayClient order={order as any} metadata={metadataParsed} />
            </main>

            <footer className="max-w-4xl mx-auto px-4 pt-12 text-center text-xs text-slate-400">
                <p>&copy; 2024 Promobi Services LLC. Todos os direitos reservados.</p>
                <p className="mt-1">Pagamento Seguro & Criptografado</p>
            </footer>
        </div>
    )
}
