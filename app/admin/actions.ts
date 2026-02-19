'use server'

import { OrderStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import prisma from '../../lib/prisma'

// Optimized for Kanban Board (Lightweight)
export async function getKanbanOrders() {
    try {
        const orders = await prisma.order.findMany({
            select: {
                id: true,
                status: true,
                totalAmount: true,
                urgency: true,
                requiresNotarization: true,
                requiresHardCopy: true,
                createdAt: true,
                user: {
                    select: {
                        fullName: true
                    }
                },
                documents: {
                    select: {
                        id: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
        return { success: true, data: orders }
    } catch (error) {
        console.error("Failed to fetch orders:", error)
        return { success: false, error: "Failed to fetch orders" }
    }
}

// Full details for Modal (On Demand)
export async function getOrderDetails(orderId: number) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: {
                    select: {
                        fullName: true,
                        email: true,
                        phone: true
                    }
                },
                documents: {
                    select: {
                        id: true,
                        docType: true,
                        originalFileUrl: true,
                        translatedFileUrl: true,
                        exactNameOnDoc: true
                    }
                }
            }
        })

        // We need to type cast or ensure the query returns these if they are top-level fields
        // Since prisma.order.findUnique returns the whole object by default when 'include' is used ONLY for relations?
        // Actually, if we use 'include', it returns all scalar fields of the top level model PLUS the included relations.
        // So we don't need to explicitly select metadata, uspsTracking, deliveryUrl unless we used 'select'.
        // Since we used 'include', they should be there.

        if (!order) return { success: false, error: "Order not found" }
        return { success: true, data: order }
    } catch (error) {
        console.error("Failed to fetch order details:", error)
        return { success: false, error: "Failed to fetch order details" }
    }
}

export async function updateOrderStatus(orderId: number, newStatus: OrderStatus) {
    try {
        await prisma.order.update({
            where: { id: orderId },
            data: { status: newStatus }
        })
        revalidatePath('/admin')
        return { success: true }
    } catch (error) {
        console.error("Failed to update status:", error)
        return { success: false, error: "Failed to update status" }
    }
}

export async function updateTrackingCode(orderId: number, trackingCode: string) {
    try {
        await prisma.order.update({
            where: { id: orderId },
            data: { uspsTracking: trackingCode }
        })
        revalidatePath('/admin')
        return { success: true }
    } catch (error) {
        console.error("Failed to update tracking:", error)
        return { success: false, error: "Failed to update tracking" }
    }
}
