'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/app/actions/auth'
import { parseOrderMetadata } from '@/lib/translationArtifactSource'
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

interface RegisterManualPaymentPayload {
    amountReceived: number
    paymentDate: string
    paymentMethod?: string | null
    notes?: string | null
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

function resolveApiBaseUrl(): string {
    const envBase =
        process.env.INTERNAL_APP_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

    return (envBase || 'http://localhost:3000').replace(/\/$/, '')
}

async function triggerAnthropicTranslationForOrder(orderId: number): Promise<{
    success: boolean
    translatedDocs: number
    attemptedDocs: number
    errorCount: number
}> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            documents: {
                select: {
                    id: true,
                    originalFileUrl: true,
                    translatedText: true,
                    externalTranslationUrl: true,
                    sourceLanguage: true,
                },
                orderBy: { id: 'asc' },
            },
        },
    })

    if (!order) {
        return { success: false, translatedDocs: 0, attemptedDocs: 0, errorCount: 1 }
    }

    const apiBase = resolveApiBaseUrl()
    const { FEATURE_FLAGS } = await import('@/lib/featureFlags')
    const translatePath = FEATURE_FLAGS.USE_TRANSLATION_V2 ? '/api/translate/v2' : '/api/translate/claude'
    const endpoint = `${apiBase}${translatePath}`

    const eligibleDocs = order.documents.filter((doc) => {
        if (!doc.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') return false
        if (doc.externalTranslationUrl) return false
        if (doc.translatedText && doc.translatedText.trim().length > 0) return false
        return true
    })

    let translatedDocs = 0
    let errorCount = 0

    for (const doc of eligibleDocs) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileUrl: doc.originalFileUrl,
                    documentId: doc.id,
                    orderId,
                    sourceLanguage: doc.sourceLanguage || 'pt',
                }),
            })

            const data = await res.json().catch(() => ({}))
            if (!res.ok || typeof data?.translatedText !== 'string' || data.translatedText.trim().length === 0) {
                errorCount += 1
                await prisma.document.update({
                    where: { id: doc.id },
                    data: { translation_status: 'error' },
                })
                continue
            }

            await prisma.document.update({
                where: { id: doc.id },
                data: {
                    translatedText: data.translatedText,
                    translation_status: 'ai_draft',
                },
            })
            translatedDocs += 1
        } catch (error) {
            console.error('[registerManualPayment] Anthropic dispatch failed for doc', doc.id, error)
            errorCount += 1
            await prisma.document.update({
                where: { id: doc.id },
                data: { translation_status: 'error' },
            })
        }
    }

    const readyDocCount = await prisma.document.count({
        where: {
            orderId,
            OR: [
                { externalTranslationUrl: { not: null } },
                { translatedText: { not: null } },
            ],
        },
    })

    if (readyDocCount > 0) {
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'READY_FOR_REVIEW' as any },
        })
    } else if (eligibleDocs.length > 0) {
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'MANUAL_TRANSLATION_NEEDED' as any },
        })
    }

    return {
        success: readyDocCount > 0,
        translatedDocs,
        attemptedDocs: eligibleDocs.length,
        errorCount,
    }
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
                paymentMethod: true,
                metadata: true,
                finalPaidAmount: true,
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

        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: nextOperationalStatus as any,
                paymentMethod,
                finalPaidAmount: nextSnapshot.amountReceived,
                metadata: JSON.stringify(nextMetadata),
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

        if (canStartWorkflow && isPreProductionOperationalStatus(order.status)) {
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
