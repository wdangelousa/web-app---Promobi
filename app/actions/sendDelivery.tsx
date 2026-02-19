'use server'

import prisma from '../../lib/prisma'
import { Resend } from 'resend'
import { DeliveryEmail } from '../../components/emails/DeliveryEmail'
import { revalidatePath } from 'next/cache'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendDelivery(orderId: number) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { user: true }
        })

        if (!order || !order.deliveryUrl) {
            return { success: false, error: "Pedido não encontrado ou sem arquivo de entrega." }
        }

        const downloadLink = `${process.env.NEXT_PUBLIC_APP_URL}${order.deliveryUrl}`

        // Send Email
        await resend.emails.send({
            from: 'Promobi Notifications <onboarding@resend.dev>', // Update domain in prod
            to: order.user.email,
            subject: 'Seus documentos traduzidos e notarizados chegaram! - Promobi',
            react: <DeliveryEmail 
                customerName={ order.user.fullName }
                orderId = { order.id }
                downloadLink = { downloadLink }
            />
        })

    // Update Status to COMPLETED
    await prisma.order.update({
        where: { id: orderId },
        data: { status: 'COMPLETED' }
    })

    revalidatePath('/admin')
    return { success: true }

} catch (error) {
    console.error("Send Delivery Error:", error)
    return { success: false, error: "Falha ao enviar e-mail de entrega" }
}
}
