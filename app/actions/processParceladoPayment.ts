'use server'

import prisma from '../../lib/prisma'

export async function processParceladoPayment(orderId: number) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId }
        })

        if (!order) {
            return { success: false, error: "Pedido não encontrado" }
        }

        // Fire & Forget Email Notification
        try {
            const { sendOrderEmails } = await import('../../lib/email')
            sendOrderEmails(order)
        } catch (e) {
            console.error("Email trigger failed", e)
        }

        // Update database with Parcelado USA details
        await prisma.order.update({
            where: { id: orderId },
            data: {
                paymentProvider: 'PARCELADO_USA'
            }
        })

        // Redirect to the new simulation/checkout page
        return { success: true, url: `/checkout-parcelado?orderId=${orderId}` }

    } catch (error) {
        console.error("Process Parcelado Payment Error:", error)
        return { success: false, error: "Falha ao processar pagamento via Parcelado USA" }
    }
}
