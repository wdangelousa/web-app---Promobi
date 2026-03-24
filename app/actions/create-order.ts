'use server'

import { PaymentProvider } from '@prisma/client'
import prisma from '../../lib/prisma'
import { getGlobalSettings } from './settings'
import { calculateCanonicalProposalTotal, sanitizeProposalBreakdown } from '../../lib/proposalPricingSummary'

// ── Types ──────────────────────────────────────────────────────────────────────
type UploadedFile = {
    fileName: string;
    url: string;
    contentType: string;
}

type DocumentItem = {
    id: string;
    type: string;
    fileName?: string;
    count: number;
    notarized?: boolean;
    customDescription?: string;
    uploadedFile?: UploadedFile;
    analysis?: {
        totalPages: number;
        pages: Array<{
            pageNumber: number;
            wordCount: number;
            density: string;
            fraction: number;
            price: number;
            included?: boolean;
        }>;
        [key: string]: any;
    };
    handwritten?: boolean;
}

type CreateOrderInput = {
    user: {
        fullName: string;
        email: string;
        phone: string;
    };
    documents: DocumentItem[];
    urgency: string;
    docCategory: 'standard';
    notaryMode: 'none';
    zipCode: string;
    grandTotalOverride?: number;
    breakdown?: any;
    paymentProvider: 'STRIPE' | 'PARCELADO_USA';
    serviceType?: 'translation' | 'notarization';
    status?: any;
    sourceLanguage?: 'PT_BR' | 'ES';
    extraDiscount?: number;
}

// ── Scope helper ───────────────────────────────────────────────────────────────
function extractDocumentScope(doc: DocumentItem) {
    const analysis = doc.analysis;

    if (!analysis || !analysis.pages || analysis.pages.length === 0) {
        return {
            billablePages: doc.count || 1,
            totalPages: null,
            excludedFromScope: false,
        };
    }

    const totalPages = analysis.pages.length;
    const billablePages = analysis.pages.filter(
        (p) => p.included !== false
    ).length;
    const excludedFromScope = billablePages === 0;

    return { billablePages, totalPages, excludedFromScope };
}

export async function createOrder(data: CreateOrderInput) {
    try {
        console.log('[createOrder] Starting for:', data.user.email);
        const sanitizedBreakdown = sanitizeProposalBreakdown(data.breakdown)

        const settings = await getGlobalSettings();
        const PRICE_PER_PAGE = settings.basePrice || 9.00;
        const NOTARY_FEE_PER_DOC = settings.notaryFee || 25.00;

        const URGENCY_MULTIPLIER: Record<string, number> = {
            standard: 1.0,
            urgent: 1.0 + settings.urgencyRate,
            flash: 1.0 + (settings.urgencyRate * 2),
            normal: 1.0,
        };

        let totalAmount = 0;
        let discountPercentage = 0;
        let discountAmount = 0;

        if (data.grandTotalOverride) {
            totalAmount = calculateCanonicalProposalTotal({
                breakdown: sanitizedBreakdown,
                operationalAdjustmentAmount: 0,
            });
            discountPercentage = sanitizedBreakdown?.volumeDiscountPercentage || 0;
            discountAmount = (sanitizedBreakdown?.volumeDiscountAmount || 0) + (sanitizedBreakdown?.totalDiscountApplied || 0);
        } else {
            const totalCount = data.documents.reduce((a, d) => a + (d.count || 0), 0);
            const base = totalCount * PRICE_PER_PAGE * (URGENCY_MULTIPLIER[data.urgency] ?? 1.0);

            if (totalCount >= 51) discountPercentage = 15;
            else if (totalCount >= 31) discountPercentage = 10;
            else if (totalCount >= 16) discountPercentage = 5;
            else discountPercentage = 0;

            discountAmount = base * (discountPercentage / 100);
            const baseAfterDiscount = base - discountAmount;

            const notary = data.documents.reduce((a, d) => a + (d.notarized ? NOTARY_FEE_PER_DOC : 0), 0);
            totalAmount = baseAfterDiscount + notary;
        }

        const hasTranslation = data.serviceType !== 'notarization';
        const hasNotary = data.serviceType === 'notarization'
            || data.documents.some(d => d.notarized);

        const order = await prisma.$transaction(async (tx) => {
            let user = await tx.user.findUnique({ where: { email: data.user.email } });
            if (!user) {
                user = await tx.user.create({
                    data: {
                        fullName: data.user.fullName,
                        email: data.user.email,
                        phone: data.user.phone,
                        role: 'CLIENT',
                    },
                });
            }

            return tx.order.create({
                data: {
                    userId: user.id,
                    totalAmount,
                    status: data.status || 'PENDING',
                    paymentProvider: data.paymentProvider as PaymentProvider,
                    paymentMethod: data.paymentProvider === 'STRIPE' ? 'STRIPE' : 'BRL_GATEWAY',
                    urgency: data.urgency,
                    hasTranslation,
                    hasNotary,
                    sourceLanguage: data.sourceLanguage || 'PT_BR',
                    metadata: JSON.stringify({
                        documents: data.documents,
                        breakdown: sanitizedBreakdown,
                        urgency: data.urgency,
                        serviceType: data.serviceType,
                        sourceLanguage: data.sourceLanguage,
                    }),
                    discountPercentage,
                    discountAmount,
                    extraDiscount: 0,
                    documents: {
                        create: data.documents.map((doc) => {
                            const scope = extractDocumentScope(doc);
                            return {
                                docType: doc.fileName?.split('.').pop() ?? 'file',
                                originalFileUrl: doc.uploadedFile?.url ?? 'PENDING_UPLOAD',
                                exactNameOnDoc: doc.fileName ?? 'Unknown File',
                                billablePages: scope.billablePages,
                                totalPages: scope.totalPages,
                                excludedFromScope: scope.excludedFromScope,
                            };
                        }),
                    },
                },
            });
        });

        console.log(`[createOrder] Created Order #${order.id} (hasTranslation=${hasTranslation})`);
        return { success: true, orderId: order.id };

    } catch (error: any) {
        console.error('[createOrder] FATAL ERROR:', error);
        return { success: false, error: `Database Error: ${error?.message || String(error)}` };
    }
}

