import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import ProposalClient from './ProposalClient'
import { getGlobalSettings } from '@/app/actions/settings'

export async function generateMetadata({ params }: { params: Promise<{ order_id: string }> }) {
    const { order_id } = await params;
    const orderId = parseInt(order_id, 10)
    if (isNaN(orderId)) return { title: 'Proposta Inválida' }

    return {
        title: `Proposta #${orderId} - Promobi`,
        description: 'Sua proposta de serviços de tradução certificada',
    }
}

export default async function ProposalPage({ params }: { params: Promise<{ order_id: string }> }) {
    const { order_id } = await params;
    const orderId = parseInt(order_id, 10)
    if (isNaN(orderId)) return notFound()

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: true, documents: true },
    })

    if (!order) return notFound()

    const globalSettings = await getGlobalSettings()

    // Solução Definitiva: Serializa o objeto inteiro para converter todas as datas 
    // e evitar o erro "Only plain objects can be passed to Client Components" no Next.js
    const sanitizedOrder = JSON.parse(JSON.stringify(order))

    return <ProposalClient order={sanitizedOrder} globalSettings={globalSettings} />
}