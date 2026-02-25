'use server'

import prisma from '@/lib/prisma'
import { PDFDocument } from 'pdf-lib'

function isImageUrl(url: string): boolean {
    const lower = url.toLowerCase().split('?')[0]
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')
}

// ─── updatePageRotation ───────────────────────────────────────────────────────
// Reads the current pageRotations JSON, updates the key for `pageIndex`,
// and persists it back. Rotation cycles 0→90→180→270→0 from the UI.

export async function updatePageRotation(
    docId: number,
    pageIndex: number,
    rotation: number
): Promise<{ success: boolean; error?: string }> {
    try {
        const doc = await prisma.document.findUnique({
            where: { id: docId },
            select: { pageRotations: true },
        })
        if (!doc) return { success: false, error: 'Documento não encontrado.' }

        const current = (doc.pageRotations as Record<string, number> | null) ?? {}
        const updated = { ...current, [pageIndex.toString()]: rotation }

        await prisma.document.update({
            where: { id: docId },
            data: { pageRotations: updated },
        })

        return { success: true }
    } catch (err: any) {
        console.error('[updatePageRotation]', err)
        return { success: false, error: err.message ?? 'Erro ao salvar rotação.' }
    }
}

// ─── getDocumentPageCount ─────────────────────────────────────────────────────
// Returns the number of pages in the original document.
// Images always return 1. PDFs are loaded via pdf-lib.

export async function getDocumentPageCount(docId: number): Promise<number> {
    try {
        const doc = await prisma.document.findUnique({
            where: { id: docId },
            select: { originalFileUrl: true },
        })

        if (!doc?.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') return 1
        if (isImageUrl(doc.originalFileUrl)) return 1

        const res = await fetch(doc.originalFileUrl)
        if (!res.ok) return 1

        const buf = Buffer.from(await res.arrayBuffer())
        const pdf = await PDFDocument.load(buf, { ignoreEncryption: true })
        return pdf.getPageCount()
    } catch {
        return 1
    }
}
