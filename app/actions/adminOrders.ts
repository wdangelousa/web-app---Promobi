'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { NotificationService } from '@/lib/notification'

export async function updateOrderStatus(orderId: number, status: string, deliveryUrl?: string) {
    try {
        const data: any = { status }
        if (deliveryUrl) {
            data.deliveryUrl = deliveryUrl
            // Also mark as COMPLETED if delivering? Or let user select status.
            // data.status = 'COMPLETED' // Optional automation
        }

        await prisma.order.update({
            where: { id: orderId },
            data
        })

        // Revalidate admin pages
        revalidatePath('/admin/orders')
        revalidatePath(`/admin/orders/${orderId}`)

        // Send Completion Email if Status is COMPLETED and we have delivery URL
        if (status === 'COMPLETED' && deliveryUrl) {
            // Need to fetch user details if not present in partial update
            const order = await prisma.order.findUnique({
                where: { id: orderId },
                include: { user: true }
            })
            if (order) {
                await NotificationService.notifyOrderCompleted(order, deliveryUrl)
            }
        }

        return { success: true }
    } catch (error) {
        console.error('Failed to update order:', error)
        return { success: false, error: 'Failed to update order' }
    }
}
