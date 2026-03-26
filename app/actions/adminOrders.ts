'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/app/actions/auth'
import { parseOrderMetadata } from '@/lib/translationArtifactSource'

const CANCELLATION_REASON_LABELS: Record<string, string> = {
    CLIENT_DROPOUT: 'Desistência do cliente',
    PAYMENT_NOT_CONFIRMED: 'Pagamento não confirmado',
    DUPLICATE_ORDER: 'Pedido duplicado',
    REGISTRATION_ERROR: 'Erro de cadastro',
    UNFEASIBLE_DOCUMENTATION: 'Documentação inviável',
    INTERNAL_REQUEST: 'Solicitação interna',
    OTHER: 'Outro',
}

interface CancelOrderInput {
    reasonCode: string
    reasonDetail?: string | null
}

function buildCancellationReasonText(input: CancelOrderInput): { reasonText: string; reasonLabel: string } {
    const reasonLabel = CANCELLATION_REASON_LABELS[input.reasonCode] ?? input.reasonCode
    const detail = typeof input.reasonDetail === 'string' ? input.reasonDetail.trim() : ''
    const reasonText = detail ? `${reasonLabel}: ${detail}` : reasonLabel
    return { reasonText, reasonLabel }
}

export async function updateOrderStatus(orderId: number, status: string, deliveryUrl?: string) {
    try {
        if (deliveryUrl) {
            return {
                success: false,
                error:
                    'Manual delivery URL updates are disabled. Use structured delivery generation only.',
            }
        }

        if (status === 'COMPLETED') {
            return {
                success: false,
                error:
                    'Manual completion is disabled. Use structured release flow (generateDeliveryKit + releaseToClient).',
            }
        }

        const data: any = { status }

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

export async function markOrderCompleted(orderId: number): Promise<{ success: boolean; error?: string }> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return { success: false, error: 'Usuário não autenticado.' }
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { status: true, sentAt: true, metadata: true },
        })

        if (!order) {
            return { success: false, error: 'Pedido não encontrado.' }
        }

        if (!order.sentAt) {
            return {
                success: false,
                error: 'O pedido precisa ter sido enviado ao cliente antes de ser marcado como concluído.'
            }
        }

        if (order.status === 'COMPLETED') {
            return { success: false, error: 'Pedido já está concluído.' }
        }
        if (order.status === 'CANCELLED') {
            return { success: false, error: 'Pedido cancelado não pode ser concluído.' }
        }

        const metadata = parseOrderMetadata(order.metadata as string | null | undefined)
        const completedAt = new Date().toISOString()
        const completedBy = currentUser.email ?? String(currentUser.id)

        const nextMetadata = {
            ...metadata,
            manualCompletion: {
                completedAt,
                completedBy,
                reason: 'manual_operator_action',
                note: 'Marcado como concluído manualmente pelo operador (webhook de entrega não confirmou automaticamente).',
            },
        }

        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'COMPLETED',
                metadata: JSON.stringify(nextMetadata),
            },
        })

        revalidatePath('/admin/orders')
        revalidatePath('/admin/orders/concluidos')
        revalidatePath(`/admin/orders/${orderId}`)

        console.log(`[markOrderCompleted] ✅ Order #${orderId} → COMPLETED (manual) by ${completedBy}`)

        return { success: true }
    } catch (error) {
        console.error('[markOrderCompleted] Error:', error)
        return { success: false, error: 'Falha ao concluir pedido.' }
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

        const finalPaidAmount = Math.max(0, (order.totalAmount || 0) - (extraDiscount || 0))

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

export async function cancelOrder(orderId: number, payload: CancelOrderInput) {
    const reasonCode = payload?.reasonCode?.trim()
    const reasonDetail = typeof payload?.reasonDetail === 'string' ? payload.reasonDetail.trim() : ''

    if (!reasonCode) {
        return { success: false, error: 'Selecione um motivo para cancelar o pedido.' }
    }
    if (reasonCode === 'OTHER' && !reasonDetail) {
        return { success: false, error: 'Descreva o motivo do cancelamento.' }
    }

    try {
        const currentUser = await getCurrentUser()
        const existingOrder = await prisma.order.findUnique({
            where: { id: orderId },
            select: { metadata: true },
        })
        const metadata = parseOrderMetadata(existingOrder?.metadata as string | null | undefined)
        const cancelledAt = new Date().toISOString()
        const cancelledBy =
            currentUser?.email ??
            (typeof currentUser?.id === 'number' ? String(currentUser.id) : null)
        const cancelledByUserId =
            typeof currentUser?.id === 'number' ? String(currentUser.id) : null
        const { reasonText, reasonLabel } = buildCancellationReasonText({
            reasonCode,
            reasonDetail,
        })
        const nextMetadata = {
            ...metadata,
            cancellation: {
                reasonCode,
                reasonLabel,
                reasonDetail: reasonDetail || null,
                cancellation_details: reasonDetail || null,
                reason: reasonText,
                cancellation_reason: reasonLabel,
                cancelledAt,
                cancelledBy,
                cancelledByUserId,
            },
        }

        try {
            await prisma.order.update({
                where: { id: orderId },
                data: {
                    status: 'CANCELLED' as any,
                    cancellation_reason: reasonLabel,
                    metadata: JSON.stringify(nextMetadata),
                },
            })
        } catch (updateErr) {
            console.warn('[cancelOrder] Prisma update with cancellation_reason failed; retrying with fallback.', updateErr)
            await prisma.order.update({
                where: { id: orderId },
                data: {
                    status: 'CANCELLED' as any,
                    metadata: JSON.stringify(nextMetadata),
                },
            })
            try {
                await prisma.$executeRaw`UPDATE "Order" SET cancellation_reason = ${reasonLabel} WHERE id = ${orderId}`
            } catch {
                console.warn('[cancelOrder] cancellation_reason column not found — reason preserved in metadata')
            }
        }

        revalidatePath('/admin/orders')
        revalidatePath('/admin/orders/cancelados')
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
                address: data.address,
            } as any
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
        const existingOrder = await prisma.order.findUnique({
            where: { id: orderId },
            select: { metadata: true },
        })

        const metadata = parseOrderMetadata(existingOrder?.metadata as string | null | undefined)
        const nextMetadata = { ...metadata }
        delete (nextMetadata as any).delivery
        delete (nextMetadata as any).manualCompletion
        delete (nextMetadata as any).cancellation

        await prisma.$transaction([
            prisma.order.update({
                where: { id: orderId },
                data: {
                    status: 'PENDING' as any,
                    deliveryUrl: null,
                    sentAt: null,
                    paidAt: null,
                    dueDate: null,
                    cancellation_reason: null,
                    metadata: JSON.stringify(nextMetadata),
                }
            }),
            prisma.document.updateMany({
                where: { orderId },
                data: { scopedFileUrl: null },
            }),
        ])

        revalidatePath('/admin/orders')
        revalidatePath(`/admin/orders/${orderId}`)
        revalidatePath('/admin/finance')

        return { success: true }
    } catch (error) {
        console.error('Failed to reopen order:', error)
        return { success: false, error: 'Falha ao reabrir orçamento.' }
    }
}

export async function getOrderForConcierge(orderId: number) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { user: true, documents: true }
        })

        if (!order) {
            return { success: false, error: 'Pedido não encontrado.' }
        }

        return { success: true, order }
    } catch (error) {
        console.error('Failed to fetch order for concierge:', error)
        return { success: false, error: 'Falha ao buscar dados do pedido.' }
    }
}
