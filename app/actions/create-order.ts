'use server'

import { PaymentProvider } from '@prisma/client'
import { generatePaymentLink } from './process-payment'
import prisma from '../../lib/prisma'

// Types matching the frontend
type DocumentItem = {
    id: string;
    type: string; // "Uploaded File"
    fileName?: string;
    count: number;
    notarized?: boolean;
    customDescription?: string;
}

type CreateOrderInput = {
    user: {
        fullName: string;
        email: string;
        phone: string;
    };
    documents: DocumentItem[];
    urgency: string;
    docCategory: 'standard'; // Keep for compat
    notaryMode: 'none'; // Keep for compat
    zipCode: string; // Keep for compat
    grandTotalOverride?: number; // Trusted total from client (density logic)
    breakdown?: any; // New field for pricing breakdown
    paymentProvider: 'STRIPE' | 'PARCELADO_USA';
}

// Pricing Constants (Must match frontend)
const PRICE_PER_PAGE = 9.00
const NOTARY_FEE_PER_DOC = 25.00
const URGENCY_MULTIPLIER: Record<string, number> = {
    normal: 1.0,
    urgent: 1.5,
    super_urgent: 2.0
}

export async function createOrder(data: CreateOrderInput) {
    try {
        console.log("Creating Order:", data);

        let totalAmount = 0;

        if (data.grandTotalOverride) {
            // Trust the client-side density calculation
            totalAmount = data.grandTotalOverride;
        } else {
            // Fallback: Old server-side calculation
            const totalCount = data.documents.reduce((acc, doc) => acc + (doc.count || 0), 0)
            const base = totalCount * PRICE_PER_PAGE
            const multiplier = URGENCY_MULTIPLIER[data.urgency] || 1.0
            const totalTranslation = base * multiplier
            const notary = data.documents.reduce((acc, doc) => acc + (doc.notarized ? NOTARY_FEE_PER_DOC : 0), 0)

            totalAmount = totalTranslation + notary
        }




        // 2. Database Transaction
        const order = await prisma.$transaction(async (tx) => {
            // Find or Create User
            let user = await tx.user.findUnique({
                where: { email: data.user.email }
            })

            if (!user) {
                user = await tx.user.create({
                    data: {
                        fullName: data.user.fullName,
                        email: data.user.email,
                        phone: data.user.phone,
                        role: 'CLIENT'
                    }
                })
            }

            // Create Order
            // Note: We map documents to Prisma Document model. 
            // Since we don't have the file URL yet (upload not handled),    // 2. Create Order in Database
            const newOrder = await tx.order.create({
                data: {
                    userId: user.id,
                    totalAmount: totalAmount, // TRUST THE CLIENT TOTAL (Mock/Stripe will validate)
                    status: 'PENDING',
                    paymentProvider: data.paymentProvider,
                    paymentMethod: data.paymentProvider === 'STRIPE' ? 'STRIPE' : 'BRL_GATEWAY',
                    urgency: data.urgency,
                    // Capture the full richness of the new cart (files, density, breakdown)
                    metadata: JSON.stringify({
                        documents: data.documents,
                        breakdown: data.breakdown,
                        urgency: data.urgency
                    }),
                    documents: {
                        create: data.documents.map((doc: any) => ({
                            docType: doc.fileName?.split('.').pop() || 'file',
                            originalFileUrl: 'PENDING_UPLOAD', // Mock for now
                            exactNameOnDoc: doc.fileName || 'Unknown File'
                        }))
                    }
                }
            })

            return newOrder
        })

        // 3. Generate Payment Link (if applicable)
        let redirectUrl = null

        if (order.paymentProvider === 'PARCELADO_USA') {
            const paymentLink = await generatePaymentLink({
                orderId: order.id.toString(),
                amount: totalAmount,
                customer: {
                    name: data.user.fullName,
                    email: data.user.email
                }
            })
            if (paymentLink) {
                redirectUrl = paymentLink
            }
        }

        return { success: true, orderId: order.id, redirectUrl }

    } catch (error) {
        console.error("Error creating order:", error)
        return { success: false, error: "Failed to create order" }
    }
}
