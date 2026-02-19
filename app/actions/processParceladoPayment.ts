'use server'

import { checkoutParcelado } from './checkoutParcelado'

export async function processParceladoPayment(orderId: number) {
    return await checkoutParcelado(orderId);
}
