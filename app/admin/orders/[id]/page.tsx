import prisma from '@/lib/prisma'
import Workbench from './components/Workbench'
import ProposalSummary from './components/ProposalSummary'
import CancelOrderButton from './components/CancelOrderModal'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/app/actions/auth'
import { Role } from '@prisma/client'
import { normalizeOrder } from '@/lib/orderAdapter'
import { getAdminOrderStatusVisual } from '@/lib/adminOrderStatus'

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
                        billablePages: true,
                        totalPages: true,
                        excludedFromScope: true,
                        approvedKitUrl: true,
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
    const statusVisual = getAdminOrderStatusVisual(sanitizedOrder.status)

    return (
        <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
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
                    <Link
                        href={`/proposta/${sanitizedOrder.id}`}
                        target="_blank"
                        className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Ver Proposta
                    </Link>
                    <CancelOrderButton
                        orderId={sanitizedOrder.id}
                        isCancelled={sanitizedOrder.status === 'CANCELLED'}
                    />
                    {/* P7 — Urgency badge: only shown for non-standard orders */}
                    {sanitizedOrder.urgency && sanitizedOrder.urgency !== 'standard' && (
                        <span className="px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider bg-red-50 text-red-700 border-red-200 animate-pulse">
                            🔥 {sanitizedOrder.urgency}
                        </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border tracking-wide ${statusVisual.badgeClass}`}>
                        {statusVisual.label}
                    </span>
                </div>
            </div>

            {/* Proposal summary — compact read-only block for translator reference */}
            <div className="px-6 py-2 bg-gray-100 border-b border-gray-200">
                <ProposalSummary order={sanitizedOrder as any} />
            </div>

            {/* Workbench Client Component */}
            <div className="flex-1 overflow-hidden min-h-0 relative">
                <Workbench order={sanitizedOrder as any} />
            </div>
        </div>
    )
}
