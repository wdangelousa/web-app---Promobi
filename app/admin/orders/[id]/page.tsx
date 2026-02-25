import prisma from '@/lib/prisma'
import Workbench from './components/Workbench'
import Link from 'next/link'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/app/actions/auth'
import { Role } from '@prisma/client'
import { normalizeOrder } from '@/lib/orderAdapter'

export const dynamic = 'force-dynamic'

export default async function OrderWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
    const currentUser = await getCurrentUser()

    // Role protection - consistent with orders list
    if (!currentUser) redirect('/login')
    if (currentUser.role === Role.FINANCIAL) redirect('/admin/finance')
    if (currentUser.role === Role.PARTNER) redirect('/admin/executive')

    const { id } = await params
    const orderId = parseInt(id)
    if (isNaN(orderId)) return notFound()

    let sanitizedOrder: any = null

    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: {
                    select: {
                        fullName: true,
                        email: true,
                        phone: true,
                    }
                },
                documents: {
                    select: {
                        id: true,
                        docType: true,
                        originalFileUrl: true,
                        translatedFileUrl: true,
                        translatedText: true,
                        exactNameOnDoc: true,
                        translation_status: true,
                        delivery_pdf_url: true,
                        isReviewed: true,
                        externalTranslationUrl: true,
                        pageRotations: true,
                    },
                    orderBy: { id: 'asc' }, // P6: deterministic order (matches workbench/[orderId]/page.tsx)
                }
            }
        })

        if (!order) return notFound()

        // Use the adapter for robust normalization and serialization stability
        sanitizedOrder = normalizeOrder(order)
    } catch (err) {
        console.error(`[WorkbenchPage] Error loading order #${orderId}:`, err)
        throw err // Let nextjs error boundary handle it
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin/orders" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft className="h-5 w-5 text-gray-500" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Workbench de Tradução</h1>
                        <p className="text-xs text-gray-500">
                            Pedido #{sanitizedOrder.id} • {sanitizedOrder.user?.fullName || 'Cliente'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* P7 — Urgency badge: only shown for non-standard orders */}
                    {sanitizedOrder.urgency && sanitizedOrder.urgency !== 'standard' && (
                        <span className="px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider bg-red-50 text-red-700 border-red-200 animate-pulse">
                            🔥 {sanitizedOrder.urgency}
                        </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${
                        sanitizedOrder.status === 'READY_FOR_REVIEW'          ? 'bg-teal-50 text-teal-700 border-teal-200' :
                        sanitizedOrder.status === 'TRANSLATING'               ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                        sanitizedOrder.status === 'COMPLETED'                 ? 'bg-green-50 text-green-700 border-green-200' :
                        sanitizedOrder.status === 'PAID'                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        sanitizedOrder.status === 'MANUAL_TRANSLATION_NEEDED' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                                                'bg-gray-100 text-gray-600 border-gray-200'
                    }`}>
                        {sanitizedOrder.status?.replace(/_/g, ' ')}
                    </span>
                </div>
            </div>

            {/* Workbench Client Component */}
            <div className="flex-1 overflow-hidden">
                <Workbench order={sanitizedOrder as any} />
            </div>
        </div>
    )
}