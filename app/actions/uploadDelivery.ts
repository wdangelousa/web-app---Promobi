'use server'

export async function uploadDelivery(_formData: FormData) {
    console.error(
        '[uploadDelivery] blocked — legacy manual delivery upload is disabled. ' +
        'Use structured generation via generateDeliveryKit/releaseToClient only.'
    )

    return {
        success: false,
        code: 'LEGACY_MANUAL_DELIVERY_DISABLED',
        error: 'Manual delivery upload is disabled. Use structured delivery generation only.',
    }
}
