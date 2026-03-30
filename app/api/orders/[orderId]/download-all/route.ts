'use server'

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import JSZip from 'jszip'
import { cleanDocumentName } from '@/lib/proposalUtils'

function uniqueFileName(zip: JSZip, baseName: string, ext: string): string {
    let candidate = `${baseName}${ext}`
    let counter = 2

    while (zip.file(candidate)) {
        candidate = `${baseName} (${counter})${ext}`
        counter += 1
    }

    return candidate
}

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

    const allDocs = order.documents
    const excludedDocs = allDocs.filter((d) => d.excludedFromScope)
    const eligibleDocs = allDocs.filter((d) => !d.excludedFromScope)
    const docsWithPdf = eligibleDocs.filter((d) => d.delivery_pdf_url)
    const docsMissingPdf = eligibleDocs.filter((d) => !d.delivery_pdf_url)

    if (excludedDocs.length > 0) {
        console.log(
            `[download-all] order=${orderId}: ${excludedDocs.length} document(s) excluded from ZIP (excludedFromScope=true): ` +
            `ids=[${excludedDocs.map((d) => d.id).join(',')}]`,
        )
    }

    if (docsMissingPdf.length > 0) {
        console.warn(
            `[download-all] order=${orderId}: ${docsMissingPdf.length} document(s) excluded from ZIP (missing delivery_pdf_url): ` +
            `ids=[${docsMissingPdf.map((d) => d.id).join(',')}]`,
        )
    }

    if (docsWithPdf.length === 0) {
        return NextResponse.json({ error: 'No delivery PDFs available' }, { status: 404 })
    }

    const zip = new JSZip()
    let addedFiles = 0

    for (let i = 0; i < docsWithPdf.length; i++) {
        const doc = docsWithPdf[i]
        const url = doc.delivery_pdf_url!

        try {
            const res = await fetch(url)
            if (!res.ok) {
                console.error(
                    `[download-all] Failed to fetch PDF for doc ${doc.id}: HTTP ${res.status} ${res.statusText} — url=${url}`,
                )
                continue
            }

            const buffer = await res.arrayBuffer()
            const baseName = cleanDocumentName(doc.exactNameOnDoc || `Documento ${i + 1}`)
            const fileName = uniqueFileName(zip, baseName, '.pdf')

            if (fileName !== `${baseName}.pdf`) {
                console.warn(
                    `[download-all] order=${orderId}: duplicate ZIP filename resolved for doc ${doc.id}: ` +
                    `base="${baseName}.pdf" final="${fileName}"`,
                )
            }

            zip.file(fileName, buffer)
            addedFiles += 1
        } catch (err) {
            console.error(
                `[download-all] Network error fetching PDF for doc ${doc.id}: url=${url}`,
                err,
            )
        }
    }

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })
    const zipName = `Promobidocs-Pedido-${orderId}.zip`
    const zipIncomplete = addedFiles < eligibleDocs.length

    if (zipIncomplete) {
        console.warn(
            `[download-all] order=${orderId}: ZIP generated with ${addedFiles} of ${eligibleDocs.length} eligible documents ` +
            `(withPdf=${docsWithPdf.length}, missingPdf=${docsMissingPdf.length}, excludedScope=${excludedDocs.length})`,
        )
    } else {
        console.log(
            `[download-all] order=${orderId}: ZIP generated with ${addedFiles} of ${eligibleDocs.length} eligible documents`,
        )
    }

    return new NextResponse(zipBuffer, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${zipName}"`,
            'X-Zip-Incomplete': zipIncomplete ? 'true' : 'false',
        },
    })
}
