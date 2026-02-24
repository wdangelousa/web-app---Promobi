'use server'

import { revalidatePath } from 'next/cache'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function retryTranslation(orderId: number) {
    try {
        console.log(`[retryTranslation] Triggering DeepL for order #${orderId}`)

        const edgeFnUrl = `${SUPABASE_URL}/functions/v1/translate-order`
        const res = await fetch(edgeFnUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON}`,
            },
            body: JSON.stringify({ orderId }),
        })

        if (!res.ok) {
            const txt = await res.text().catch(() => '')
            throw new Error(`Edge function returned ${res.status}: ${txt}`)
        }

        revalidatePath(`/admin/orders/${orderId}`)
        return { success: true }
    } catch (error: any) {
        console.error(`[retryTranslation] Failed for order ${orderId}:`, error)
        return { success: false, error: error.message || 'Falha ao acionar tradução automática.' }
    }
}
