'use server'

import prisma from '@/lib/prisma'
import { getGlobalSettings } from './settings'
import { revalidatePath } from 'next/cache'

// ── Types ──────────────────────────────────────────────────────────────────────

export type ScopeReductionReason =
    | 'already_in_english'
    | 'sent_by_mistake'
    | 'duplicate_document'
    | 'client_requested_removal'
    | 'other'

export interface ScopeReductionResult {
    success: boolean
    error?: string
    documentValue?: number
    newOrderTotal?: number
    creditAmount?: number
}

interface ScopeAdjustmentEntry {
    id: string
    documentId: number
    documentLabel: string
    reason: ScopeReductionReason
    notes: string | null
    documentValue: number
    billablePages: number | null
    performedBy: string
    performedAt: string
    previousOrderTotal: number
    newEffectiveTotal: number
}

// ── Reason labels (for audit/display) ──────────────────────────────────────────

export const SCOPE_REDUCTION_REASON_LABELS: Record<ScopeReductionReason, string> = {
    already_in_english: 'Documento já em inglês',
    sent_by_mistake: 'Enviado por engano pelo cliente',
    duplicate_document: 'Documento duplicado',
    client_requested_removal: 'Remoção solicitada pelo cliente',
    other: 'Outro motivo',
}

// ── Calculate document value ───────────────────────────────────────────────────

async function calculateDocumentValue(
    orderId: number,
    documentId: number,
    billablePages: number | null,
): Promise<number> {
    // Strategy 1: Try to read exact value from metadata analysis
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { metadata: true, urgency: true },
    })

    if (order?.metadata) {
        try {
            const meta = typeof order.metadata === 'string'
                ? JSON.parse(order.metadata)
                : order.metadata

            const metaDocs: any[] = meta?.documents ?? []

            // Find matching document in metadata by index or other heuristic
            // The metadata docs array matches the order documents were created
            const doc = await prisma.document.findUnique({
                where: { id: documentId },
                select: { exactNameOnDoc: true },
            })

            if (doc) {
                const matchingMeta = metaDocs.find(
                    (md: any) => md.fileName === doc.exactNameOnDoc
                )

                if (matchingMeta?.analysis?.pages) {
                    const includedPages = matchingMeta.analysis.pages.filter(
                        (p: any) => p.included !== false
                    )
                    const docValue = includedPages.reduce(
                        (sum: number, p: any) => sum + (p.price || 0), 0
                    )
                    if (docValue > 0) return Math.round(docValue * 100) / 100
                }
            }
        } catch {
            // Fall through to formula calculation
        }
    }

    // Strategy 2: Calculate from billablePages × basePrice × urgencyMultiplier
    const settings = await getGlobalSettings()
    const basePrice = settings.basePrice || 9.00
    const urgency = order?.urgency || 'standard'

    const URGENCY_MULTIPLIER: Record<string, number> = {
        standard: 1.0,
        urgent: 1.0 + settings.urgencyRate,
        flash: 1.0 + (settings.urgencyRate * 2),
        normal: 1.0,
    }

    const pages = billablePages ?? 1
    const multiplier = URGENCY_MULTIPLIER[urgency] ?? 1.0

    return Math.round(pages * basePrice * multiplier * 100) / 100
}

// ── Main action ────────────────────────────────────────────────────────────────

export async function applyScopeReduction(
    orderId: number,
    documentId: number,
    reason: ScopeReductionReason,
    notes: string | null,
    performedBy: string,
): Promise<ScopeReductionResult> {
    try {
        // 1. Load document and validate
        const document = await prisma.document.findUnique({
            where: { id: documentId },
            select: {
                id: true,
                orderId: true,
                excludedFromScope: true,
                billablePages: true,
                exactNameOnDoc: true,
                docType: true,
            },
        })

        if (!document) {
            return { success: false, error: 'Documento não encontrado.' }
        }
        if (document.orderId !== orderId) {
            return { success: false, error: 'Documento não pertence a este pedido.' }
        }
        if (document.excludedFromScope) {
            return { success: false, error: 'Documento já está fora do escopo.' }
        }

        // 2. Load order
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                totalAmount: true,
                extraDiscount: true,
                finalPaidAmount: true,
                metadata: true,
                status: true,
            },
        })

        if (!order) {
            return { success: false, error: 'Pedido não encontrado.' }
        }

        // 3. Calculate document value
        const documentValue = await calculateDocumentValue(
            orderId, documentId, document.billablePages
        )

        // 4. Calculate new financials
        const currentExtraDiscount = order.extraDiscount ?? 0
        const newExtraDiscount = Math.round((currentExtraDiscount + documentValue) * 100) / 100
        const newEffectiveTotal = Math.max(0, Math.round((order.totalAmount - newExtraDiscount) * 100) / 100)

        // 5. Build audit entry
        const adjustmentEntry: ScopeAdjustmentEntry = {
            id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            documentId,
            documentLabel: document.exactNameOnDoc ?? document.docType ?? `#${documentId}`,
            reason,
            notes: notes?.trim() || null,
            documentValue,
            billablePages: document.billablePages,
            performedBy,
            performedAt: new Date().toISOString(),
            previousOrderTotal: order.totalAmount,
            newEffectiveTotal,
        }

        // 6. Update metadata with audit trail
        let meta: Record<string, any> = {}
        try {
            meta = typeof order.metadata === 'string'
                ? JSON.parse(order.metadata)
                : (order.metadata ?? {})
        } catch { /* keep empty */ }

        if (!Array.isArray(meta.scopeAdjustments)) {
            meta.scopeAdjustments = []
        }
        meta.scopeAdjustments.push(adjustmentEntry)

        // 7. Apply changes in transaction
        await prisma.$transaction([
            // Mark document as excluded
            prisma.document.update({
                where: { id: documentId },
                data: { excludedFromScope: true },
            }),
            // Update order financials + audit trail
            prisma.order.update({
                where: { id: orderId },
                data: {
                    extraDiscount: newExtraDiscount,
                    finalPaidAmount: newEffectiveTotal,
                    metadata: JSON.stringify(meta),
                },
            }),
        ])

        console.log(
            `[ScopeReduction] Order #${orderId} Doc #${documentId} excluded. ` +
            `Value: $${documentValue} | Reason: ${reason} | By: ${performedBy} | ` +
            `New effective total: $${newEffectiveTotal}`
        )

        revalidatePath(`/admin/orders/${orderId}`)
        revalidatePath('/admin/orders')
        revalidatePath('/admin/finance')

        return {
            success: true,
            documentValue,
            newOrderTotal: newEffectiveTotal,
            creditAmount: documentValue,
        }

    } catch (error: any) {
        console.error('[ScopeReduction] Error:', error)
        return { success: false, error: error?.message ?? 'Erro interno ao aplicar redução de escopo.' }
    }
}

// ── Read scope adjustments (for display) ───────────────────────────────────────

export async function readScopeAdjustments(
    metadata: Record<string, unknown> | null | undefined,
): Promise<ScopeAdjustmentEntry[]> {
    if (!metadata || typeof metadata !== 'object') return []
    const adjustments = (metadata as any).scopeAdjustments
    if (!Array.isArray(adjustments)) return []
    return adjustments
}
