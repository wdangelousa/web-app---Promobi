'use server'

import { PaymentProvider } from '@prisma/client'
import prisma from '../../lib/prisma'
import { getGlobalSettings } from './settings'

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
    // Real file URL if uploaded before createOrder is called
    uploadedFile?: UploadedFile;
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
    serviceType?: 'translation' | 'notarization'; // drives hasTranslation
    status?: any; // Allow custom initial status (e.g. PENDING_PAYMENT)
}

export async function createOrder(data: CreateOrderInput) {
    try {
        console.log('[createOrder] Starting for:', data.user.email);

        // ── 1. Calculate total ────────────────────────────────────────────────
        const settings = await getGlobalSettings();
        const PRICE_PER_PAGE = settings.basePrice;
        const NOTARY_FEE_PER_DOC = settings.notaryFee;

        // Unify with frontend: standard/urgent/flash
        const URGENCY_MULTIPLIER: Record<string, number> = {
            standard: 1.0,
            urgent: 1.0 + settings.urgencyRate,
            flash: 1.0 + (settings.urgencyRate * 2),
            // Fallback for legacy keys if any
            normal: 1.0,
        };

        let totalAmount = 0;
        if (data.grandTotalOverride) {
            totalAmount = data.grandTotalOverride;
        } else {
            const totalCount = data.documents.reduce((a, d) => a + (d.count || 0), 0);
            const base = totalCount * PRICE_PER_PAGE * (URGENCY_MULTIPLIER[data.urgency] ?? 1.0);
            const notary = data.documents.reduce((a, d) => a + (d.notarized ? NOTARY_FEE_PER_DOC : 0), 0);
            totalAmount = base + notary;
        }

        // ── 2. Derive flags from serviceType ──────────────────────────────────
        const hasTranslation = data.serviceType !== 'notarization';
        const hasNotary = data.serviceType === 'notarization'
            || data.documents.some(d => d.notarized);

        // ── 3. Database transaction ───────────────────────────────────────────
        const order = await prisma.$transaction(async (tx) => {
            // Find or create user
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

            // Create order with real Document records
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
                    metadata: JSON.stringify({
                        documents: data.documents,
                        breakdown: data.breakdown,
                        urgency: data.urgency,
                        serviceType: data.serviceType,
                    }),
                    documents: {
                        create: data.documents.map((doc) => ({
                            docType: doc.fileName?.split('.').pop() ?? 'file',
                            // ✅ Use real Supabase URL if available, otherwise mark for manual upload
                            originalFileUrl: doc.uploadedFile?.url ?? 'PENDING_UPLOAD',
                            exactNameOnDoc: doc.fileName ?? 'Unknown File',
                        })),
                    },
                },
            });
        });

        console.log(`[createOrder] Created Order #${order.id} (hasTranslation=${hasTranslation})`);
        return { success: true, orderId: order.id };

    } catch (error) {
        console.error('[createOrder] Error:', error);
        return { success: false, error: 'Failed to create order' };
    }
}
