'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createOrder } from '@/app/actions/create-order'
import { getGlobalSettings, GlobalSettings } from '@/app/actions/settings'
import {
    ArrowRight, Upload, FileText, ShieldCheck, Trash2,
    ChevronDown, Lock, Globe, FilePlus, Copy, ExternalLink,
    Eye, EyeOff, Sparkles, Zap, FileImage, FileType,
    CheckCircle2, Loader2,
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type PageAnalysisWithInclusion = PageAnalysis & { included: boolean }

export type DocumentAnalysisExt = Omit<DocumentAnalysis, 'pages'> & {
    pages: PageAnalysisWithInclusion[];
    originalTotalPrice: number;
}

type AnalysisStatus = 'pending' | 'fast' | 'deep' | 'error'

type DocumentItem = {
    id:                  string;
    file?:               File;
    fileName:            string;
    count:               number;
    notarized:           boolean;
    analysis?:           DocumentAnalysisExt;
    analysisStatus:      AnalysisStatus;
    isSelected:          boolean;
    handwritten?:        boolean;
    externalLink?:       string;
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

// ─── Progress bar component ───────────────────────────────────────────────────

function AnalysisProgress({
    completed, total, label
}: { completed: number; total: number; label: string }) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4 space-y-2"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                    <span className="text-sm font-bold text-orange-700">{label}</span>
                </div>
                <span className="text-sm font-black text-orange-600">{completed}/{total}</span>
            </div>
            <div className="h-2 bg-orange-100 rounded-full overflow-hidden">
                <motion.div
                    className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ ease: 'easeOut', duration: 0.3 }}
                />
            </div>
            <p className="text-[10px] text-orange-500 font-medium">
                Você pode continuar preenchendo os dados enquanto analisamos
            </p>
        </motion.div>
    )
}

// ─── Document status icon ──────────────────────────────────────────────────────

function StatusIcon({ status, fileType }: { status: AnalysisStatus; fileType?: string }) {
    if (status === 'deep')  return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    if (status === 'fast')  return <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
    if (status === 'error') return <span className="text-red-400 text-xs font-bold">!</span>
    return <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
}

