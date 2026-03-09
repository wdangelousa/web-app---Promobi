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

export async function applyFinancialAdjustment(orderId: number, extraDiscount: number) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId }
        })

        if (!order) {
            return { success: false, error: 'Order not found' }
        }

        const finalPaidAmount = Math.max(0, order.totalAmount - extraDiscount)

        await prisma.order.update({
            where: { id: orderId },
            data: {
                extraDiscount: extraDiscount,
                finalPaidAmount: finalPaidAmount
            }
        })

        revalidatePath(`/admin/orders/${orderId}`)
        revalidatePath('/admin/orders')
        revalidatePath('/admin/finance')

        return { success: true, finalPaidAmount }
    } catch (error) {
        console.error('Failed to apply financial adjustment:', error)
        return { success: false, error: 'Failed to apply financial adjustment' }
    }
}

export async function deleteOrder(orderId: number) {
    try {
        // Prisma will handle cascade if configured, but let's be explicit and safe
        // First delete associated Documents
        await prisma.document.deleteMany({
            where: { orderId: orderId }
        })

        // Then delete the Order
        await prisma.order.delete({
            where: { id: orderId }
        })

        revalidatePath('/admin/orders')
        revalidatePath('/admin/finance')
        return { success: true }
    } catch (error) {
        console.error('Failed to delete order:', error)
        return { success: false, error: 'Failed to delete order' }
    }
}

export async function cancelOrder(orderId: number, reason: string) {
    if (!reason?.trim()) {
        return { success: false, error: 'Justificativa obrigatória.' }
    }
    try {
        // Update status via Prisma (always works)
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'CANCELLED' as any },
        })

        // Save cancellation reason via raw SQL.
        // This will succeed once you add the column in Supabase:
        //   ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
        try {
            await prisma.$executeRaw`UPDATE "Order" SET cancellation_reason = ${reason.trim()} WHERE id = ${orderId}`
        } catch {
            // Column not yet added to DB — status is still saved correctly above
            console.warn('[cancelOrder] cancellation_reason column not found — add it via Supabase SQL editor')
        }

        revalidatePath('/admin/orders')
        revalidatePath(`/admin/orders/${orderId}`)
        return { success: true }
    } catch (error) {
        console.error('Failed to cancel order:', error)
        return { success: false, error: 'Falha ao cancelar pedido.' }
    }
}

export async function updateCustomerDetails(userId: number, data: { fullName?: string, phone?: string, address?: string }) {
    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                fullName: data.fullName,
                phone: data.phone,
                address: data.address
            }
        })

        revalidatePath('/admin/orders')
        // Also revalidate specific orders if needed, but '/admin/orders' usually covers the list
        return { success: true }
    } catch (error) {
        console.error('Failed to update customer details:', error)
        return { success: false, error: 'Failed to update customer details' }
    }
}
export async function reopenOrder(orderId: number) {
    try {
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'PENDING' as any,
                deliveryUrl: null, // Clear delivery URL as we are reopening
                finalPaidAmount: null, // Reset final paid amount to reassess
                extraDiscount: 0, // Reset extra discount
            }
        })

        revalidatePath('/admin/orders')
        revalidatePath(`/admin/orders/${orderId}`)
        revalidatePath('/admin/finance')

        return { success: true }
    } catch (error) {
        console.error('Failed to reopen order:', error)
        return { success: false, error: 'Falha ao reabrir orçamento.' }
    }
}
