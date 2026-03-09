'use server'

import { OrderStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import prisma from '../../lib/prisma'
import { normalizeOrder } from '../../lib/orderAdapter'

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
                metadata: true,
                user: {
                    select: {
                        fullName: true,
                        email: true
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

        // Shield against malformed data right at the source
        const safeOrders = orders.map(o => {
            try {
                return normalizeOrder(o);
            } catch (e) {
                console.error(`Failed to normalize kanban order #${o?.id}:`, e);
                return null;
            }
        }).filter(Boolean);

        return { success: true, data: safeOrders }
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

        if (!order) return { success: false, error: "Order not found" }

        // Shield against malformed data
        try {
            const safeOrder = normalizeOrder(order);
            return { success: true, data: safeOrder }
        } catch (e) {
            console.error(`Failed to normalize order details #${orderId}:`, e);
            // Fallback: still return order but it might be risky
            return { success: true, data: order }
        }
    } catch (error) {
        console.error("Failed to fetch order details:", error)
        return { success: false, error: "Failed to fetch order details" }
    }
}

export async function updateOrderStatus(orderId: number, newStatus: OrderStatus) {
    try {
        const order = await prisma.order.update({
            where: { id: orderId },
            data: { status: newStatus },
            include: {
                user: {
                    select: {
                        fullName: true,
                        email: true
                    }
                }
            }
        })

        // ── 1. Automate "Translation Started" Email ───────────────────────────
        if (newStatus === 'TRANSLATING') {
            try {
                let pageCount = 1;
                if (order.metadata) {
                    try {
                        const meta = JSON.parse(order.metadata);
                        pageCount = meta.breakdown?.totalCount || 1;
                    } catch (e) {
                        console.error("Failed to parse metadata for email", e);
                    }
                }

                await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/notifications`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        trigger: 'translation_started',
                        orderId: order.id,
                        customerName: order.user.fullName,
                        customerEmail: order.user.email,
                        pageCount: pageCount,
                        urgency: order.urgency
                    })
                });
            } catch (emailErr) {
                console.error("Failed to trigger automatic email:", emailErr);
            }
        }

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

export async function deleteOrder(orderId: number) {
    try {
        // Find order first to ensure it exists
        const order = await prisma.order.findUnique({
            where: { id: orderId }
        });

        if (!order) return { success: false, error: "Order not found" };

        // Delete associated documents first to satisfy constraints
        await prisma.document.deleteMany({
            where: { orderId: orderId }
        });

        // Delete the order
        await prisma.order.delete({
            where: { id: orderId }
        });

        revalidatePath('/admin');
        revalidatePath('/admin/finance');
        revalidatePath('/admin/dashboard');

        return { success: true };
    } catch (error) {
        console.error("Failed to delete order:", error);
        return { success: false, error: "Failed to delete order" };
    }
}

export async function updateOrderCustomerInfo(orderId: number, fullName: string, phone: string) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { userId: true }
        });

        if (!order) return { success: false, error: "Order not found" };

        // Update User info
        await prisma.user.update({
            where: { id: order.userId },
            data: {
                fullName,
                phone
            }
        });

        // Note: Field 'phone' does not exist on prisma.order model in the current schema.
        // We only update the User model where the primary phone data resides.

        revalidatePath('/admin');
        return { success: true };
    } catch (error) {
        console.error("Failed to update customer info:", error);
        return { success: false, error: "Failed to update customer info" };
    }
}
