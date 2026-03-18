'use server'

export type DeliveryResponse =
    | { success: true }
    | { success: false; error: string }

export async function sendDelivery(orderId: number): Promise<DeliveryResponse> {
    console.error(
        `[sendDelivery] blocked — legacy delivery sender is disabled for order #${orderId}. ` +
        'Use releaseToClient with structured-generated artifacts only.'
    )
    return {
        success: false,
        error:
            'Legacy delivery sender is disabled. Use structured release flow only.',
    }
}
