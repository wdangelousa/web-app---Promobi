import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import ProposalClient from './ProposalClient'

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

    // Pass the server-fetched data to the client component for interactivity
    return <ProposalClient order={order as any} />
}
