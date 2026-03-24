import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

/**
 * Resend Webhook Handler
 *
 * Receives email delivery events from Resend.
 * When "email.delivered" is received for a delivery email,
 * marks the corresponding order as COMPLETED.
 *
 * Configure in Resend Dashboard → Webhooks:
 *   URL: https://promobidocs.com/api/webhooks/resend
 *   Events: email.delivered, email.bounced, email.delivery_delayed
 *   Copy the Signing Secret to env var: RESEND_WEBHOOK_SECRET
 */

// ── Svix signature verification ────────────────────────────────────────────────

async function verifyResendWebhook(
    body: string,
    headers: Headers,
): Promise<boolean> {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
        console.warn('[resend-webhook] RESEND_WEBHOOK_SECRET not configured, skipping verification')
        return true // Allow in development; block in production ideally
    }

    const svixId = headers.get('svix-id')
    const svixTimestamp = headers.get('svix-timestamp')
    const svixSignature = headers.get('svix-signature')

    if (!svixId || !svixTimestamp || !svixSignature) {
        console.error('[resend-webhook] Missing svix headers')
        return false
    }

    // Verify timestamp is within 5 minutes
    const timestamp = parseInt(svixTimestamp)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
        console.error('[resend-webhook] Timestamp too old or too new')
        return false
    }

    // Verify signature using HMAC-SHA256
    const encoder = new TextEncoder()
    const signedContent = `${svixId}.${svixTimestamp}.${body}`

    // Resend webhook secret is prefixed with "whsec_" and base64 encoded
    const secretBytes = Uint8Array.from(
        atob(secret.replace('whsec_', '')),
        c => c.charCodeAt(0)
    )

    const key = await crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )

    const signatureBytes = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(signedContent),
    )

    const expectedSignature = btoa(
        String.fromCharCode(...new Uint8Array(signatureBytes))
    )

    // svix-signature can contain multiple signatures separated by space
    const signatures = svixSignature.split(' ')
    const isValid = signatures.some((sig) => {
        const [, sigValue] = sig.split(',')
        return sigValue === expectedSignature
    })

    if (!isValid) {
        console.error('[resend-webhook] Signature verification failed')
    }
    return isValid
}

// ── Find order by Resend message ID ────────────────────────────────────────────

async function findOrderByResendMessageId(
    messageId: string,
): Promise<{ orderId: number; delivery: any } | null> {
    // Search recent orders for matching Resend message ID in metadata
    const recentOrders = await prisma.order.findMany({
        where: {
            sentAt: { not: null },
            status: { not: 'COMPLETED' },
        },
        select: { id: true, metadata: true },
        orderBy: { sentAt: 'desc' },
        take: 100,
    })

    for (const order of recentOrders) {
        try {
            const meta = typeof order.metadata === 'string'
                ? JSON.parse(order.metadata)
                : order.metadata

            const tracking = meta?.delivery?.emailTracking
            if (tracking?.resendMessageId === messageId) {
                return { orderId: order.id, delivery: meta.delivery }
            }
        } catch {
            continue
        }
    }

    return null
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const body = await req.text()

    // Verify webhook signature
    const isValid = await verifyResendWebhook(body, req.headers)
    if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let event: any
    try {
        event = JSON.parse(body)
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const eventType = event.type
    const messageId = event.data?.email_id

    console.log(`[resend-webhook] Received: ${eventType} for message ${messageId}`)

    if (!messageId) {
        return NextResponse.json({ received: true, ignored: 'no email_id' })
    }

    // ── Handle email.delivered ──────────────────────────────────────────────
    if (eventType === 'email.delivered') {
        const match = await findOrderByResendMessageId(messageId)

        if (!match) {
            console.log(`[resend-webhook] No matching order for message ${messageId}`)
            return NextResponse.json({ received: true, matched: false })
        }

        const { orderId } = match

        // Update email tracking in metadata
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { metadata: true, status: true },
        })

        if (!order) {
            return NextResponse.json({ received: true, error: 'order not found' })
        }

        let meta: Record<string, any> = {}
        try {
            meta = typeof order.metadata === 'string'
                ? JSON.parse(order.metadata)
                : (order.metadata ?? {})
        } catch { /* keep empty */ }

        // Mark delivery as confirmed
        if (meta.delivery?.emailTracking) {
            meta.delivery.emailTracking.deliveryConfirmed = true
            meta.delivery.emailTracking.deliveryConfirmedAt = new Date().toISOString()
            meta.delivery.emailTracking.resendDeliveredEvent = {
                eventId: event.data?.event_id,
                deliveredAt: event.created_at,
                to: event.data?.to,
            }
        }

        // Mark order as COMPLETED
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'COMPLETED',
                metadata: JSON.stringify(meta),
            },
        })

        console.log(`[resend-webhook] ✅ Order #${orderId} → COMPLETED (email delivered)`)

        revalidatePath(`/admin/orders/${orderId}`)
        revalidatePath('/admin/orders')
        revalidatePath('/admin/orders/concluidos')

        return NextResponse.json({ received: true, orderId, status: 'COMPLETED' })
    }

    // ── Handle email.bounced ───────────────────────────────────────────────
    if (eventType === 'email.bounced') {
        const match = await findOrderByResendMessageId(messageId)

        if (match) {
            const { orderId } = match

            const order = await prisma.order.findUnique({
                where: { id: orderId },
                select: { metadata: true },
            })

            let meta: Record<string, any> = {}
            try {
                meta = typeof order?.metadata === 'string'
                    ? JSON.parse(order.metadata)
                    : (order?.metadata ?? {})
            } catch { /* keep empty */ }

            if (meta.delivery?.emailTracking) {
                meta.delivery.emailTracking.bounced = true
                meta.delivery.emailTracking.bouncedAt = new Date().toISOString()
                meta.delivery.emailTracking.bounceEvent = {
                    eventId: event.data?.event_id,
                    bouncedAt: event.created_at,
                    to: event.data?.to,
                    reason: event.data?.bounce?.message,
                }
            }

            await prisma.order.update({
                where: { id: orderId },
                data: { metadata: JSON.stringify(meta) },
            })

            console.error(`[resend-webhook] ⚠️ Order #${orderId} email BOUNCED: ${event.data?.bounce?.message}`)
        }

        return NextResponse.json({ received: true, bounced: true })
    }

    // ── Handle email.delivery_delayed ──────────────────────────────────────
    if (eventType === 'email.delivery_delayed') {
        console.warn(`[resend-webhook] Delivery delayed for message ${messageId}`)
        return NextResponse.json({ received: true, delayed: true })
    }

    return NextResponse.json({ received: true })
}
