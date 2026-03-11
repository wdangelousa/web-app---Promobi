'use server'

import prisma from '@/lib/prisma'
import { sendDeliveryEmail } from '@/lib/mail'
import { revalidatePath } from 'next/cache'

// Tipagem estrita
export type DeliveryResponse =
    | { success: true }
    | { success: false; error: string }

export async function sendDelivery(orderId: number): Promise<DeliveryResponse> {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { user: true, documents: true }
        })

        if (!order || !order.user || !order.user.email) {
            return { success: false, error: "Pedido, usuário ou e-mail não encontrado." }
        }

        const downloadLink = `${process.env.NEXT_PUBLIC_APP_URL}/delivery/${order.id}`

        // Chama a função real de e-mail
        const emailResult = await sendDeliveryEmail({
            orderId: order.id,
            customerName: order.user.fullName || 'Cliente',
            customerEmail: order.user.email,
            deliveryUrl: downloadLink,
            pageCount: order.documents.length,
            serviceType: 'translation',
        })

        if (!emailResult.success) {
            console.error("Erro do Resend:", emailResult.error)
            return { success: false, error: "Falha ao enviar e-mail pelo Resend." }
        }

        // Atualiza banco de dados
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'COMPLETED' }
        })

        revalidatePath('/admin')
        revalidatePath(`/admin/orders/${orderId}`)

        return { success: true }

    } catch (error: any) {
        console.error("Send Delivery Error:", error)
        return { success: false, error: error.message || "Falha interna ao tentar enviar." }
    }
}