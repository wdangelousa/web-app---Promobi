
import { Order } from '@prisma/client'

const PARCELADO_API_URL = process.env.PARCELADO_API_URL || 'https://api.parceladousa.com/v1';
const MERCHANT_CODE = process.env.PARCELADO_MERCHANT_CODE;
const API_KEY = process.env.PARCELADO_API_KEY;

export async function createParceladoPaymentLink(order: any, userEmail?: string, userName?: string) {
    console.log(`[ParceladoUSA] Initiating payment for Order #${order.id}`);

    // Fallback URL (Simulation)
    const simulationUrl = `/checkout-parcelado?orderId=${order.id}`;

    if (!MERCHANT_CODE || !API_KEY) {
        console.warn("[ParceladoUSA] Missing credentials. Returning simulation URL.");
        return { url: simulationUrl };
    }

    try {
        const payload = {
            external_reference: order.id.toString(),
            amount: Number(order.totalAmount),
            currency: 'BRL',
            description: `Order #${order.id}`,
            items: [
                {
                    title: `Serviços Notariais - Pedido #${order.id}`,
                    unit_price: Number(order.totalAmount),
                    quantity: 1
                }
            ],
            payer: {
                name: userName || "Cliente",
                email: userEmail || "email@exemplo.com"
            }
        };

        console.log("[ParceladoUSA] Sending Payload:", JSON.stringify(payload, null, 2));

        const response = await fetch(`${PARCELADO_API_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`[ParceladoUSA] API Error: ${response.status} ${response.statusText}`);
            // Fallback to simulation
            return { url: simulationUrl };
        }

        const data = await response.json();
        const paymentUrl = data.checkout_url || data.payment_link || data.url;

        if (paymentUrl) {
            return { url: paymentUrl };
        } else {
            console.warn("[ParceladoUSA] No payment URL found in response. Using simulation.");
            return { url: simulationUrl };
        }

    } catch (error) {
        console.error("[ParceladoUSA] Exception:", error);
        return { url: simulationUrl };
    }
}
