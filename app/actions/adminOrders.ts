'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

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

        return { success: true }
    } catch (error) {
        console.error('Failed to update order:', error)
        return { success: false, error: 'Failed to update order' }
    }
}
