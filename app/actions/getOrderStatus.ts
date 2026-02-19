'use server'

import prisma from '../../lib/prisma'

export async function getOrderStatus(orderId: number) {
    try {
        if (!orderId || isNaN(orderId)) {
            return { success: false, error: "ID do pedido inválido" }
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                status: true,
                urgency: true,
                createdAt: true,
                uspsTracking: true,
                // paymentStatus: true, // Removed as it doesn't exist
                documents: {
                    take: 1,
                    select: {
                        docType: true
                    }
                }
            }
        })

        if (!order) {
            return { success: false, error: "Pedido não encontrado" }
        }

        return { success: true, order }

    } catch (error) {
        console.error("Get Order Status Error:", error)
        return { success: false, error: "Erro ao buscar status do pedido" }
    }
}
