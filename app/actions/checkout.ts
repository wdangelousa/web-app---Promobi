'use server'

import { redirect } from 'next/navigation'
import Stripe from 'stripe'
import prisma from '../../lib/prisma'

export async function createCheckoutSession(orderId: number) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { user: true }
        })

        if (!order) {
            return { success: false, error: "Pedido não encontrado" }
        }

        // --- EMAIL NOTIFICATION (Async - Fire & Forget) ---
        // We call this here to notify that an ATTEMPT to pay is starting or order is created. 
        // Ideally, this should be after webhook confirmation, but user requested "as soon as order is created".
        // Since createOrder happens before this, let's trigger it here or in create-order. 
        // User said "Nas actions de checkout... adicione a lógica".

        // Import dynamically if needed or just use import at top.
        // We will add the import at the top of the file in a separate edit or use standard import if possible.
        try {
            const { sendOrderEmails } = await import('../../lib/email');
            sendOrderEmails(order); // Async, no await to not block
        } catch (e) {
            console.error("Email trigger failed", e);
        }

        // --- STRIPE CHECKOUT ---
        if (order.paymentProvider === 'STRIPE') {
            if (!process.env.STRIPE_SECRET_KEY) {
                console.error("Missing STRIPE_SECRET_KEY")
                return { success: false, error: "Erro de configuração de pagamento" }
            }

            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder')

            // Create Checkout Session
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: `Tradução/Notarização #${order.id}`,
                                description: 'Serviço de Tradução e Notarização Certificada',
                            },
                            unit_amount: Math.round(order.totalAmount * 100), // Amount in cents
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/sucesso?orderId=${order.id}`,
                cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?canceled=true`,
                customer_email: order.user.email,
                metadata: {
                    orderId: order.id.toString(),
                    userId: order.userId.toString()
                }
            })

            return { success: true, url: session.url }
        }

        // --- PARCELADO USA (MOCK/PLACEHOLDER) ---
        if (order.paymentProvider === 'PARCELADO_USA') {
            // No update needed for now as PENDING is default and valid
            // await prisma.order.update({ ... })

            // Redirect to Mock Success/Instructions Page
            return {
                success: true,
                url: `/sucesso-pix?orderId=${order.id}`
            }
        }

        return { success: false, error: "Método de pagamento inválido" }

    } catch (error) {
        console.error("Checkout Error:", error)
        return { success: false, error: "Falha ao iniciar checkout" }
    }
}
