'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createOrder } from '@/app/actions/create-order'
import { getGlobalSettings, GlobalSettings } from '@/app/actions/settings'
import {
    ArrowRight, Upload, FileText, ShieldCheck, Trash2,
    ChevronDown, Lock, Globe, FilePlus, Copy, ExternalLink,
    Eye, EyeOff, Sparkles, Zap, FileImage, FileType,
    CheckCircle2, Loader2, FolderOpen, Files, RotateCcw
} from 'lucide-react'
import { useUIFeedback } from '@/components/UIFeedbackProvider'
import {
    fastPassAnalysis,
    batchDeepAnalysis,
    isSupportedFile,
    detectFileType,
    DocumentAnalysis,
    PageAnalysis,
} from '@/lib/documentAnalyzer'
import { PDFDocument } from 'pdf-lib'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PageAnalysisWithInclusion = PageAnalysis & { included: boolean }

export type DocumentAnalysisExt = Omit<DocumentAnalysis, 'pages'> & {
    pages: PageAnalysisWithInclusion[]
    originalTotalPrice: number
}

type AnalysisStatus = 'pending' | 'fast' | 'deep' | 'error'

type DocumentItem = {
    id: string
    file?: File
    fileName: string
    count: number
    notarized: boolean
    analysis?: DocumentAnalysisExt
    analysisStatus: AnalysisStatus
    isSelected: boolean
    handwritten?: boolean
    externalLink?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toExt(raw: DocumentAnalysis): DocumentAnalysisExt {
    const pages = raw.pages.map(p => ({ ...p, included: p.included ?? true }))
    const totalPrice = pages.filter(p => p.included).reduce((s, p) => s + p.price, 0)
    return { ...raw, pages, totalPrice, originalTotalPrice: raw.totalPrice }
}

function recalcPrice(pages: PageAnalysisWithInclusion[]): number {
    return pages.filter(p => p.included).reduce((s, p) => s + p.price, 0)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AnalysisProgress({ completed, total, title = "Processando arquivos..." }: { completed: number; total: number; title?: string }) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4 space-y-2 mb-4"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                    <span className="text-sm font-bold text-orange-700">{title}</span>
                </div>
                {total > 0 && <span className="text-sm font-black text-orange-600">{completed}/{total}</span>}
            </div>
            {total > 0 && (
                <div className="h-2 bg-orange-100 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full"
                        animate={{ width: `${pct}%` }}
                        transition={{ ease: 'easeOut', duration: 0.3 }}
                    />
                </div>
            )}
            <p className="text-[10px] text-orange-500 font-medium">Você pode continuar preenchendo os dados</p>
        </motion.div>
    )
}

function StatusIcon({ status }: { status: AnalysisStatus }) {
    if (status === 'deep') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
    if (status === 'fast') return <Zap className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
    if (status === 'error') return <span className="text-red-400 text-xs font-bold shrink-0">!</span>
    return <Loader2 className="w-4 h-4 text-gray-300 animate-spin shrink-0" />
}

