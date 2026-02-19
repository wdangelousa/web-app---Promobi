'use server'

type PaymentLinkInput = {
    orderId: string;
    amount: number;
    customer: {
        name: string;
        email: string;
    }
}

export async function generatePaymentLink(data: PaymentLinkInput) {
    try {
        // Mock Parcelado USA Link Generation for now
        // In a real app, you would call their API here.
        // For simulation, we'll return a success URL or a mock checkout URL.

        console.log("Generating Parcelado USA Link for:", data.orderId, data.amount);

        // Simulating an external checkout URL
        // In production, replace this with the actual API call result
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        return `${baseUrl}/checkout-parcelado?orderId=${data.orderId}`;

    } catch (error) {
        console.error("Error generating payment link:", error);
        return null;
    }
}
