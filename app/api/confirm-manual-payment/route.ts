import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { orderId, method } = body

        if (!orderId || !method) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Update the order status to indicate it's awaiting manual verification
        const order = await prisma.order.update({
            where: { id: parseInt(orderId, 10) },
            data: {
                status: 'AWAITING_VERIFICATION',
                paymentMethod: method === 'PIX' ? 'PIX' : 'ZELLE', // Store the selected manual method
                metadata: typeof orderId === 'number' ? undefined : undefined // Don't override existing metadata
            }
        })

        // In a real scenario, you'd trigger an email to the admin team here
        // using your existing notification system.

        console.log(`[Manual Payment] Order #${orderId} marked as AWAITING_VERIFICATION via ${method}`)

        return NextResponse.json({ success: true, orderId: order.id, status: order.status })

    } catch (error) {
        console.error('[Manual Payment API] Error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
