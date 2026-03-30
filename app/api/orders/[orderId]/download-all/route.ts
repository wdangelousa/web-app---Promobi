'use server'

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import JSZip from 'jszip'
import { cleanDocumentName } from '@/lib/proposalUtils'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> },
) {
    const { orderId: rawId } = await params
    const orderId = parseInt(rawId, 10)
    if (isNaN(orderId)) {
        return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    }

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { documents: true },
    })

    if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const docsWithPdf = order.documents.filter((d) => d.delivery_pdf_url)
    if (docsWithPdf.length === 0) {
        return NextResponse.json({ error: 'No delivery PDFs available' }, { status: 404 })
    }

    const zip = new JSZip()

    for (let i = 0; i < docsWithPdf.length; i++) {
        const doc = docsWithPdf[i]
        const url = doc.delivery_pdf_url!

        try {
            const res = await fetch(url)
            if (!res.ok) continue

            const buffer = await res.arrayBuffer()
            const baseName = cleanDocumentName(doc.exactNameOnDoc || `Documento ${i + 1}`)
            const fileName = `${baseName}.pdf`

            zip.file(fileName, buffer)
        } catch (err) {
            console.error(`[download-all] Failed to fetch PDF for doc ${doc.id}:`, err)
        }
    }

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })
    const zipName = `Promobidocs-Pedido-${orderId}.zip`

    return new NextResponse(zipBuffer, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${zipName}"`,
        },
    })
}
