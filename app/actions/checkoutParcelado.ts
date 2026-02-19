'use server'

import prisma from '../../lib/prisma'

export async function checkoutParcelado(orderId: number) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId }
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

        // Redirect to simulation page
        return { success: true, url: `/checkout-parcelado?orderId=${orderId}` }

    } catch (error) {
        console.error("Parcelado Checkout Error:", error)
        return { success: false, error: "Falha ao iniciar simulação de pagamento" }
    }
}