function FileTypeIcon({ fileName }: { fileName: string }) {
    if (/\.docx$/i.test(fileName)) return <FileType className="w-5 h-5" />
    if (/\.(jpe?g|png|gif|webp|tiff?)$/i.test(fileName)) return <FileImage className="w-5 h-5" />
    return <FileText className="w-5 h-5" />
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConciergePage() {
    const [serviceType, setServiceType] = useState<'translation' | 'notarization' | null>(null)
    const [documents, setDocuments] = useState<DocumentItem[]>([])
    const [urgency, setUrgency] = useState('standard')
    const [paymentPlan, setPaymentPlan] = useState<'upfront_discount' | 'upfront' | 'split'>('upfront')
    const [totalPrice, setTotalPrice] = useState(0)

    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')

    const [loading, setLoading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState<string | null>(null)
    const [generatedLink, setGeneratedLink] = useState<string | null>(null)
    const [showLinkInput, setShowLinkInput] = useState(false)
    const [externalLink, setExternalLink] = useState('')
    const [expandedDocs, setExpandedDocs] = useState<string[]>([])

    const [fastProgress, setFastProgress] = useState<{ completed: number; total: number } | null>(null)
    const [deepProgress, setDeepProgress] = useState<{ completed: number; total: number } | null>(null)
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null)

    const { toast } = useUIFeedback()
    const deepCancelRef = useRef(false)
    const folderInputRef = useRef<HTMLInputElement>(null)
    const filesInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        getGlobalSettings().then(setGlobalSettings)
        return () => { deepCancelRef.current = true }
    }, [])

    const BASE = globalSettings?.basePrice || 9.00
    const NOTARY_FEE = globalSettings?.notaryFee || 25.00
    const URGENCY_MUL: Record<string, number> = {
        standard: 1.0,
        urgent: 1.0 + (globalSettings?.urgencyRate || 0.3),
        flash: 1.0 + (globalSettings?.urgencyRate ? globalSettings.urgencyRate * 2 : 0.6),
    }

    // ─── Core upload processor ────────────────────────────────────────────────
    // ✅ FIX: PDFs NÃO são mais fatiados por página.
    // Cada arquivo enviado = 1 documento no orçamento.
    // A análise de densidade por página acontece internamente via documentAnalyzer.
    const processFiles = useCallback(async (rawFiles: File[]) => {
        const supported = rawFiles.filter(isSupportedFile)
        const skipped = rawFiles.length - supported.length

        if (supported.length === 0) {
            toast.error('Nenhum arquivo suportado. (PDF, DOCX, JPG, PNG)')
            return
        }
        if (skipped > 0) {
            toast.info(`${skipped} arquivo(s) ignorado(s) — formato não suportado.`)
        }

        const newDocIds: string[] = []
        const newDocs: DocumentItem[] = supported.map(file => {
            const id = crypto.randomUUID()
            newDocIds.push(id)
            return {
                id, file,
                fileName: file.name,
                count: 1,
                notarized: serviceType === 'notarization',
                analysis: undefined,
                analysisStatus: 'pending' as AnalysisStatus,
                isSelected: true,
                handwritten: false,
            }
        })
        setDocuments(prev => [...prev, ...newDocs])

        setFastProgress({ completed: 0, total: supported.length })
        let completedFast = 0

        const runWithConcurrency = async (tasks: (() => Promise<void>)[], limit: number) => {
            const executing: Promise<void>[] = []
            for (const task of tasks) {
                const p = task().finally(() => { executing.splice(executing.indexOf(p), 1) })
                executing.push(p)
                if (executing.length >= limit) await Promise.race(executing)
            }
            await Promise.all(executing)
        }

        const fastTasks = supported.map((file, i) => async () => {
            const id = newDocIds[i]
            try {
                const raw = await fastPassAnalysis(file, BASE)
                const analysis = toExt(raw)
                setDocuments(prev => prev.map(d =>
                    d.id === id ? { ...d, count: analysis.totalPages, analysis, analysisStatus: 'fast' } : d
                ))
            } catch {
                setDocuments(prev => prev.map(d =>
                    d.id === id ? { ...d, analysisStatus: 'error' } : d
                ))
            }
            completedFast++
            setFastProgress({ completed: completedFast, total: supported.length })
        })

        await runWithConcurrency(fastTasks, 4)
        setFastProgress(null)

        const needsDeep = supported
            .map((file, i) => ({ file, index: i, id: newDocIds[i] }))
            .filter(({ file }) => detectFileType(file) === 'pdf')

        if (needsDeep.length === 0) return

        deepCancelRef.current = false
        setDeepProgress({ completed: 0, total: needsDeep.length })

        await batchDeepAnalysis(
            needsDeep.map(({ file, index }) => ({ index, file })),
            BASE,
            ({ fileIndex, analysis, completed, total }) => {
                if (deepCancelRef.current) return
                const id = needsDeep[fileIndex]?.id
                if (!id) return
                const ext = toExt(analysis)
                setDocuments(prev => prev.map(d =>
                    d.id === id ? { ...d, count: ext.totalPages, analysis: ext, analysisStatus: 'deep' } : d
                ))
                setDeepProgress({ completed, total })
            }
        )

        setDeepProgress(null)
        toast.success(`✓ Análise completa — ${needsDeep.length} PDF(s) processado(s)`)
    }, [serviceType, BASE, toast])

    const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return
        const rawFiles = Array.from(e.target.files)
        await processFiles(rawFiles)
        e.target.value = ''
    }

    const handleFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return
        const rawFiles = Array.from(e.target.files)
        await processFiles(rawFiles)
        e.target.value = ''
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        const files = Array.from(e.dataTransfer.files)
        if (files.length) await processFiles(files)
    }

    const handleLinkAdd = () => {
        if (!externalLink) return
        let name = 'Documento via Link'
        try {
            const url = new URL(externalLink)
            name = url.pathname.split('/').pop() || url.hostname
            if (name.length < 5) name = url.hostname
        } catch { }
        setDocuments(prev => [...prev, {
            id: crypto.randomUUID(), fileName: name, count: 1,
            notarized: serviceType === 'notarization', isSelected: true,
            handwritten: false, externalLink, analysisStatus: 'deep',
        }])
        setExternalLink('')
        setShowLinkInput(false)
        toast.success('Link adicionado.')
    }

    const removeDocument = (id: string) => setDocuments(prev => prev.filter(d => d.id !== id))

    const updatePageDensity = (docId: string, pageIdx: number, newDensity: PageAnalysis['density']) => {
        setDocuments(prev => prev.map(doc => {
            if (doc.id !== docId || !doc.analysis) return doc
            const fracs: Record<string, number> = { blank: 0, low: 0.25, medium: 0.5, high: 1.0, scanned: 1.0 }
            const f = fracs[newDensity] ?? 1.0
            const newPages = doc.analysis.pages.map((p, i) =>
                i !== pageIdx ? p : { ...p, density: newDensity, fraction: f, price: BASE * f }
            )
            return { ...doc, analysis: { ...doc.analysis, pages: newPages, totalPrice: recalcPrice(newPages), originalTotalPrice: newPages.reduce((s, p) => s + p.price, 0) } }
        }))
    }

    const togglePageInclusion = (docId: string, pageIdx: number) => {
        setDocuments(prev => prev.map(doc => {
            if (doc.id !== docId || !doc.analysis) return doc
            const newPages = doc.analysis.pages.map((p, i) => i === pageIdx ? { ...p, included: !p.included } : p)
            const totalPrice = recalcPrice(newPages)
            return { ...doc, count: newPages.filter(p => p.included).length || 1, analysis: { ...doc.analysis, pages: newPages, totalPrice } }
        }))
    }

    const setAllPagesInclusion = (docId: string, included: boolean) => {
        setDocuments(prev => prev.map(doc => {
            if (doc.id !== docId || !doc.analysis) return doc
            const newPages = doc.analysis.pages.map(p => ({ ...p, included }))
            return { ...doc, count: included ? newPages.length : 0, analysis: { ...doc.analysis, pages: newPages, totalPrice: recalcPrice(newPages) } }
        }))
    }

    // ─── Per-page viewer ─────────────────────────────────────────────────────
    // Opens a single-page blob extracted from the original PDF.
    // For images/DOCX, falls back to the full file (single-page by nature).
    const openPage = async (doc: DocumentItem, pageIdx: number) => {
        if (doc.externalLink) { window.open(doc.externalLink, '_blank'); return }
        if (!doc.file) return

        const isDocPdf = /\.pdf$/i.test(doc.fileName) || doc.file.type === 'application/pdf'

        if (isDocPdf) {
            try {
                const arrayBuffer = await doc.file.arrayBuffer()
                const src = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true })
                const dst = await PDFDocument.create()
                const [copiedPage] = await dst.copyPages(src, [pageIdx])
                dst.addPage(copiedPage)
                const bytes = await dst.save()
                // Cast to any to avoid TypeScript error with ArrayBufferLike/SharedArrayBuffer
                const blob = new Blob([bytes as any], { type: 'application/pdf' })
                const url = URL.createObjectURL(blob)
                window.open(url, '_blank')
                // Revoke after a short delay so the tab has time to load it
                setTimeout(() => URL.revokeObjectURL(url), 30_000)
            } catch {
                // Fallback: open full document
                const url = URL.createObjectURL(doc.file)
                window.open(url, '_blank')
            }
        } else {
            // Images, DOCX — single "page" anyway
            const url = URL.createObjectURL(doc.file)
            window.open(url, '_blank')
        }
    }

    const toggleDocExpand = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation()
        setExpandedDocs(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
    }

    // ─── Price ────────────────────────────────────────────────────────────────

    const [breakdown, setBreakdown] = useState({
        basePrice: 0, urgencyFee: 0, notaryFee: 0,
        totalDocs: 0, totalCount: 0,
        minOrderApplied: false, totalMinimumAdjustment: 0,
        totalDiscountApplied: 0, totalSavings: 0, excludedPages: 0,
    })

    useEffect(() => {
        const sel = documents.filter(d => d.isSelected)
        let base = 0, totalPages = 0, notary = 0, original = 0, excluded = 0

        if (serviceType === 'translation') {
            sel.forEach(doc => {
                if (doc.analysis) {
                    const inc = doc.analysis.pages.filter(p => p.included)
                    let price = inc.reduce((s, p) => s + p.price, 0)
                    let orig = doc.analysis.pages.reduce((s, p) => s + p.price, 0)
                    if (doc.handwritten) { price *= 1.25; orig *= 1.25 }
                    base += price; original += orig
                    totalPages += inc.length
                    excluded += doc.analysis.pages.filter(p => !p.included).length
                } else {
                    const p = (doc.count || 1) * BASE
                    base += p; original += p; totalPages += doc.count || 1
                }
                notary += doc.notarized ? NOTARY_FEE : 0
            })
        } else if (serviceType === 'notarization') {
            notary = sel.length * NOTARY_FEE; totalPages = sel.length
        }

        const baseWithUrgency = base * (URGENCY_MUL[urgency] ?? 1.0)
        let total = baseWithUrgency + notary
        let disc = 0
        if (urgency === 'standard' && paymentPlan === 'upfront_discount') { disc = total * 0.05; total *= 0.95 }

        setBreakdown({
            basePrice: base, urgencyFee: baseWithUrgency - base, notaryFee: notary,
            totalDocs: sel.length, totalCount: totalPages,
            minOrderApplied: false, totalMinimumAdjustment: 0,
            totalDiscountApplied: disc, totalSavings: original - base, excludedPages: excluded,
        })
        setTotalPrice(total)
    }, [documents, urgency, paymentPlan, serviceType, globalSettings])

    // ─── Order creation ───────────────────────────────────────────────────────

    const handleCreateConciergeOrder = async () => {
        if (!fullName || !email || !phone) { toast.error('Preencha os dados do cliente.'); return }
        if (documents.length === 0) { toast.error('Adicione pelo menos um documento.'); return }
        setLoading(true); setUploadProgress('Enviando arquivos...')
        try {
            const uploadedDocs: any[] = []
            for (let i = 0; i < documents.length; i++) {
                const doc = documents[i]
                if (doc.file) {
                    const form = new FormData(); form.append('file', doc.file)
                    const res = await fetch('/api/upload', { method: 'POST', body: form })
                    if (res.ok) uploadedDocs.push({ docIndex: i, ...(await res.json()) })
                }
            }
            setUploadProgress('Gerando link...')
            const orderDocuments = documents.map((d, idx) => {
                const up = uploadedDocs.find(u => u.docIndex === idx)
                return {
                    id: d.id, type: d.externalLink ? 'External Link' : 'Uploaded File',
                    fileName: d.fileName, count: d.count, notarized: d.notarized,
                    analysis: d.analysis, handwritten: d.handwritten,
                    uploadedFile: up
                        ? { url: up.url, fileName: up.fileName, contentType: up.contentType }
                        : d.externalLink ? { url: d.externalLink, fileName: d.fileName, contentType: 'link/external' } : undefined,
                }
            })
            const result = await createOrder({
                user: { fullName, email, phone },
                documents: orderDocuments as any,
                urgency, docCategory: 'standard', notaryMode: 'none',
                zipCode: '00000', grandTotalOverride: totalPrice,
                breakdown: { ...breakdown, serviceType },
                paymentProvider: 'STRIPE',
                serviceType: serviceType ?? 'translation',
                status: 'PENDING_PAYMENT',
            })
            if (result.success) {
                setGeneratedLink(`${window.location.origin}/pay/${result.orderId}`)
                toast.success('Link de cobrança gerado!')
            } else {
                toast.error('Erro ao criar pedido.')
            }
        } catch (err) {
            console.error(err); toast.error('Erro inesperado.')
        } finally {
            setLoading(false); setUploadProgress(null)
        }
    }

    const deepPending = documents.filter(d => d.analysisStatus === 'fast').length

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="max-w-4xl mx-auto py-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-[#f58220] rounded-2xl flex items-center justify-center text-white shadow-lg">
                    <FilePlus className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Novo Orçamento Manual</h1>
                    <p className="text-gray-500">Fluxo "White-Glove" para clientes VIP.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* ── LEFT ──────────────────────────────────────────────── */}
                <div className="space-y-4">
                    {!serviceType ? (
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-6">
                            <h3 className="text-xl font-bold">Selecione o Serviço</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <button onClick={() => setServiceType('translation')}
                                    className="flex items-start gap-4 p-6 rounded-2xl border-2 border-gray-100 hover:border-[#f58220] hover:bg-orange-50 transition-all text-left group">
                                    <div className="bg-orange-100 p-3 rounded-xl text-orange-600 group-hover:scale-110 transition-transform"><Globe className="w-6 h-6" /></div>
                                    <div><h4 className="font-bold text-gray-900">Tradução + Certificação</h4><p className="text-xs text-gray-500 mt-1">Fluxo completo para USCIS.</p></div>
                                </button>
                                <button onClick={() => setServiceType('notarization')}
                                    className="flex items-start gap-4 p-6 rounded-2xl border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group">
                                    <div className="bg-blue-100 p-3 rounded-xl text-blue-600 group-hover:scale-110 transition-transform"><ShieldCheck className="w-6 h-6" /></div>
                                    <div><h4 className="font-bold text-gray-900">Apenas Notarização</h4><p className="text-xs text-gray-500 mt-1">Tradução já existe.</p></div>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
                            {/* Toolbar */}
                            <div className="flex justify-between items-center pb-4 border-b border-gray-50">
                                <button onClick={() => setServiceType(null)} className="text-xs font-bold text-gray-400 hover:text-[#f58220] flex items-center gap-1">
                                    <ArrowRight className="w-3 h-3 rotate-180" /> Trocar Serviço
                                </button>
                                <h3 className="font-bold text-gray-900">
                                    {serviceType === 'translation' ? 'Editor de Tradução' : 'Editor de Notarização'}
                                </h3>
                            </div>

                            {/* Progress bars */}
                            <AnimatePresence>
                                {fastProgress && fastProgress.completed < fastProgress.total && (
                                    <AnalysisProgress completed={fastProgress.completed} total={fastProgress.total} title="Extraindo metadados..." />
                                )}
                                {!fastProgress && deepProgress && deepProgress.completed < deepProgress.total && (
                                    <AnalysisProgress completed={deepProgress.completed} total={deepProgress.total} title="Refinando análise de densidade..." />
                                )}
                            </AnimatePresence>

                            {/* Document cards */}
                            <div className="space-y-3">
                                <AnimatePresence initial={false}>
                                    {documents.map(doc => {
                                        const isLink = !!doc.externalLink
                                        const isFastOnly = doc.analysisStatus === 'fast'
                                        let docPrice = 0
                                        let densityLabel = 'N/A'
                                        let densityColor = 'bg-slate-200 text-slate-500'

                                        if (doc.analysis) {
                                            const inc = doc.analysis.pages.filter(p => p.included)
                                            docPrice = recalcPrice(inc.length > 0 ? inc : doc.analysis.pages)
                                            const avg = inc.length > 0 ? inc.reduce((s, p) => s + p.fraction, 0) / inc.length : 0
                                            const pct = Math.round(avg * 100)
                                            if (pct === 0) { densityLabel = 'Em Branco'; densityColor = 'bg-gray-100 text-gray-400' }
                                            else if (pct < 40) { densityLabel = 'Baixa'; densityColor = 'bg-green-100 text-green-700' }
                                            else if (pct < 70) { densityLabel = 'Média'; densityColor = 'bg-yellow-100 text-yellow-700' }
                                            else { densityLabel = 'Alta'; densityColor = 'bg-red-100 text-red-700' }
                                        } else {
                                            docPrice = (doc.count || 1) * BASE
                                        }
                                        if (doc.handwritten) docPrice *= 1.25

                                        const includedCount = doc.analysis?.pages.filter(p => p.included).length ?? doc.count
                                        const totalCount = doc.analysis?.pages.length ?? doc.count
                                        const excludedCount = doc.analysis?.pages.filter(p => !p.included).length ?? 0
                                        const docSavings = (doc.analysis?.originalTotalPrice ?? docPrice) - (doc.analysis?.totalPrice ?? docPrice)

                                        return (
                                            <motion.div
                                                key={doc.id}
                                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                                                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isFastOnly ? 'border-amber-200' : 'border-gray-100 hover:border-[#f58220]/30'}`}
                                            >
                                                {/* Card header */}
                                                <div className="p-4 flex justify-between items-center bg-gray-50/50">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="p-2 bg-white rounded-lg text-[#f58220] border border-gray-100 shrink-0">
                                                            <FileTypeIcon fileName={doc.fileName} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <StatusIcon status={doc.analysisStatus} />
                                                                {/* ✅ FIX: título completo, sem truncar nomes de arquivo */}
                                                                <p className="text-sm font-bold text-gray-800 break-all leading-tight">{doc.fileName}</p>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                                <span className="text-[10px] text-gray-400 font-bold uppercase">
                                                                    {doc.analysis ? `${includedCount}/${totalCount} págs.` : `${doc.count} pág.`}
                                                                </span>
                                                                {isFastOnly && (
                                                                    <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">⚡ Estimativa</span>
                                                                )}
                                                                {doc.analysisStatus === 'deep' && doc.analysis && serviceType === 'translation' && (
                                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${densityColor} uppercase`}>{densityLabel}</span>
                                                                )}
                                                                {doc.analysis?.pages.some(p => p.density === 'scanned') && (
                                                                    <span className="text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 animate-pulse">🔴 SCAN</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0 ml-2">
                                                        {serviceType === 'translation' && (
                                                            <div className="text-right">
                                                                <span className="text-sm font-black text-gray-900 block">${docPrice.toFixed(2)}</span>
                                                                {docSavings > 0 && (
                                                                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">-{excludedCount} pág.</span>
                                                                )}
                                                            </div>
                                                        )}
                                                        <button onClick={() => removeDocument(doc.id)} className="text-gray-300 hover:text-red-500 transition-colors" title="Excluir Arquivo">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* X-Ray accordion */}
                                                {serviceType === 'translation' && doc.analysis && !isLink && (
                                                    <div className="px-4 pb-4 bg-white">
                                                        <div className="h-px bg-gray-100 -mx-4 mb-3" />
                                                        <div className="flex items-center justify-between mb-3">
                                                            <button onClick={(e) => toggleDocExpand(doc.id, e)}
                                                                className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-[#f58220] transition-colors">
                                                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedDocs.includes(doc.id) ? 'rotate-180' : ''}`} />
                                                                {isFastOnly ? 'Aguardando análise completa...' : `Auditoria de Densidade — ${totalCount} ${totalCount === 1 ? 'página' : 'páginas'}`}
                                                            </button>
                                                        </div>
                                                        <AnimatePresence>
                                                            {expandedDocs.includes(doc.id) && (
                                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                                                    className="space-y-1.5 border-l-2 border-slate-50 pl-3 overflow-hidden">
                                                                    {isFastOnly ? (
                                                                        <div className="py-4 text-center text-xs text-amber-500 font-medium">
                                                                            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />Análise em andamento...
                                                                        </div>
                                                                    ) : doc.analysis.pages.map((p, pIdx) => {
                                                                        const isInc = p.included
                                                                        let pColor = 'bg-gray-100 text-gray-500', pLabel = '⚪ Vazio'
                                                                        if (p.density === 'high') { pColor = 'bg-red-50 text-red-700 border border-red-100'; pLabel = '🔴 Alta' }
                                                                        if (p.density === 'medium') { pColor = 'bg-yellow-50 text-yellow-700 border border-yellow-100'; pLabel = '🟡 Média' }
                                                                        if (p.density === 'low') { pColor = 'bg-green-50 text-green-700 border border-green-100'; pLabel = '🟢 Baixa' }
                                                                        if (p.density === 'scanned') { pColor = 'bg-red-50 text-red-700 border border-red-100'; pLabel = '🔴 Scan' }
                                                                        return (
                                                                            <div key={pIdx}
                                                                                className={`flex items-center justify-between text-[10px] py-1.5 px-3 rounded-xl border transition-all ${isInc ? 'bg-slate-50/50 border-slate-100' : 'bg-red-50/30 border-dashed border-red-100 opacity-60'}`}>
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className={`font-bold w-7 ${isInc ? 'text-gray-500' : 'text-red-400 line-through'}`}>Pg {p.pageNumber}:</span>
                                                                                    <div className="flex items-center gap-0.5 bg-white border border-slate-200 p-0.5 rounded-lg">
                                                                                        {(['blank', 'low', 'medium', 'high'] as const).map(dType => (
                                                                                            <button key={dType} onClick={() => updatePageDensity(doc.id, pIdx, dType)}
                                                                                                disabled={!isInc}
                                                                                                className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition-all ${p.density === dType
                                                                                                    ? dType === 'blank' ? 'bg-gray-200 text-gray-700' : dType === 'low' ? 'bg-green-500 text-white' : dType === 'medium' ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'
                                                                                                    : 'text-slate-400 hover:bg-slate-50'} ${!isInc && 'opacity-50 cursor-not-allowed'}`}>
                                                                                                {dType === 'blank' ? '0%' : dType === 'low' ? '25%' : dType === 'medium' ? '50%' : '100%'}
                                                                                            </button>
                                                                                        ))}
                                                                                    </div>
                                                                                    <span className={`font-black px-1.5 py-0.5 rounded text-[8px] uppercase ${pColor}`}>{pLabel}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-3">
                                                                                    <span className="text-gray-500">{p.wordCount} pal.</span>
                                                                                    <span className={`font-black ${isInc ? 'text-gray-900' : 'text-red-400 line-through'}`}>${p.price.toFixed(2)}</span>

                                                                                    <div className="flex items-center gap-1.5">
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); openPage(doc, pIdx); }}
                                                                                            title={`Visualizar pág. ${p.pageNumber}`}
                                                                                            className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-600 hover:text-white transition-all"
                                                                                        >
                                                                                            <Eye className="w-3.5 h-3.5" />
                                                                                        </button>

                                                                                        <button onClick={() => togglePageInclusion(doc.id, pIdx)}
                                                                                            title={isInc ? "Excluir página do orçamento" : "Restaurar página"}
                                                                                            className={`flex items-center justify-center w-6 h-6 rounded-md transition-all ${isInc ? 'bg-red-50 text-red-500 hover:bg-red-600 hover:text-white border border-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-100'}`}>
                                                                                            {isInc ? <Trash2 className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )
                                    })}
                                </AnimatePresence>

                                {/* ── DROP ZONE + TWO BUTTONS ────────────────── */}
                                <div
                                    onDrop={handleDrop}
                                    onDragOver={e => e.preventDefault()}
                                    className={`rounded-2xl border-2 border-dashed transition-all ${deepProgress ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 hover:border-[#f58220]/50'}`}
                                >
                                    <div className="p-5 text-center">
                                        <Upload className={`w-6 h-6 mx-auto mb-2 ${deepProgress ? 'text-amber-400' : 'text-gray-300'}`} />
                                        <p className="text-xs text-gray-400 font-medium mb-4">
                                            Arraste arquivos ou pastas aqui — ou use os botões abaixo
                                        </p>

                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="flex items-center justify-center gap-2 py-2.5 px-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl cursor-pointer transition-all group">
                                                <FolderOpen className="w-4 h-4 text-orange-500 group-hover:scale-110 transition-transform" />
                                                <span className="text-xs font-bold text-orange-700">Pasta Inteira</span>
                                                <input
                                                    ref={folderInputRef}
                                                    type="file"
                                                    className="hidden"
                                                    onChange={handleFolderUpload}
                                                    accept=".pdf,.docx,.jpg,.jpeg,.png,.gif,.webp,.tiff"
                                                    // @ts-ignore
                                                    webkitdirectory=""
                                                    directory=""
                                                    multiple
                                                />
                                            </label>

                                            <label className="flex items-center justify-center gap-2 py-2.5 px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl cursor-pointer transition-all group">
                                                <Files className="w-4 h-4 text-gray-500 group-hover:scale-110 transition-transform" />
                                                <span className="text-xs font-bold text-gray-600">Arquivos Avulsos</span>
                                                <input
                                                    ref={filesInputRef}
                                                    type="file"
                                                    className="hidden"
                                                    onChange={handleFilesUpload}
                                                    accept=".pdf,.docx,.jpg,.jpeg,.png,.gif,.webp,.tiff"
                                                    multiple
                                                />
                                            </label>
                                        </div>

                                        <p className="text-[9px] text-gray-300 font-medium mt-3">
                                            PDF · DOCX · JPG · PNG · GIF · WebP · TIFF
                                        </p>
                                    </div>
                                </div>

                                {/* External link */}
                                {!showLinkInput ? (
                                    <button onClick={() => setShowLinkInput(true)}
                                        className="w-full text-center text-xs font-bold text-gray-400 hover:text-[#f58220] transition-colors flex items-center justify-center gap-1.5">
                                        <ExternalLink className="w-3 h-3" /> Importar via link (Drive/Dropbox)
                                    </button>
                                ) : (
                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                        className="flex gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <input type="text" placeholder="Cole a URL do documento..."
                                            value={externalLink} onChange={e => setExternalLink(e.target.value)}
                                            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#f58220]" />
                                        <button onClick={handleLinkAdd} className="bg-[#f58220] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-600 transition-colors">Adicionar</button>
                                        <button onClick={() => setShowLinkInput(false)} className="text-gray-400 hover:text-gray-600 text-xs px-1">×</button>
                                    </motion.div>
                                )}
                            </div>

                            {/* Urgency */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Prazo de Entrega</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['standard', 'urgent', 'flash'].map(id => (
                                        <button key={id} onClick={() => setUrgency(id)}
                                            className={`py-2 rounded-xl text-xs font-bold transition-all ${urgency === id ? 'bg-[#f58220] text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                            {id === 'standard' ? 'Standard' : id === 'urgent' ? 'Urgente' : 'Flash'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Client data */}
                            <div className="space-y-3 pt-4 border-t border-gray-50">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Dados do Cliente</label>
                                <div className="space-y-2">
                                    <input type="text" placeholder="Nome Completo" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full p-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#f58220]" />
                                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#f58220]" />
                                    <input type="tel" placeholder="Telefone" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#f58220]" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── RIGHT: Summary ────────────────────────────────────── */}
                <div className="space-y-6">
                    <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#f58220] opacity-10 rounded-full -mr-16 -mt-16 blur-3xl" />
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Resumo do Orçamento</h4>
                        <div className="space-y-4 mb-8">
                            <div className="flex justify-between text-sm"><span className="text-gray-400">Páginas incluídas:</span><span>{breakdown.totalCount}</span></div>
                            {breakdown.excludedPages > 0 && (
                                <div className="flex justify-between text-sm text-emerald-400"><span>Páginas otimizadas:</span><span>-{breakdown.excludedPages} pág.</span></div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Urgência:</span>
                                <span className={urgency !== 'standard' ? 'text-orange-400 font-bold' : ''}>
                                    {urgency === 'standard' ? 'Padrão (10d)' : urgency === 'urgent' ? 'Urgente (48h)' : 'Flash (24h)'}
                                </span>
                            </div>
                            {breakdown.notaryFee > 0 && (
                                <div className="flex justify-between text-sm text-green-400 font-medium"><span>Notarização:</span><span>+${breakdown.notaryFee.toFixed(2)}</span></div>
                            )}
                            <div className="h-px bg-white/10 my-2" />
                            {deepPending > 0 && !fastProgress && (
                                <div className="flex items-center gap-2 text-xs text-amber-400">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Refinando {deepPending} doc(s)... preço pode ajustar</span>
                                </div>
                            )}
                            {breakdown.totalSavings > 0 && (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                    <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-400" /><span className="text-xs font-bold text-emerald-400">Economia para o cliente</span></div>
                                    <span className="text-sm font-black text-emerald-400">-${breakdown.totalSavings.toFixed(2)}</span>
                                </motion.div>
                            )}
                            <div className="flex justify-between items-end">
                                <span className="text-gray-400 text-sm">Valor Final:</span>
                                <span className="text-4xl font-black text-[#f58220]">${totalPrice.toFixed(2)}</span>
                            </div>
                        </div>
                        {generatedLink ? (
                            <div className="space-y-4">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold">Link de Cobrança</p>
                                    <p className="text-xs truncate text-[#f58220] font-mono">{generatedLink}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success('Copiado!') }}
                                        className="flex-1 bg-white text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-all">
                                        <Copy className="w-4 h-4" /> Copiar Link
                                    </button>
                                    <a href={generatedLink} target="_blank" className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all">
                                        <ExternalLink className="w-5 h-5" />
                                    </a>
                                </div>
                                <button onClick={() => { setGeneratedLink(null); setDocuments([]); setFullName(''); setEmail(''); setPhone('') }}
                                    className="w-full text-center text-xs text-gray-500 hover:text-white transition-colors">Criar Outro</button>
                            </div>
                        ) : (
                            <button onClick={handleCreateConciergeOrder} disabled={loading || totalPrice === 0 || fastProgress !== null}
                                className="w-full bg-[#f58220] hover:bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                {loading ? <><div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> {uploadProgress}</> : <><Lock className="w-5 h-5" /> Gerar Link de Cobrança</>}
                            </button>
                        )}
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 flex gap-4">
                        <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-blue-900">Uso do Concierge</p>
                            <p className="text-xs text-blue-700 leading-relaxed mt-1">
                                O pedido será salvo com status <code className="bg-blue-100 px-1 rounded text-blue-800">PENDING_PAYMENT</code>.
                                O cliente verá uma tela de checkout personalizada ao abrir o link.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