function FileTypeIcon({ fileName }: { fileName: string }) {
    if (/\.docx$/i.test(fileName)) return <FileType className="w-5 h-5" />
    if (/\.(jpe?g|png|gif|webp|tiff?)$/i.test(fileName)) return <FileImage className="w-5 h-5" />
    return <FileText className="w-5 h-5" />
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConciergePage() {
    const [serviceType, setServiceType] = useState<'translation' | 'notarization' | null>(null)
    const [documents,   setDocuments]   = useState<DocumentItem[]>([])
    const [urgency,     setUrgency]     = useState('standard')
    const [paymentPlan, setPaymentPlan] = useState<'upfront_discount' | 'upfront' | 'split'>('upfront')
    const [totalPrice,  setTotalPrice]  = useState(0)

    const [fullName, setFullName] = useState('')
    const [email,    setEmail]    = useState('')
    const [phone,    setPhone]    = useState('')

    const [loading,        setLoading]        = useState(false)
    const [uploadProgress, setUploadProgress] = useState<string | null>(null)
    const [generatedLink,  setGeneratedLink]  = useState<string | null>(null)
    const [showLinkInput,  setShowLinkInput]  = useState(false)
    const [externalLink,   setExternalLink]   = useState('')
    const [expandedDocs,   setExpandedDocs]   = useState<string[]>([])

    // Deep analysis progress
    const [deepProgress, setDeepProgress] = useState<{ completed: number; total: number } | null>(null)

    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null)
    const { toast } = useUIFeedback()

    // Ref to track in-flight deep analysis so we can cancel on unmount
    const deepCancelRef = useRef(false)

    useEffect(() => {
        getGlobalSettings().then(setGlobalSettings)
        return () => { deepCancelRef.current = true }
    }, [])

    const BASE        = globalSettings?.basePrice || 9.00
    const NOTARY_FEE  = globalSettings?.notaryFee || 25.00
    const URGENCY_MUL: Record<string, number> = {
        standard: 1.0,
        urgent:   1.0 + (globalSettings?.urgencyRate || 0.3),
        flash:    1.0 + (globalSettings?.urgencyRate ? globalSettings.urgencyRate * 2 : 0.6),
    }

    // ── File upload: fast pass first, then deep in background ─────────────────
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return

        const allFiles  = Array.from(e.target.files)
        const supported = allFiles.filter(isSupportedFile)
        const skipped   = allFiles.length - supported.length

        if (supported.length === 0) {
            toast.error('Nenhum arquivo suportado encontrado. (PDF, DOCX, imagens)')
            return
        }
        if (skipped > 0) {
            toast.info(`${skipped} arquivo(s) ignorado(s) — formato não suportado.`)
        }

        // ── PHASE 1: Fast pass — show all docs immediately ──────────────────
        toast.success(`Carregando ${supported.length} arquivo(s)...`)

        const newDocIds: string[] = []
        const newDocs: DocumentItem[] = []

        for (const file of supported) {
            const id = crypto.randomUUID()
            newDocIds.push(id)
            newDocs.push({
                id,
                file,
                fileName:       file.name,
                count:          1,
                notarized:      serviceType === 'notarization',
                analysis:       undefined,
                analysisStatus: 'pending',
                isSelected:     true,
                handwritten:    false,
            })
        }

        setDocuments(prev => [...prev, ...newDocs])

        // Run fast pass for each file and update immediately as they finish
        const fastPassQueue = supported.map((file, i) => ({ file, id: newDocIds[i] }))

        await Promise.all(fastPassQueue.map(async ({ file, id }) => {
            try {
                const raw      = await fastPassAnalysis(file, BASE)
                const analysis = toExt(raw)
                setDocuments(prev => prev.map(d =>
                    d.id === id
                        ? { ...d, count: analysis.totalPages, analysis, analysisStatus: 'fast' }
                        : d
                ))
            } catch {
                setDocuments(prev => prev.map(d =>
                    d.id === id ? { ...d, analysisStatus: 'error' } : d
                ))
            }
        }))

        // ── PHASE 2: Deep analysis in background, 5 concurrent ──────────────
        // Only PDFs need the deep pass (images and docx are already deep)
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

                const analysisExt = toExt(analysis)
                setDocuments(prev => prev.map(d =>
                    d.id === id
                        ? { ...d, count: analysisExt.totalPages, analysis: analysisExt, analysisStatus: 'deep' }
                        : d
                ))
                setDeepProgress({ completed, total })
            }
        )

        setDeepProgress(null)
        toast.success(`Análise completa — ${needsDeep.length} PDF(s) processado(s).`)
    }

    const handleLinkAdd = () => {
        if (!externalLink) return
        let name = 'Documento via Link'
        try {
            const url = new URL(externalLink)
            name = url.pathname.split('/').pop() || url.hostname + '...'
            if (name.length < 5) name = url.hostname + '...'
        } catch { }

        setDocuments(prev => [...prev, {
            id:             crypto.randomUUID(),
            fileName:       name,
            count:          1,
            notarized:      serviceType === 'notarization',
            isSelected:     true,
            handwritten:    false,
            externalLink,
            analysisStatus: 'deep', // links don't need analysis
        }])
        setExternalLink('')
        setShowLinkInput(false)
        toast.success('Link adicionado à esteira.')
    }

    const removeDocument = (id: string) => setDocuments(prev => prev.filter(d => d.id !== id))

    // ── Density override ──────────────────────────────────────────────────────
    const updatePageDensity = (docId: string, pageIdx: number, newDensity: PageAnalysis['density']) => {
        setDocuments(prev => prev.map(doc => {
            if (doc.id !== docId || !doc.analysis) return doc
            const fractions: Record<string, number> = { blank: 0, low: 0.25, medium: 0.5, high: 1.0, scanned: 1.0 }
            const fraction = fractions[newDensity] ?? 1.0
            const newPages = doc.analysis.pages.map((p, i) =>
                i !== pageIdx ? p : { ...p, density: newDensity, fraction, price: BASE * fraction }
            )
            const totalPrice = recalcPrice(newPages)
            const originalTotalPrice = newPages.reduce((s, p) => s + p.price, 0)
            return { ...doc, analysis: { ...doc.analysis, pages: newPages, totalPrice, originalTotalPrice } }
        }))
    }

    // ── Page inclusion toggle ─────────────────────────────────────────────────
    const togglePageInclusion = (docId: string, pageIdx: number) => {
        setDocuments(prev => prev.map(doc => {
            if (doc.id !== docId || !doc.analysis) return doc
            const newPages    = doc.analysis.pages.map((p, i) => i === pageIdx ? { ...p, included: !p.included } : p)
            const totalPrice  = recalcPrice(newPages)
            const count       = newPages.filter(p => p.included).length || 1
            return { ...doc, count, analysis: { ...doc.analysis, pages: newPages, totalPrice } }
        }))
    }

    const setAllPagesInclusion = (docId: string, included: boolean) => {
        setDocuments(prev => prev.map(doc => {
            if (doc.id !== docId || !doc.analysis) return doc
            const newPages   = doc.analysis.pages.map(p => ({ ...p, included }))
            const totalPrice = recalcPrice(newPages)
            return { ...doc, count: included ? newPages.length : 0, analysis: { ...doc.analysis, pages: newPages, totalPrice } }
        }))
    }

    const toggleDocExpand = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation()
        setExpandedDocs(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
    }

    // ── Price calculation ─────────────────────────────────────────────────────
    const [breakdown, setBreakdown] = useState({
        basePrice: 0, urgencyFee: 0, notaryFee: 0,
        totalDocs: 0, totalCount: 0,
        minOrderApplied: false, totalMinimumAdjustment: 0,
        totalDiscountApplied: 0, totalSavings: 0, excludedPages: 0,
    })

    useEffect(() => {
        const sel = documents.filter(d => d.isSelected)
        let base  = 0, totalPages = 0, notary = 0, original = 0, excluded = 0

        if (serviceType === 'translation') {
            sel.forEach(doc => {
                if (doc.analysis) {
                    const inc = doc.analysis.pages.filter(p => p.included)
                    const exc = doc.analysis.pages.filter(p => !p.included)
                    let price = inc.reduce((s, p) => s + p.price, 0)
                    let orig  = doc.analysis.pages.reduce((s, p) => s + p.price, 0)
                    if (doc.handwritten) { price *= 1.25; orig *= 1.25 }
                    base     += price
                    original += orig
                    totalPages += inc.length
                    excluded   += exc.length
                } else {
                    const p = (doc.count || 1) * BASE
                    base += p; original += p; totalPages += doc.count || 1
                }
                notary += doc.notarized ? NOTARY_FEE : 0
            })
        } else if (serviceType === 'notarization') {
            notary     = sel.length * NOTARY_FEE
            totalPages = sel.length
        }

        const baseWithUrgency  = base * (URGENCY_MUL[urgency] ?? 1.0)
        const urgencyPart      = baseWithUrgency - base
        let total              = baseWithUrgency + notary
        let discountApplied    = 0

        if (urgency === 'standard' && paymentPlan === 'upfront_discount') {
            discountApplied = total * 0.05
            total *= 0.95
        }

        setBreakdown({
            basePrice: base, urgencyFee: urgencyPart, notaryFee: notary,
            totalDocs: sel.length, totalCount: totalPages,
            minOrderApplied: false, totalMinimumAdjustment: 0,
            totalDiscountApplied: discountApplied,
            totalSavings: original - base,
            excludedPages: excluded,
        })
        setTotalPrice(total)
    }, [documents, urgency, paymentPlan, serviceType, globalSettings])

    // ── Order creation ────────────────────────────────────────────────────────
    const handleCreateConciergeOrder = async () => {
        if (!fullName || !email || !phone) { toast.error('Preencha os dados do cliente.'); return }
        if (documents.length === 0)        { toast.error('Adicione pelo menos um documento.'); return }

        setLoading(true)
        setUploadProgress('Enviando arquivos...')

        try {
            const uploadedDocs = []
            for (let i = 0; i < documents.length; i++) {
                const doc = documents[i]
                if (doc.file) {
                    const form = new FormData()
                    form.append('file', doc.file)
                    const res = await fetch('/api/upload', { method: 'POST', body: form })
                    if (res.ok) {
                        const data = await res.json()
                        uploadedDocs.push({ docIndex: i, ...data })
                    }
                }
            }

            setUploadProgress('Gerando link...')

            const orderDocuments = documents.map((d, idx) => {
                const up = uploadedDocs.find(u => u.docIndex === idx)
                const uploadedFile = up
                    ? { url: up.url, fileName: up.fileName, contentType: up.contentType }
                    : d.externalLink
                        ? { url: d.externalLink, fileName: d.fileName, contentType: 'link/external' }
                        : undefined

                return {
                    id: d.id, type: d.externalLink ? 'External Link' : 'Uploaded File',
                    fileName: d.fileName, count: d.count, notarized: d.notarized,
                    analysis: d.analysis, handwritten: d.handwritten, uploadedFile,
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
                const link = `${window.location.origin}/pay/${result.orderId}`
                setGeneratedLink(link)
                toast.success('Link de cobrança gerado!')
            } else {
                toast.error('Erro ao criar pedido.')
            }
        } catch (err) {
            console.error(err)
            toast.error('Ocorreu um erro inesperado.')
        } finally {
            setLoading(false)
            setUploadProgress(null)
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    const deepPending = documents.filter(d => d.analysisStatus === 'fast').length
    const fastDone    = documents.filter(d => d.analysisStatus === 'deep').length

    return (
        <div className="max-w-4xl mx-auto py-8">
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

                {/* ── LEFT ─────────────────────────────────────────────── */}
                <div className="space-y-4">
                    {!serviceType ? (
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-6">
                            <h3 className="text-xl font-bold">Selecione o Serviço</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <button onClick={() => setServiceType('translation')}
                                    className="flex items-start gap-4 p-6 rounded-2xl border-2 border-gray-100 hover:border-[#f58220] hover:bg-orange-50 transition-all text-left group">
                                    <div className="bg-orange-100 p-3 rounded-xl text-orange-600 group-hover:scale-110 transition-transform"><Globe className="w-6 h-6" /></div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">Tradução + Certificação</h4>
                                        <p className="text-xs text-gray-500 mt-1">Fluxo completo para USCIS.</p>
                                    </div>
                                </button>
                                <button onClick={() => setServiceType('notarization')}
                                    className="flex items-start gap-4 p-6 rounded-2xl border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group">
                                    <div className="bg-blue-100 p-3 rounded-xl text-blue-600 group-hover:scale-110 transition-transform"><ShieldCheck className="w-6 h-6" /></div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">Apenas Notarização</h4>
                                        <p className="text-xs text-gray-500 mt-1">Tradução já existe.</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
                            <div className="flex justify-between items-center pb-4 border-b border-gray-50">
                                <button onClick={() => setServiceType(null)} className="text-xs font-bold text-gray-400 hover:text-[#f58220] flex items-center gap-1">
                                    <ArrowRight className="w-3 h-3 rotate-180" /> Trocar Serviço
                                </button>
                                <h3 className="font-bold text-gray-900">
                                    {serviceType === 'translation' ? 'Editor de Tradução' : 'Editor de Notarização'}
                                </h3>
                            </div>

                            {/* Deep analysis progress bar */}
                            <AnimatePresence>
                                {deepProgress && deepProgress.completed < deepProgress.total && (
                                    <AnalysisProgress
                                        completed={deepProgress.completed}
                                        total={deepProgress.total}
                                        label={`Refinando análise de densidade...`}
                                    />
                                )}
                            </AnimatePresence>

                            {/* Document list */}
                            <div className="space-y-3">
                                <AnimatePresence initial={false}>
                                    {documents.map(doc => {
                                        const isLink = !!doc.externalLink
                                        const status = doc.analysisStatus
                                        const isFastOnly = status === 'fast'

                                        // Price and density summary
                                        let docPrice = 0
                                        let densityLabel = 'N/A'
                                        let densityColor = 'bg-slate-200 text-slate-500'

                                        if (doc.analysis) {
                                            const inc  = doc.analysis.pages.filter(p => p.included)
                                            docPrice   = recalcPrice(inc.length > 0 ? inc : doc.analysis.pages)
                                            const avg  = inc.length > 0
                                                ? inc.reduce((s, p) => s + p.fraction, 0) / inc.length
                                                : 0
                                            const pct  = Math.round(avg * 100)
                                            if (pct === 0)       { densityLabel = 'Em Branco'; densityColor = 'bg-gray-100 text-gray-400' }
                                            else if (pct < 40)   { densityLabel = 'Baixa';     densityColor = 'bg-green-100 text-green-700' }
                                            else if (pct < 70)   { densityLabel = 'Média';     densityColor = 'bg-yellow-100 text-yellow-700' }
                                            else                 { densityLabel = 'Alta';      densityColor = 'bg-red-100 text-red-700' }
                                        } else {
                                            docPrice = (doc.count || 1) * BASE
                                        }
                                        if (doc.handwritten) docPrice *= 1.25

                                        const includedCount = doc.analysis?.pages.filter(p => p.included).length ?? doc.count
                                        const totalCount    = doc.analysis?.pages.length ?? doc.count
                                        const excludedCount = doc.analysis?.pages.filter(p => !p.included).length ?? 0
                                        const docSavings    = (doc.analysis?.originalTotalPrice ?? docPrice) - (doc.analysis?.totalPrice ?? docPrice)

                                        return (
                                            <motion.div
                                                key={doc.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all
                                                    ${isFastOnly ? 'border-amber-200' : 'border-gray-100 hover:border-[#f58220]/30'}`}
                                            >
                                                {/* Card header */}
                                                <div className="p-4 flex justify-between items-center bg-gray-50/50">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="p-2 bg-white rounded-lg text-[#f58220] border border-gray-100 shrink-0">
                                                            <FileTypeIcon fileName={doc.fileName} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <StatusIcon status={status} />
                                                                <p className="text-sm font-bold text-gray-800 truncate">{doc.fileName}</p>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                                <span className="text-[10px] text-gray-400 font-bold uppercase">
                                                                    {doc.analysis
                                                                        ? `${includedCount}/${totalCount} págs.`
                                                                        : `${doc.count} pág.`}
                                                                </span>
                                                                {isFastOnly && (
                                                                    <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                                                                        ⚡ Estimativa
                                                                    </span>
                                                                )}
                                                                {status === 'deep' && doc.analysis && serviceType === 'translation' && (
                                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${densityColor} uppercase`}>
                                                                        {densityLabel}
                                                                    </span>
                                                                )}
                                                                {doc.analysis?.pages.some(p => p.density === 'scanned') && (
                                                                    <span className="text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 animate-pulse">
                                                                        🔴 SCAN
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 shrink-0 ml-2">
                                                        {serviceType === 'translation' && (
                                                            <div className="text-right">
                                                                <span className="text-sm font-black text-gray-900 block">${docPrice.toFixed(2)}</span>
                                                                {docSavings > 0 && (
                                                                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                                                                        -{excludedCount} pág. excluída
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        <button onClick={() => removeDocument(doc.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* X-Ray accordion — only available after deep analysis */}
                                                {serviceType === 'translation' && doc.analysis && !isLink && (
                                                    <div className="px-4 pb-4 bg-white">
                                                        <div className="h-px bg-gray-100 -mx-4 mb-3" />

                                                        <div className="flex items-center justify-between mb-3">
                                                            <button
                                                                onClick={(e) => toggleDocExpand(doc.id, e)}
                                                                className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-[#f58220] transition-colors"
                                                            >
                                                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedDocs.includes(doc.id) ? 'rotate-180' : ''}`} />
                                                                {isFastOnly ? 'Aguardando análise completa...' : 'Auditoria página a página'}
                                                            </button>

                                                            {expandedDocs.includes(doc.id) && status === 'deep' && (
                                                                <div className="flex items-center gap-2">
                                                                    <button onClick={() => setAllPagesInclusion(doc.id, true)}
                                                                        className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors">
                                                                        Incluir todas
                                                                    </button>
                                                                    <button onClick={() => setAllPagesInclusion(doc.id, false)}
                                                                        className="text-[9px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full hover:bg-gray-200 transition-colors">
                                                                        Excluir todas
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Page rows */}
                                                        <AnimatePresence>
                                                            {expandedDocs.includes(doc.id) && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: 'auto', opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    className="space-y-1.5 border-l-2 border-slate-50 pl-3 overflow-hidden"
                                                                >
                                                                    {isFastOnly ? (
                                                                        <div className="py-4 text-center text-xs text-amber-500 font-medium">
                                                                            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                                                                            Análise de densidade em andamento...
                                                                        </div>
                                                                    ) : (
                                                                        doc.analysis.pages.map((p, pIdx) => {
                                                                            const isIncluded = p.included
                                                                            let pColor = 'bg-gray-100 text-gray-500'
                                                                            let pLabel = '⚪ Vazio'
                                                                            if (p.density === 'high')    { pColor = 'bg-red-50 text-red-700 border border-red-100';       pLabel = '🔴 Alta' }
                                                                            else if (p.density === 'medium')  { pColor = 'bg-yellow-50 text-yellow-700 border border-yellow-100'; pLabel = '🟡 Média' }
                                                                            else if (p.density === 'low')     { pColor = 'bg-green-50 text-green-700 border border-green-100';   pLabel = '🟢 Baixa' }
                                                                            else if (p.density === 'scanned') { pColor = 'bg-red-50 text-red-700 border border-red-100';       pLabel = '🔴 Scan' }

                                                                            return (
                                                                                <div key={pIdx}
                                                                                    className={`flex items-center justify-between text-[10px] py-1.5 px-3 rounded-xl border transition-all
                                                                                        ${isIncluded ? 'bg-slate-50/50 border-slate-100' : 'bg-gray-50 border-dashed border-gray-200 opacity-60'}`}
                                                                                >
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="text-gray-400 font-bold w-7">Pg {p.pageNumber}:</span>
                                                                                        <div className="flex items-center gap-0.5 bg-white border border-slate-200 p-0.5 rounded-lg">
                                                                                            {(['blank', 'low', 'medium', 'high'] as const).map(dType => (
                                                                                                <button key={dType}
                                                                                                    onClick={() => updatePageDensity(doc.id, pIdx, dType)}
                                                                                                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition-all
                                                                                                        ${p.density === dType
                                                                                                            ? dType === 'blank' ? 'bg-gray-200 text-gray-700'
                                                                                                                : dType === 'low' ? 'bg-green-500 text-white'
                                                                                                                    : dType === 'medium' ? 'bg-yellow-500 text-white'
                                                                                                                        : 'bg-red-500 text-white'
                                                                                                            : 'text-slate-400 hover:bg-slate-50'
                                                                                                        }`}
                                                                                                >
                                                                                                    {dType === 'blank' ? '0%' : dType === 'low' ? '25%' : dType === 'medium' ? '50%' : '100%'}
                                                                                                </button>
                                                                                            ))}
                                                                                        </div>
                                                                                        <span className={`font-black px-1.5 py-0.5 rounded text-[8px] uppercase ${pColor}`}>{pLabel}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-3">
                                                                                        <span className="text-gray-500">{p.wordCount} pal.</span>
                                                                                        <span className={`font-black ${isIncluded ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                                                                                            ${p.price.toFixed(2)}
                                                                                        </span>
                                                                                        {/* Inclusion toggle */}
                                                                                        <button
                                                                                            onClick={() => togglePageInclusion(doc.id, pIdx)}
                                                                                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold transition-all
                                                                                                ${isIncluded
                                                                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                                                                                                    : 'bg-gray-100 text-gray-400 border border-dashed border-gray-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                                                                                                }`}
                                                                                        >
                                                                                            {isIncluded
                                                                                                ? <><Eye className="w-2.5 h-2.5" /> Incluída</>
                                                                                                : <><EyeOff className="w-2.5 h-2.5" /> Excluída</>
                                                                                            }
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            )
                                                                        })
                                                                    )}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )
                                    })}
                                </AnimatePresence>

                                {/* Upload zone */}
                                <label className={`flex items-center justify-center gap-2 p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all group
                                    ${deepProgress ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 hover:border-[#f58220] hover:bg-orange-50'}`}>
                                    <Upload className={`w-5 h-5 ${deepProgress ? 'text-amber-400' : 'text-gray-400 group-hover:text-[#f58220]'}`} />
                                    <div className="text-center">
                                        <span className={`block text-sm font-bold ${deepProgress ? 'text-amber-500' : 'text-gray-500 group-hover:text-[#f58220]'}`}>
                                            Arraste Arquivos ou Pastas
                                        </span>
                                        <span className="block text-[10px] text-gray-400 font-medium">
                                            PDF · DOCX · JPG · PNG — pastas inteiras suportadas
                                        </span>
                                    </div>
                                    <input type="file" multiple className="hidden" onChange={handleFileUpload}
                                        accept=".pdf,.docx,.jpg,.jpeg,.png,.gif,.webp,.tiff"
                                        {...({ webkitdirectory: '', directory: '' } as any)} />
                                </label>

                                {!showLinkInput ? (
                                    <button onClick={() => setShowLinkInput(true)}
                                        className="w-full text-center text-xs font-bold text-gray-400 hover:text-[#f58220] transition-colors flex items-center justify-center gap-1.5">
                                        <ExternalLink className="w-3 h-3" /> Ou importar via link (Drive/Dropbox)
                                    </button>
                                ) : (
                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                        className="flex gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <input type="text" placeholder="Cole a URL do documento..."
                                            value={externalLink} onChange={e => setExternalLink(e.target.value)}
                                            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#f58220]" />
                                        <button onClick={handleLinkAdd} className="bg-[#f58220] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-600 transition-colors">Adicionar</button>
                                        <button onClick={() => setShowLinkInput(false)} className="text-gray-400 hover:text-gray-600 text-xs px-1">Cancelar</button>
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

                {/* ── RIGHT: Summary ─────────────────────────────────────── */}
                <div className="space-y-6">
                    <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#f58220] opacity-10 rounded-full -mr-16 -mt-16 blur-3xl" />

                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Resumo do Orçamento</h4>

                        <div className="space-y-4 mb-8">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Páginas incluídas:</span>
                                <span>{breakdown.totalCount}</span>
                            </div>
                            {breakdown.excludedPages > 0 && (
                                <div className="flex justify-between text-sm text-emerald-400">
                                    <span>Páginas otimizadas:</span>
                                    <span>-{breakdown.excludedPages} pág.</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Urgência:</span>
                                <span className={urgency !== 'standard' ? 'text-orange-400 font-bold' : ''}>
                                    {urgency === 'standard' ? 'Padrão (10d)' : urgency === 'urgent' ? 'Urgente (48h)' : 'Flash (24h)'}
                                </span>
                            </div>
                            {breakdown.notaryFee > 0 && (
                                <div className="flex justify-between text-sm text-green-400 font-medium">
                                    <span>Notarização:</span>
                                    <span>+${breakdown.notaryFee.toFixed(2)}</span>
                                </div>
                            )}

                            <div className="h-px bg-white/10 my-2" />

                            {/* Deep analysis still running */}
                            {deepPending > 0 && (
                                <div className="flex items-center gap-2 text-xs text-amber-400">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Refinando {deepPending} documento(s)... preço pode atualizar</span>
                                </div>
                            )}

                            {/* Savings highlight */}
                            {breakdown.totalSavings > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl"
                                >
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-emerald-400" />
                                        <span className="text-xs font-bold text-emerald-400">Economia para o cliente</span>
                                    </div>
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
                                    <button onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success('Link copiado!') }}
                                        className="flex-1 bg-white text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-all">
                                        <Copy className="w-4 h-4" /> Copiar Link
                                    </button>
                                    <a href={generatedLink} target="_blank"
                                        className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all">
                                        <ExternalLink className="w-5 h-5" />
                                    </a>
                                </div>
                                <button onClick={() => { setGeneratedLink(null); setDocuments([]); setFullName(''); setEmail(''); setPhone('') }}
                                    className="w-full text-center text-xs text-gray-500 hover:text-white transition-colors">
                                    Criar Outro
                                </button>
                            </div>
                        ) : (
                            <button onClick={handleCreateConciergeOrder}
                                disabled={loading || totalPrice === 0}
                                className="w-full bg-[#f58220] hover:bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                {loading
                                    ? <><div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> {uploadProgress}</>
                                    : <><Lock className="w-5 h-5" /> Gerar Link de Cobrança</>
                                }
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
