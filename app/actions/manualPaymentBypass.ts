'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/app/actions/auth'
import { getGlobalSettings } from '@/app/actions/settings'
import { calculateDueDate } from '@/lib/deadlineCalculator'
import { materializeScopedDocuments } from '@/lib/scopeMaterialization'
import { parseOrderMetadata } from '@/lib/translationArtifactSource'
import { triggerAnthropicTranslationForOrder } from '@/lib/orderTranslationDispatch'
import {
    applyManualPayment,
    isPreProductionOperationalStatus,
    readFinancialLedger,
    resolveProductionReleasePolicy,
    roundMoney,
    shouldReleaseOperationalWorkflow,
    upsertFinancialLedger,
    type FinancialStatus,
    type ProductionReleasePolicy,
} from '@/lib/manualPayment'

// Canonical translation dispatch remains the Anthropic mirror-HTML route:
// /api/translate/claude (invoked through the shared orderTranslationDispatch helper).

interface RegisterManualPaymentPayload {
    amountReceived: number
    paymentDate: string
    paymentMethod?: string | null
    notes?: string | null
    skipAutoTranslate?: boolean
}

interface RegisterManualPaymentResult {
    success: boolean
    message: string
    financialStatus?: FinancialStatus
    amountReceived?: number
    remainingBalance?: number
    operationalStatus?: string
    productionReleased?: boolean
    releasePolicy?: ProductionReleasePolicy
}

const MANUAL_METHOD_DEFAULT = 'MANUAL'

const PRE_TRANSLATION_STATUSES = new Set(['PENDING', 'PENDING_PAYMENT', 'AWAITING_VERIFICATION', 'PAID'])

function normalizeMoneyInput(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return roundMoney(value)
    if (typeof value === 'string') {
        const parsed = Number(value.replace(',', '.').trim())
        if (Number.isFinite(parsed)) return roundMoney(parsed)
    }
    return null
}

function sanitizeOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export async function registerManualPayment(
    orderId: number,
    payload: RegisterManualPaymentPayload,
): Promise<RegisterManualPaymentResult> {
    const amountReceived = normalizeMoneyInput(payload?.amountReceived)
    if (amountReceived === null || amountReceived <= 0) {
        return { success: false, message: 'Informe um valor recebido válido.' }
    }

    const paymentDateRaw = sanitizeOptionalText(payload?.paymentDate)
    if (!paymentDateRaw) {
        return { success: false, message: 'Informe a data do pagamento.' }
    }
    const parsedDate = new Date(paymentDateRaw)
    if (Number.isNaN(parsedDate.getTime())) {
        return { success: false, message: 'Data de pagamento inválida.' }
    }

    try {
        const currentUser = await getCurrentUser()
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                status: true,
                totalAmount: true,
                hasTranslation: true,
                urgency: true,
                paymentMethod: true,
                metadata: true,
                finalPaidAmount: true,
                documents: {
                    select: {
                        id: true,
                        orderId: true,
                        originalFileUrl: true,
                        billablePages: true,
                        totalPages: true,
                        excludedFromScope: true,
                    },
                    orderBy: { id: 'asc' },
                },
            },
        })

        if (!order) {
            return { success: false, message: `Pedido #${orderId} não encontrado.` }
        }
        if (order.status === 'CANCELLED') {
            return { success: false, message: 'Não é possível registrar pagamento em pedido cancelado.' }
        }

        const metadata = parseOrderMetadata(order.metadata)
        const ledger = readFinancialLedger(
            metadata,
            order.totalAmount ?? 0,
            typeof order.finalPaidAmount === 'number' ? order.finalPaidAmount : null,
        )
        const releasePolicy = resolveProductionReleasePolicy(metadata)
        const paymentMethod = sanitizeOptionalText(payload?.paymentMethod) ?? MANUAL_METHOD_DEFAULT

        const shouldReleaseProduction = order.hasTranslation && shouldReleaseOperationalWorkflow({
            policy: releasePolicy,
            orderTotal: ledger.orderTotal,
            amountReceived: ledger.amountReceived + amountReceived,
        })
        const canStartWorkflow =
            shouldReleaseProduction && PRE_TRANSLATION_STATUSES.has(order.status)

        const nextOperationalStatus = canStartWorkflow ? 'TRANSLATING' : order.status
        const { nextSnapshot } = applyManualPayment(ledger, {
            amount: amountReceived,
            paymentDate: parsedDate.toISOString(),
            paymentMethod,
            notes: sanitizeOptionalText(payload?.notes),
            registeredBy:
                sanitizeOptionalText(currentUser?.fullName) ??
                sanitizeOptionalText(currentUser?.email) ??
                'Admin',
            registeredByUserId:
                typeof currentUser?.id === 'number' ? String(currentUser.id) : null,
            resultingOperationalStatus: nextOperationalStatus,
        })

        const nextMetadata = upsertFinancialLedger(metadata, nextSnapshot)
        nextMetadata.financialStatus = nextSnapshot.status
        nextMetadata.financialSummary = {
            orderTotal: nextSnapshot.orderTotal,
            amountReceived: nextSnapshot.amountReceived,
            remainingBalance: nextSnapshot.remainingBalance,
            status: nextSnapshot.status,
            updatedAt: nextSnapshot.updatedAt,
        }
        nextMetadata.paymentPolicy = {
            ...(nextMetadata.paymentPolicy && typeof nextMetadata.paymentPolicy === 'object'
                ? (nextMetadata.paymentPolicy as Record<string, unknown>)
                : {}),
            productionReleasePolicy: releasePolicy,
        }

        let paidAtValue: Date | undefined
        let dueDateValue: Date | undefined
        if (canStartWorkflow) {
            paidAtValue = new Date()

            try {
                const docsForScoping = order.documents.map((d) => ({
                    id: d.id,
                    orderId: d.orderId ?? orderId,
                    originalFileUrl: d.originalFileUrl,
                    billablePages: d.billablePages,
                    totalPages: d.totalPages,
                    excludedFromScope: d.excludedFromScope ?? false,
                }))
                const scopeResults = await materializeScopedDocuments(orderId, docsForScoping, metadata)
                for (const result of scopeResults) {
                    if (result.action === 'scoped' && result.scopedFileUrl) {
                        await prisma.document.update({
                            where: { id: result.documentId },
                            data: { scopedFileUrl: result.scopedFileUrl },
                        })
                    }
                }
            } catch (error) {
                console.error('[registerManualPayment] scope materialization failed', error)
            }

            const settings = await getGlobalSettings()
            const deadline = calculateDueDate(paidAtValue, order.urgency, {
                deadlineNormal: settings.deadlineNormal,
                deadlineUrgent: settings.deadlineUrgent,
            })
            dueDateValue = deadline.dueDate
        }

        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: nextOperationalStatus as any,
                paymentMethod,
                finalPaidAmount: nextSnapshot.amountReceived,
                metadata: JSON.stringify(nextMetadata),
                ...(paidAtValue ? { paidAt: paidAtValue } : {}),
                ...(dueDateValue ? { dueDate: dueDateValue } : {}),
            },
        })

        let anthropicResult:
            | {
                success: boolean
                translatedDocs: number
                attemptedDocs: number
                errorCount: number
            }
            | null = null

        if (canStartWorkflow && isPreProductionOperationalStatus(order.status) && payload?.skipAutoTranslate !== true) {
            anthropicResult = await triggerAnthropicTranslationForOrder(orderId)
        }

        revalidatePath('/admin/orders')
        revalidatePath(`/admin/orders/${orderId}`)
        revalidatePath('/admin/finance')
        revalidatePath('/admin/dashboard')

        const translatedSummary =
            anthropicResult && anthropicResult.attemptedDocs > 0
                ? ` Anthropic: ${anthropicResult.translatedDocs}/${anthropicResult.attemptedDocs} documento(s) processado(s).`
                : ''

        return {
            success: true,
            message:
                canStartWorkflow
                    ? `Pagamento manual registrado e fluxo operacional liberado.${translatedSummary}`
                    : 'Pagamento manual registrado com sucesso.',
            financialStatus: nextSnapshot.status,
            amountReceived: nextSnapshot.amountReceived,
            remainingBalance: nextSnapshot.remainingBalance,
            operationalStatus: anthropicResult?.success ? 'READY_FOR_REVIEW' : nextOperationalStatus,
            productionReleased: canStartWorkflow,
            releasePolicy,
        }
    } catch (error: any) {
        console.error('[registerManualPayment] failed', error)
        return {
            success: false,
            message: error?.message || 'Falha ao registrar pagamento manual.',
        }
    }
}

export async function approvePaymentManually(
    orderId: number,
    confirmedByName: string = 'Admin',
): Promise<RegisterManualPaymentResult> {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { totalAmount: true, metadata: true, finalPaidAmount: true },
        })

        if (!order) return { success: false, message: `Pedido #${orderId} não encontrado.` }

        const metadata = parseOrderMetadata(order.metadata)
        const snapshot = readFinancialLedger(
            metadata,
            order.totalAmount ?? 0,
            typeof order.finalPaidAmount === 'number' ? order.finalPaidAmount : null,
        )

        const remaining = roundMoney(Math.max((order.totalAmount ?? 0) - snapshot.amountReceived, 0))
        if (remaining <= 0) {
            return {
                success: false,
                message: 'Este pedido já está totalmente liquidado.',
            }
        }

        return await registerManualPayment(orderId, {
            amountReceived: remaining,
            paymentDate: new Date().toISOString(),
            paymentMethod: MANUAL_METHOD_DEFAULT,
            notes: `Compat mode approval by ${confirmedByName}`,
        })
    } catch (error: any) {
        console.error('[approvePaymentManually] failed', error)
        return { success: false, message: error?.message || 'Falha ao aprovar manualmente.' }
    }
}