export async function updateOrder(orderId: number, data: CreateOrderInput) {
    try {
        console.log('[updateOrder] Starting for Order #', orderId);
        const sanitizedBreakdown = sanitizeProposalBreakdown(data.breakdown)

        const settings = await getGlobalSettings();
        const PRICE_PER_PAGE = settings.basePrice || 9.00;
        const NOTARY_FEE_PER_DOC = settings.notaryFee || 25.00;

        const URGENCY_MULTIPLIER: Record<string, number> = {
            standard: 1.0,
            urgent: 1.0 + settings.urgencyRate,
            flash: 1.0 + (settings.urgencyRate * 2),
            normal: 1.0,
        };

        let totalAmount = 0;
        let discountPercentage = 0;
        let discountAmount = 0;

        if (data.grandTotalOverride) {
            totalAmount = calculateCanonicalProposalTotal({
                breakdown: sanitizedBreakdown,
                operationalAdjustmentAmount: 0,
            });
            discountPercentage = sanitizedBreakdown?.volumeDiscountPercentage || 0;
            discountAmount = (sanitizedBreakdown?.volumeDiscountAmount || 0) + (sanitizedBreakdown?.totalDiscountApplied || 0);
        } else {
            const totalCount = data.documents.reduce((a, d) => a + (d.count || 0), 0);
            const base = totalCount * PRICE_PER_PAGE * (URGENCY_MULTIPLIER[data.urgency] ?? 1.0);

            if (totalCount >= 51) discountPercentage = 15;
            else if (totalCount >= 31) discountPercentage = 10;
            else if (totalCount >= 16) discountPercentage = 5;
            else discountPercentage = 0;

            discountAmount = base * (discountPercentage / 100);
            const baseAfterDiscount = base - discountAmount;

            const notary = data.documents.reduce((a, d) => a + (d.notarized ? NOTARY_FEE_PER_DOC : 0), 0);
            totalAmount = baseAfterDiscount + notary;
        }

        const hasTranslation = data.serviceType !== 'notarization';
        const hasNotary = data.serviceType === 'notarization' || data.documents.some(d => d.notarized);

        const order = await prisma.$transaction(async (tx) => {
            const existingOrder = await tx.order.findUnique({ where: { id: orderId } });
            if (!existingOrder) throw new Error('Order not found');

            await tx.user.update({
                where: { email: data.user.email },
                data: {
                    fullName: data.user.fullName,
                    phone: data.user.phone,
                },
            });

            await tx.document.deleteMany({ where: { orderId } });

            return tx.order.update({
                where: { id: orderId },
                data: {
                    totalAmount,
                    status: data.status || 'PENDING_PAYMENT',
                    urgency: data.urgency,
                    hasTranslation,
                    hasNotary,
                    metadata: JSON.stringify({
                        documents: data.documents,
                        breakdown: sanitizedBreakdown,
                        urgency: data.urgency,
                        serviceType: data.serviceType,
                        sourceLanguage: data.sourceLanguage,
                    }),
                    discountPercentage,
                    discountAmount,
                    extraDiscount: 0,
                    documents: {
                        create: data.documents.map((doc) => {
                            const scope = extractDocumentScope(doc);
                            return {
                                docType: doc.fileName?.split('.').pop() ?? 'file',
                                originalFileUrl: doc.uploadedFile?.url ?? 'PENDING_UPLOAD',
                                exactNameOnDoc: doc.fileName ?? 'Unknown File',
                                billablePages: scope.billablePages,
                                totalPages: scope.totalPages,
                                excludedFromScope: scope.excludedFromScope,
                            };
                        }),
                    },
                },
            });
        });

        console.log(`[updateOrder] Updated Order #${order.id}`);
        return { success: true, orderId: order.id };

    } catch (error: any) {
        console.error('[updateOrder] Error:', error);
        return { success: false, error: `Failed to update order: ${error?.message || String(error)}` };
    }
}
