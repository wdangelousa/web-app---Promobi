import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import ProposalClient from './ProposalClient'
import { getGlobalSettings } from '@/app/actions/settings'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const orderId = parseInt(id, 10)
    if (isNaN(orderId)) return { title: 'Proposta Inválida' }

    return {
        title: `Proposta #${orderId} - Promobi`,
        description: 'Sua proposta de serviços de tradução certificada',
    }
}

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const orderId = parseInt(id, 10)
    if (isNaN(orderId)) return notFound()

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: true, documents: true },
    })

    if (!order) return notFound()

    const globalSettings = await getGlobalSettings()

    return <ProposalClient order={order as any} globalSettings={globalSettings} />
}