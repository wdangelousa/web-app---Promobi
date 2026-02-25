'use client'

import { useState, useEffect } from 'react'
import { RotateCw, Loader2 } from 'lucide-react'

interface DocPageRotationsProps {
    docId: number
    docUrl: string
    initialRotations: Record<string, number> | null
}

export default function DocPageRotations({ docId, docUrl, initialRotations }: DocPageRotationsProps) {
    const [pageCount, setPageCount] = useState<number | null>(null)
    const [rotations, setRotations] = useState<Record<string, number>>(initialRotations ?? {})
    const [saving, setSaving] = useState<number | null>(null)

    // Re-sync rotations when the selected document changes
    useEffect(() => {
        setRotations(initialRotations ?? {})
    }, [docId])

    // Fetch page count whenever the document changes
    useEffect(() => {
        if (!docUrl || docUrl === 'PENDING_UPLOAD') { setPageCount(1); return }
        setPageCount(null)
        import('../../../../actions/orcamento')
            .then(({ getDocumentPageCount }) => getDocumentPageCount(docId))
            .then(count => setPageCount(count))
            .catch(() => setPageCount(1))
    }, [docId, docUrl])

    const handleRotate = async (pageIndex: number) => {
        const current = rotations[pageIndex.toString()] ?? 0
        const next = (current + 90) % 360
        // Optimistic update
        setRotations(prev => ({ ...prev, [pageIndex.toString()]: next }))
        setSaving(pageIndex)
        try {
            const { updatePageRotation } = await import('../../../../actions/orcamento')
            await updatePageRotation(docId, pageIndex, next)
        } finally {
            setSaving(null)
        }
    }

    return (
        <div className="shrink-0 border-t border-gray-700 bg-gray-900 px-3 py-1.5">
            <div className="flex items-center gap-1.5 overflow-x-auto">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider shrink-0 mr-1">
                    Girar pág:
                </span>

                {pageCount === null ? (
                    <span className="flex items-center gap-1.5 text-[10px] text-gray-600">
                        <Loader2 className="w-3 h-3 animate-spin" /> Carregando…
                    </span>
                ) : (
                    Array.from({ length: pageCount }, (_, i) => {
                        const rot = rotations[i.toString()] ?? 0
                        const isSaving = saving === i
                        return (
                            <button
                                key={i}
                                onClick={() => handleRotate(i)}
                                disabled={isSaving}
                                title={`Página ${i + 1} — rotação atual: ${rot}°`}
                                className={`shrink-0 flex flex-col items-center gap-0.5 px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
                                    rot !== 0
                                        ? 'bg-orange-900/40 border-[#f58220] text-[#f58220]'
                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                                }`}
                            >
                                {isSaving ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <RotateCw
                                        className="w-3 h-3"
                                        style={{
                                            transform: `rotate(${rot}deg)`,
                                            transition: 'transform 0.25s ease',
                                        }}
                                    />
                                )}
                                <span className="text-[9px] font-mono leading-none">{i + 1}</span>
                                {rot !== 0 && (
                                    <span className="text-[8px] leading-none font-bold">{rot}°</span>
                                )}
                            </button>
                        )
                    })
                )}
            </div>
        </div>
    )
}
