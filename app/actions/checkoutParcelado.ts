'use server'

import prisma from '../../lib/prisma'
import { createParceladoPaymentLink } from '../../lib/parcelado'

export async function checkoutParcelado(orderId: number) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { user: true }
        })

        if (!order) {
            return { success: false, error: "Pedido não encontrado" }
        }

        // Update database with specific Parcelado USA details
        await prisma.order.update({
            where: { id: orderId },
            data: {
                paymentProvider: 'PARCELADO_USA'
                // Status remains as is (PENDING)
            }
        })

        // Generate Payment Link (or get simulation URL)
        const result = await createParceladoPaymentLink(order, order.user?.email, order.user?.fullName);

        if (result.url) {
            return { success: true, url: result.url }
        } else {
            return { success: false, error: "Falha ao gerar link de pagamento" }
        }

    } catch (error) {
        console.error("Parcelado Checkout Error:", error)
        return { success: false, error: "Falha ao iniciar pagamento" }
    }
}
