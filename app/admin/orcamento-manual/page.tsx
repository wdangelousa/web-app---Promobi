'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createOrder } from '../../actions/create-order'
import { getGlobalSettings, GlobalSettings } from '../../actions/settings'
import {
    ArrowRight,
    Globe,
    ShieldCheck,
    Trash2,
    Check,
    FileText,
    ChevronDown,
    Plus,
    Upload,
    Link as LinkIcon,
    Copy,
    CheckCircle,
    EyeOff,
    Eye,
    X,
    RotateCcw,
    Search
} from 'lucide-react'
import BudgetSummaryCard from '../../../components/Budget/BudgetSummaryCard'
import { useUIFeedback } from '../../../components/UIFeedbackProvider'
import { analyzeDocument, DocumentAnalysis } from '../../../lib/documentAnalyzer'
import { PDFDocument } from 'pdf-lib'
import { searchCustomers, CustomerSearchResult } from '../../actions/search-customers'
import { getOrderForConcierge } from '../../actions/adminOrders'
import { updateOrder } from '../../actions/create-order'

// --- TYPES ---
type PageWithInclusion = {
    pageNumber: number
    wordCount: number
    density: 'high' | 'medium' | 'low' | 'blank' | 'scanned'
    fraction: number
    price: number
    included: boolean
}

type DocumentAnalysisExt = Omit<DocumentAnalysis, 'pages'> & {
    pages: PageWithInclusion[]
}

type DocumentItem = {
    id: string;
    file?: File;
    fileName: string;
    count: number;
    notarized: boolean;
    analysis?: DocumentAnalysisExt;
    isSelected: boolean;
    handwritten?: boolean;
    fileTranslated?: File;
    fileNameTranslated?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Converts raw analysis pages → pages with inclusion flag
function withInclusion(pages: DocumentAnalysis['pages']): PageWithInclusion[] {
    return pages.map(p => ({ ...p, included: (p as any).included ?? true }))
}

function calcDocPrice(pages: PageWithInclusion[]): number {
    return pages.filter(p => p.included).reduce((s, p) => s + p.price, 0)
}

export default function OrcamentoManual() {
    const searchParams = useSearchParams()
    const orderIdParam = searchParams.get('orderId')
    const orderId = orderIdParam ? parseInt(orderIdParam) : null

    // --- STATE ---
    const [serviceType, setServiceType] = useState<'translation' | 'notarization' | null>(null)
    const [documents, setDocuments] = useState<DocumentItem[]>([])
    const [urgency, setUrgency] = useState('standard')
    const [totalPrice, setTotalPrice] = useState(0)

    const [clientName, setClientName] = useState('')
    const [clientEmail, setClientEmail] = useState('')
    const [clientPhone, setClientPhone] = useState('')

    // --- SMART SEARCH STATE ---
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)

    const [loading, setLoading] = useState(false)
    const [isHydrating, setIsHydrating] = useState(!!orderIdParam)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [uploadProgress, setUploadProgress] = useState<string | null>(null)
    const [generatedLink, setGeneratedLink] = useState<string | null>(null)
    const [importUrl, setImportUrl] = useState('')
    const [showImportUrl, setShowImportUrl] = useState(false)

    // Quicklook: stores a blob URL of a single extracted page
    const [quicklookData, setQuicklookData] = useState<{ url: string; pageNumber: number; isBlob: boolean } | null>(null)

    const [breakdown, setBreakdown] = useState({
        basePrice: 0, urgencyFee: 0, notaryFee: 0,
        totalDocs: 0, totalCount: 0,
        minOrderApplied: false, totalMinimumAdjustment: 0, totalDiscountApplied: 0,
        volumeDiscountPercentage: 0, volumeDiscountAmount: 0
    })

    const [expandedDocs, setExpandedDocs] = useState<string[]>([])
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null)

    const { confirm, toast } = useUIFeedback()

    useEffect(() => {
        getGlobalSettings().then(setGlobalSettings)
    }, [])

    // --- HYDRATION EFFECT ---
    useEffect(() => {
        if (!orderId) return

        const hydrate = async () => {
            setIsHydrating(true)
            try {
                const res = await getOrderForConcierge(orderId)
                if (res.success && res.order) {
                    const order = res.order

                    // 1. Map Client Info (From Prisma 'user' relation)
                    setClientName(order.user?.fullName || '')
                    setClientEmail(order.user?.email || '')
                    setClientPhone(order.user?.phone || '')
                    setUrgency(order.urgency || 'standard')

                    // 2. Map Service Type
                    setServiceType(order.serviceType || (order.hasTranslation ? 'translation' : 'notarization'))

                    // 3. Map Documents (From Prisma 'documents' relation)
                    if (order.documents && Array.isArray(order.documents)) {
                        const mappedDocs = order.documents.map((doc: any) => {
                            // Handle analysis parsing if it was saved as JSON
                            let parsedAnalysis = undefined;
                            try {
                                if (doc.analysis) {
                                    parsedAnalysis = typeof doc.analysis === 'string' ? JSON.parse(doc.analysis) : doc.analysis;
                                }
                            } catch (e) { console.error('Error parsing doc analysis', e) }

                            return {
                                id: doc.id.toString(), // Ensure string ID for UI state
                                fileName: doc.fileName || doc.name || 'Documento Restaurado',
                                count: doc.count || doc.pages || 1,
                                notarized: doc.notarized || false,
                                handwritten: doc.handwritten || false,
                                isSelected: true,
                                analysis: parsedAnalysis
                            }
                        })
                        setDocuments(mappedDocs)
                    }
                }
            } catch (err) {
                console.error('Hydration error:', err)
                toast.error('Erro ao carregar dados do pedido.')
            } finally {
                setIsHydrating(false) // Unblock the UI
            }
        }

        hydrate()
    }, [orderId])

    // --- DEBOUNCED SEARCH EFFECT ---
    useEffect(() => {
        const fetchCustomers = async () => {
            if (searchQuery.length >= 3) {
                setIsSearching(true)
                try {
                    const results = await searchCustomers(searchQuery)
                    setSearchResults(results)
                    setShowDropdown(true)
                } catch (err) {
                    console.error('Error searching customers', err)
                } finally {
                    setIsSearching(false)
                }
            } else {
                setSearchResults([])
                setShowDropdown(false)
            }
        }

        const timer = setTimeout(() => {
            fetchCustomers()
        }, 300)

        return () => clearTimeout(timer)
    }, [searchQuery])

    const handleSelectCustomer = (customer: CustomerSearchResult) => {
        setClientName(customer.fullName)
        setClientEmail(customer.email)
        if (customer.phone) setClientPhone(customer.phone)
        setShowDropdown(false)
        setSearchQuery('')
    }

    const NOTARY_FEE_PER_DOC = globalSettings?.notaryFee || 25.00
    const URGENCY_MULTIPLIER: Record<string, number> = {
        standard: 1.0,
        urgent: 1.0 + (globalSettings?.urgencyRate || 0.3),
        flash: 1.0 + (globalSettings?.urgencyRate ? globalSettings.urgencyRate * 2 : 0.6),
    }

    // --- HANDLERS ---
    const handleServiceSelection = (type: 'translation' | 'notarization') => {
        setServiceType(type)
        setDocuments([])
        setUrgency('normal')
        setExpandedDocs([])
    }

    const toggleDocExpand = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation()
        setExpandedDocs(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
    }

    const resetServiceSelection = () => {
        if (documents.length > 0) {
            confirm({
                title: 'Alterar Serviço',
                message: 'Isso limpará seu orçamento atual. Deseja continuar?',
                confirmText: 'Sim, alterar',
                danger: true,
                onConfirm: () => { setServiceType(null); setDocuments([]); setUrgency('normal') }
            })
            return
        }
        setServiceType(null); setDocuments([]); setUrgency('normal')
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return

        if (serviceType === 'translation') {
            setIsAnalyzing(true)
            const newDocs: DocumentItem[] = []

            for (const file of Array.from(e.target.files)) {
                try {
                    const raw = await analyzeDocument(file)
                    newDocs.push({
                        id: crypto.randomUUID(),
                        file,
                        fileName: (file.webkitRelativePath || file.name).split(/[/\\]/).pop() || file.name,
                        count: raw.totalPages,
                        notarized: false,
                        analysis: { ...raw, pages: withInclusion(raw.pages) },
                        isSelected: true,
                        handwritten: false
                    })
                } catch {
                    newDocs.push({
                        id: crypto.randomUUID(),
                        file,
                        fileName: (file.webkitRelativePath || file.name).split(/[/\\]/).pop() || file.name,
                        count: 1,
                        notarized: false,
                        isSelected: true,
                        handwritten: false
                    })
                }
            }
            setDocuments(prev => [...prev, ...newDocs])
            setIsAnalyzing(false)
            toast.success(`${newDocs.length} documentos adicionados ao orçamento.`)
        } else if (serviceType === 'notarization') {
            const newDocs: DocumentItem[] = Array.from(e.target.files).map(file => ({
                id: crypto.randomUUID(),
                file,
                fileName: (file.webkitRelativePath || file.name).split(/[/\\]/).pop() || file.name,
                count: 1,
                notarized: true,
                isSelected: true,
            } as DocumentItem))
            setDocuments(prev => [...prev, ...newDocs])
            toast.success(`${newDocs.length} documentos adicionados com sucesso!`)
        }
        e.target.value = ''
    }

    const handleImportUrl = () => {
        if (!importUrl) return
        try {
            new URL(importUrl)
            const newDoc: DocumentItem = {
                id: crypto.randomUUID(),
                fileName: `Link: ${importUrl.substring(0, 30)}...`,
                count: 1, notarized: false, isSelected: true, handwritten: false,
            }
            if (serviceType === 'translation') {
                const base = globalSettings?.basePrice || 9.00
                newDoc.analysis = {
                    totalPages: 1, totalPrice: base, originalTotalPrice: base,
                    pages: [{ pageNumber: 1, wordCount: 0, density: 'blank', fraction: 0, price: base, included: true }],
                    isImage: false, phase: 'deep', fileType: 'unknown'
                }
            }
            setDocuments(prev => [...prev, newDoc])
            setImportUrl(''); setShowImportUrl(false)
            toast.success('Link importado e adicionado à lista.')
        } catch { toast.error('Por favor, insira uma URL válida.') }
    }

    const removeDocument = (id: string) => setDocuments(prev => prev.filter(d => d.id !== id))

    const updateDocument = (id: string, field: keyof DocumentItem, value: any) => {
        setDocuments(documents.map(d => d.id === id ? { ...d, [field]: value } : d))
    }

    const updatePageDensity = (docId: string, pageIdx: number, newDensity: 'high' | 'medium' | 'low' | 'blank' | 'scanned') => {
        setDocuments(prev => prev.map(doc => {
            if (doc.id !== docId || !doc.analysis) return doc
            const base = globalSettings?.basePrice || 9.00
            const fracs: Record<string, number> = { blank: 0, low: 0.25, medium: 0.5, high: 1.0, scanned: 1.0 }
            const fraction = fracs[newDensity] ?? 1.0
            const price = base * fraction
            const newPages = doc.analysis.pages.map((p, i) =>
                i === pageIdx ? { ...p, density: newDensity, fraction, price } : p
            )
            return { ...doc, analysis: { ...doc.analysis, pages: newPages, totalPrice: calcDocPrice(newPages) } }
        }))
    }

    // ✅ Toggle per-page inclusion (the lixeira per page)
    const togglePageInclusion = (docId: string, pageIdx: number) => {
        setDocuments(prev => prev.map(doc => {
            if (doc.id !== docId || !doc.analysis) return doc
            const newPages = doc.analysis.pages.map((p, i) =>
                i === pageIdx ? { ...p, included: !p.included } : p
            )
            const includedCount = newPages.filter(p => p.included).length
            return {
                ...doc,
                count: includedCount || 1,
                analysis: { ...doc.analysis, pages: newPages, totalPrice: calcDocPrice(newPages) }
            }
        }))
    }

    // ✅ Open ONLY the specific page using pdf-lib extraction
    const openPage = async (doc: DocumentItem, pageIdx: number, pageNumber: number) => {
        if (!doc.file) return

        const isPdf = /\.pdf$/i.test(doc.fileName) || doc.file.type === 'application/pdf'

        if (isPdf) {
            try {
                const arrayBuffer = await doc.file.arrayBuffer()
                const src = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true })
                const dst = await PDFDocument.create()
                const [copied] = await dst.copyPages(src, [pageIdx])
                dst.addPage(copied)
                const bytes = await dst.save()
                const blob = new Blob([bytes as any], { type: 'application/pdf' })
                const url = URL.createObjectURL(blob)
                setQuicklookData({ url, pageNumber, isBlob: true })
            } catch {
                // Fallback: open full doc with page hash
                const url = URL.createObjectURL(doc.file)
                setQuicklookData({ url, pageNumber, isBlob: false })
            }
        } else {
            // Images — single page anyway
            const url = URL.createObjectURL(doc.file)
            setQuicklookData({ url, pageNumber, isBlob: false })
        }
    }

    const closeQuicklook = () => {
        if (quicklookData?.isBlob) URL.revokeObjectURL(quicklookData.url)
        setQuicklookData(null)
    }

    // --- PRICE CALC ---
    useEffect(() => {
        const sel = documents.filter(d => d.isSelected)
        let base = 0, totalPages = 0, notary = 0

        if (serviceType === 'translation') {
            sel.forEach(doc => {
                let docPrice = 0
                if (doc.analysis) {
                    docPrice = calcDocPrice(doc.analysis.pages)
                    totalPages += doc.analysis.pages.filter(p => p.included).length
                } else {
                    const b = globalSettings?.basePrice || 9.00
                    docPrice = (doc.count || 1) * b
                    totalPages += doc.count || 1
                }
                if (doc.handwritten) docPrice *= 1.25
                base += docPrice
                notary += doc.notarized ? NOTARY_FEE_PER_DOC : 0
            })
        } else if (serviceType === 'notarization') {
            notary = sel.length * NOTARY_FEE_PER_DOC
            totalPages = sel.length
        }

        const baseWithUrgency = base * (URGENCY_MULTIPLIER[urgency] ?? 1.0)
        const urgencyFee = baseWithUrgency - base

        let volumeDiscountPercentage = 0;
        let volumeDiscountAmount = 0;
        if (serviceType === 'translation') {
            if (totalPages >= 51) volumeDiscountPercentage = 15;
            else if (totalPages >= 31) volumeDiscountPercentage = 10;
            else if (totalPages >= 16) volumeDiscountPercentage = 5;

            volumeDiscountAmount = baseWithUrgency * (volumeDiscountPercentage / 100);
        }

        const total = baseWithUrgency - volumeDiscountAmount + notary

        setBreakdown({
            basePrice: base, urgencyFee, notaryFee: notary,
            totalDocs: sel.length, totalCount: totalPages,
            minOrderApplied: false, totalMinimumAdjustment: 0, totalDiscountApplied: 0,
            volumeDiscountPercentage, volumeDiscountAmount
        })
        setTotalPrice(total)
    }, [documents, urgency, serviceType, globalSettings])

    // --- ORDER CREATION ---
    const handleGenerateProposal = async (finalTotalOverride?: number, manualDiscountAmount?: number) => {
        const selectedDocs = documents.filter(d => d.isSelected)
        if (!clientName || !clientEmail) { toast.error('Preencha pelo menos Nome e Email do cliente.'); return }
        if (selectedDocs.length === 0) { toast.error('Selecione pelo menos um documento.'); return }

        const effectiveTotal = finalTotalOverride !== undefined ? finalTotalOverride : totalPrice;

        setLoading(true); setUploadProgress(null)
        try {
            const uploadedDocs: Array<{ docIndex: number; url: string; fileName: string; contentType: string }> = []
            const docsWithFiles = selectedDocs.filter(d => d.file)

            for (let i = 0; i < docsWithFiles.length; i++) {
                const doc = docsWithFiles[i]
                setUploadProgress(`Enviando documentos... (${i + 1}/${docsWithFiles.length})`)
                const form = new FormData(); form.append('file', doc.file as File)
                const res = await fetch('/api/upload', { method: 'POST', body: form })
                if (res.ok) {
                    const data = await res.json()
                    uploadedDocs.push({ docIndex: selectedDocs.indexOf(doc), url: data.url, fileName: data.fileName, contentType: data.contentType })
                }
            }

            setUploadProgress('Gerando proposta comercial...')

            const orderDocuments = selectedDocs.map((d, idx) => {
                const uploaded = uploadedDocs.find(u => u.docIndex === idx)
                return {
                    id: d.id, type: 'Uploaded File', fileName: d.fileName,
                    count: d.count, notarized: d.notarized,
                    analysis: d.analysis, handwritten: d.handwritten,
                    uploadedFile: uploaded
                        ? { url: uploaded.url, fileName: uploaded.fileName, contentType: uploaded.contentType }
                        : undefined,
                }
            })

            const payload: any = {
                user: { fullName: clientName, email: clientEmail, phone: clientPhone },
                documents: orderDocuments,
                urgency, docCategory: 'standard', notaryMode: 'none',
                zipCode: '00000', grandTotalOverride: effectiveTotal,
                breakdown: { ...breakdown, serviceType, manualDiscountAmount: manualDiscountAmount },
                paymentProvider: 'STRIPE',
                serviceType: serviceType ?? 'translation',
                status: 'PENDING_PAYMENT'
            }

            let orderResult;
            if (orderId) {
                orderResult = await updateOrder(orderId, payload)
            } else {
                orderResult = await createOrder(payload)
            }

            if (!orderResult.success || !orderResult.orderId) {
                toast.error(orderResult.error || 'Erro ao processar proposta.')
                return
            }

            setGeneratedLink(`${window.location.origin}/proposta/${orderResult.orderId}`)
            toast.success('Proposta gerada! Envie o link ao cliente.')
        } catch (err) {
            console.error('Proposal generation error:', err)
            toast.error('Falha ao gerar proposta.')
        } finally {
            setLoading(false); setUploadProgress(null)
        }
    }

    const copyToClipboard = () => {
        if (generatedLink) { navigator.clipboard.writeText(generatedLink); toast.success('Link copiado!') }
    }

    const resetFlow = () => {
        setGeneratedLink(null); setDocuments([]); setClientName(''); setClientEmail('')
        setClientPhone(''); setServiceType(null); setUrgency('standard')
    }

    // ─── RENDER ───────────────────────────────────────────────────────────────
    if (isHydrating) {
        return (
            <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-slate-200 border-t-[#f58220] rounded-full animate-spin" />
                    <p className="text-slate-600 font-semibold">Carregando dados da proposta original...</p>
                    <p className="text-slate-400 text-sm">Recuperando informações do pedido #{orderId}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 p-6 md:p-12">
            <div className="max-w-4xl mx-auto">

                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Gerador de Propostas (Concierge)</h1>
                        <p className="text-slate-500 mt-1">Gere orçamentos e crie links de pagamento exclusivos para clientes VIP.</p>
                    </div>
                    <Link href="/admin/orders" className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors bg-white px-4 py-2 rounded-lg border border-slate-200">
                        Voltar ao Painel
                    </Link>
                </div>

                {generatedLink ? (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl shadow-xl p-8 border border-green-100 text-center">
                        <div className="mx-auto w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Proposta Gerada com Sucesso!</h2>
                        <p className="text-slate-500 mb-8 max-w-lg mx-auto">A documentação foi processada e a proposta digital está pronta para ser enviada ao cliente.</p>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between mb-8 max-w-2xl mx-auto">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <LinkIcon className="w-5 h-5 text-slate-400 shrink-0" />
                                <span className="text-sm font-mono text-slate-700 truncate">{generatedLink}</span>
                            </div>
                            <button onClick={copyToClipboard}
                                className="ml-4 shrink-0 bg-[#f58220] hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all active:scale-95 flex items-center gap-2">
                                <Copy className="w-4 h-4" /> Copiar Link
                            </button>
                        </div>
                        <button onClick={resetFlow} className="text-[#f58220] font-bold hover:underline">Gerar Nova Proposta</button>
                    </motion.div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 md:p-8">

                        {/* 1. Client Info */}
                        <div className="mb-8 pb-8 border-b border-slate-100">
                            <h3 className="text-lg font-bold mb-4">1. Dados do Cliente</h3>

                            {/* Smart Search Input */}
                            <div className="mb-6 relative">
                                <label className="block text-xs font-bold text-slate-500 mb-1">Buscar Cliente Recorrente</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Search className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="🔍 Buscar cliente existente (Nome ou E-mail)..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onFocus={() => { if (searchResults.length > 0) setShowDropdown(true) }}
                                        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                                        className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f58220]/50 shadow-sm transition-all"
                                    />
                                    {isSearching && (
                                        <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                            <div className="w-4 h-4 border-2 border-slate-300 border-t-[#f58220] rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                </div>

                                {/* Results Dropdown */}
                                <AnimatePresence>
                                    {showDropdown && searchResults.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto"
                                        >
                                            {searchResults.map((customer) => (
                                                <div
                                                    key={customer.id}
                                                    onClick={() => handleSelectCustomer(customer)}
                                                    className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 flex items-center justify-between transition-colors group"
                                                >
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-800 group-hover:text-[#f58220] transition-colors">{customer.fullName}</p>
                                                        <p className="text-xs text-slate-500">{customer.email}</p>
                                                    </div>
                                                    {customer.phone && (
                                                        <span className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-1 rounded">{customer.phone}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <AnimatePresence>
                                    {showDropdown && searchQuery.length >= 3 && searchResults.length === 0 && !isSearching && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-center text-sm text-slate-500"
                                        >
                                            Nenhum cliente encontrado.
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Nome Completo</label>
                                    <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f58220]/50"
                                        placeholder="Ex: Maria Silva" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">E-mail</label>
                                    <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f58220]/50"
                                        placeholder="maria@email.com" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Telefone (Opcional)</label>
                                    <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f58220]/50"
                                        placeholder="+1 (555) 000-0000" />
                                </div>
                            </div>
                        </div>

                        {/* 2. Service & Documents */}
                        {!serviceType ? (
                            <div className="space-y-6">
                                <h3 className="text-lg font-bold text-slate-900 mb-4">2. Serviço e Documentos</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button onClick={() => handleServiceSelection('translation')}
                                        className="text-left group flex items-start gap-4 p-6 rounded-2xl border-2 border-slate-100 hover:border-[#f58220] transition-all">
                                        <div className="bg-orange-50 text-orange-600 p-3 rounded-xl shrink-0"><Globe className="h-6 w-6" /></div>
                                        <div><h4 className="font-bold">Tradução + Certificação</h4></div>
                                    </button>
                                    <button onClick={() => handleServiceSelection('notarization')}
                                        className="text-left group flex items-start gap-4 p-6 rounded-2xl border-2 border-slate-100 hover:border-blue-500 transition-all">
                                        <div className="bg-blue-50 text-blue-600 p-3 rounded-xl shrink-0"><ShieldCheck className="h-6 w-6" /></div>
                                        <div><h4 className="font-bold">Apenas Notarização</h4></div>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-bold text-slate-900">2. Documentos ({serviceType === 'translation' ? 'Tradução' : 'Notarização'})</h3>
                                    <button onClick={resetServiceSelection} className="text-xs text-slate-400 hover:text-slate-600 font-bold">Trocar Serviço</button>
                                </div>

                                {/* Upload Zone */}
                                <div className="mb-6">
                                    <div className="relative group cursor-pointer border-2 border-dashed border-slate-300 rounded-2xl p-8 hover:border-[#f58220] hover:bg-orange-50/50 transition-all text-center">
                                        <input type="file" multiple
                                            // @ts-ignore
                                            webkitdirectory=""
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            onChange={handleFileUpload}
                                        />
                                        <div className="w-16 h-16 rounded-full bg-slate-100 group-hover:bg-[#f58220] flex items-center justify-center mx-auto mb-4 transition-colors shadow-sm text-slate-500 group-hover:text-white">
                                            {isAnalyzing
                                                ? <div className="w-6 h-6 border-4 border-slate-300 border-t-[#f58220] rounded-full animate-spin" />
                                                : <Upload className="h-6 w-6" />}
                                        </div>
                                        <p className="font-bold text-slate-700 text-base mb-1">Arraste Arquivos ou Pastas</p>
                                        <p className="text-xs text-slate-500">ou clique para selecionar do seu computador</p>
                                    </div>

                                    <div className="mt-3 text-center">
                                        {!showImportUrl ? (
                                            <button onClick={() => setShowImportUrl(true)}
                                                className="text-xs text-slate-500 hover:text-[#f58220] flex items-center justify-center gap-1 mx-auto transition-colors font-medium border border-transparent hover:border-orange-200 px-3 py-1.5 rounded-full">
                                                <LinkIcon className="w-3.5 h-3.5" /> Ou importar via link (Drive/Dropbox)
                                            </button>
                                        ) : (
                                            <div className="flex items-center max-w-md mx-auto bg-white p-1 rounded-lg border border-slate-300 shadow-sm">
                                                <input type="url" placeholder="Cole a URL do documento aqui..."
                                                    value={importUrl} onChange={e => setImportUrl(e.target.value)}
                                                    className="flex-1 text-sm px-3 py-2 outline-none bg-transparent" />
                                                <button onClick={handleImportUrl}
                                                    className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-slate-700 transition-colors">
                                                    Adicionar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Doc List */}
                                {documents.length > 0 && (
                                    <div className="space-y-4 mb-8">
                                        {documents.map(doc => {
                                            let densityLabel = 'N/A', densityColor = 'bg-slate-200 text-slate-500', densityProgress = 0
                                            let docPrice = doc.count * (globalSettings?.basePrice || 9.00)

                                            if (doc.analysis) {
                                                const includedPages = doc.analysis.pages.filter(p => p.included)
                                                const activeFrac = includedPages.length > 0
                                                    ? includedPages.reduce((s, p) => s + p.fraction, 0) / includedPages.length
                                                    : 0
                                                densityProgress = Math.round(activeFrac * 100)

                                                if (densityProgress === 0) { densityLabel = 'Em Branco'; densityColor = 'bg-gray-100 text-gray-500' }
                                                else if (densityProgress < 40) { densityLabel = 'Baixa Densidade'; densityColor = 'bg-green-100 text-green-700' }
                                                else if (densityProgress < 70) { densityLabel = 'Média Densidade'; densityColor = 'bg-yellow-100 text-yellow-700' }
                                                else { densityLabel = 'Alta Densidade'; densityColor = 'bg-red-100 text-red-700' }

                                                docPrice = calcDocPrice(doc.analysis.pages)
                                            }
                                            if (serviceType === 'translation' && doc.handwritten) docPrice *= 1.25

                                            const includedCount = doc.analysis?.pages.filter(p => p.included).length ?? doc.count
                                            const totalPageCount = doc.analysis?.pages.length ?? doc.count
                                            const excludedCount = totalPageCount - includedCount

                                            return (
                                                <div key={doc.id}
                                                    className={`rounded-2xl p-4 border transition-all duration-300 ${doc.isSelected ? 'border-slate-200 bg-white shadow-sm' : 'border-dashed border-slate-200 bg-slate-50 opacity-60 grayscale-[0.2]'}`}>

                                                    <div className="flex items-start justify-between">
                                                        {/* Left */}
                                                        <div className="flex items-start gap-4 min-w-0">
                                                            <div className={`mt-1 h-5 w-5 shrink-0 rounded border flex items-center justify-center cursor-pointer transition-colors ${doc.isSelected ? 'bg-[#f58220] border-[#f58220]' : 'border-slate-300 bg-white'}`}
                                                                onClick={() => updateDocument(doc.id, 'isSelected', !doc.isSelected)}>
                                                                {doc.isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                                            </div>
                                                            <div className="min-w-0">
                                                                {/* ✅ FIX: nome completo, sem truncar */}
                                                                <h5 className="font-bold text-sm text-slate-800 break-all leading-snug">{doc.fileName}</h5>
                                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                    <span className="text-xs text-slate-500 font-medium">
                                                                        {doc.analysis ? `${includedCount}/${totalPageCount} pág.` : `${doc.count} pág.`}
                                                                    </span>
                                                                    {excludedCount > 0 && (
                                                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                                            -{excludedCount} removida{excludedCount > 1 ? 's' : ''}
                                                                        </span>
                                                                    )}
                                                                    {serviceType === 'translation' && doc.analysis && (
                                                                        <>
                                                                            <span className="text-slate-300 text-xs">•</span>
                                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${densityColor}`}>
                                                                                {densityLabel} ({densityProgress}%)
                                                                            </span>
                                                                            {doc.analysis.pages.some(p => p.density === 'scanned') && (
                                                                                <span className="flex items-center gap-1 text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 animate-pulse">
                                                                                    🔴 SCAN/IMAGE
                                                                                </span>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                    {!doc.isSelected && (
                                                                        <>
                                                                            <span className="text-slate-300 text-xs">•</span>
                                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 flex items-center gap-1">
                                                                                <EyeOff className="w-3 h-3" /> Salvo para depois
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Right */}
                                                        <div className="flex flex-col items-end gap-3 shrink-0 ml-4">
                                                            {doc.isSelected && serviceType === 'translation' && (
                                                                <div className="font-mono font-bold text-slate-800">${docPrice.toFixed(2)}</div>
                                                            )}
                                                            <div className="flex items-center gap-4">
                                                                {serviceType === 'translation' && doc.isSelected && (
                                                                    <>
                                                                        <label className="flex items-center gap-1.5 cursor-pointer group">
                                                                            <input type="checkbox" checked={doc.notarized} onChange={e => updateDocument(doc.id, 'notarized', e.target.checked)} className="rounded accent-[#f58220] w-3.5 h-3.5" />
                                                                            <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700">+ Notarização</span>
                                                                        </label>
                                                                        <label className="flex items-center gap-1.5 cursor-pointer group">
                                                                            <input type="checkbox" checked={!!doc.handwritten} onChange={e => updateDocument(doc.id, 'handwritten', e.target.checked)} className="rounded accent-[#f58220] w-3.5 h-3.5" />
                                                                            <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700">Manuscrito</span>
                                                                        </label>
                                                                    </>
                                                                )}
                                                                <button onClick={() => removeDocument(doc.id)}
                                                                    className="text-slate-300 hover:text-red-500 transition-colors p-1" title="Excluir documento">
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Accordion — Densidade por Página */}
                                                    {serviceType === 'translation' && doc.analysis && (
                                                        <div className="mt-4 pt-4 border-t border-slate-100">
                                                            <button onClick={e => toggleDocExpand(doc.id, e)}
                                                                className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-[#f58220] transition-colors mb-2">
                                                                <ChevronDown className={`w-4 h-4 transition-transform ${expandedDocs.includes(doc.id) ? 'rotate-180' : ''}`} />
                                                                Detalhes de Densidade — {totalPageCount} {totalPageCount === 1 ? 'página' : 'páginas'}
                                                                {excludedCount > 0 && <span className="text-emerald-600 font-bold">({excludedCount} removida{excludedCount > 1 ? 's' : ''})</span>}
                                                            </button>

                                                            {expandedDocs.includes(doc.id) && (
                                                                <div className="space-y-2 mt-3 pt-2 pl-6 border-l-2 border-slate-100">
                                                                    {doc.analysis.pages.some(p => p.density === 'scanned') && (
                                                                        <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                                                                            <p className="text-[10px] text-red-800 leading-tight">
                                                                                <span className="font-bold">Auditoria de Preço Justo:</span> Páginas escaneadas requerem formatação manual (DTP) — classificadas como "Alta Densidade".
                                                                            </p>
                                                                        </div>
                                                                    )}

                                                                    {doc.analysis.pages.map((p, pIdx) => {
                                                                        const isInc = p.included
                                                                        let color = 'bg-gray-100 text-gray-500', label = '⚪ Em Branco'
                                                                        if (p.density === 'high') { color = 'bg-red-50 text-red-700 border border-red-100'; label = '🔴 Alta Density' }
                                                                        if (p.density === 'medium') { color = 'bg-yellow-50 text-yellow-700 border border-yellow-100'; label = '🟡 Média Density' }
                                                                        if (p.density === 'low') { color = 'bg-green-50 text-green-700 border border-green-100'; label = '🟢 Baixa Density' }
                                                                        if (p.density === 'scanned') { color = 'bg-red-50 text-red-700 border border-red-100'; label = '🔴 Alta/Scanned' }

                                                                        return (
                                                                            <div key={pIdx}
                                                                                className={`flex items-center gap-3 text-[11px] py-2 px-3 rounded-xl border shadow-sm transition-all ${isInc ? 'bg-slate-50/50 border-slate-100' : 'bg-red-50/30 border-dashed border-red-100 opacity-60'}`}>

                                                                                {/* Pg number */}
                                                                                <span className={`font-bold w-12 shrink-0 ${isInc ? 'text-slate-400' : 'text-red-400 line-through'}`}>
                                                                                    Pg {p.pageNumber}:
                                                                                </span>

                                                                                {/* Word count */}
                                                                                <span className="text-slate-500 font-medium w-20 shrink-0">{p.wordCount} pal.</span>

                                                                                {/* Density buttons */}
                                                                                <div className={`flex items-center gap-1 bg-white border border-slate-200 p-0.5 rounded-lg ${!isInc ? 'opacity-40 pointer-events-none' : ''}`}>
                                                                                    {(['blank', 'low', 'medium', 'high', 'scanned'] as const).map(dType => (
                                                                                        <button key={dType}
                                                                                            onClick={() => updatePageDensity(doc.id, pIdx, dType)}
                                                                                            className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${p.density === dType
                                                                                                ? dType === 'blank' ? 'bg-gray-200 text-gray-700' : dType === 'low' ? 'bg-green-500 text-white' : dType === 'medium' ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'
                                                                                                : 'text-slate-400 hover:bg-slate-50'}`}>
                                                                                            {dType === 'blank' ? '0%' : dType === 'low' ? '25%' : dType === 'medium' ? '50%' : dType === 'high' ? '100%' : 'SCAN'}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>

                                                                                {/* Label */}
                                                                                <span className={`font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider shrink-0 ${color}`}>
                                                                                    {label}
                                                                                </span>

                                                                                {/* Price + actions */}
                                                                                <div className="ml-auto flex items-center gap-2">
                                                                                    <span className={`font-mono font-extrabold text-sm ${isInc ? 'text-slate-900' : 'text-red-400 line-through'}`}>
                                                                                        ${p.price.toFixed(2)}
                                                                                    </span>

                                                                                    {/* ✅ Olhinho — abre APENAS esta página */}
                                                                                    <button
                                                                                        onClick={() => openPage(doc, pIdx, p.pageNumber)}
                                                                                        title={`Ver página ${p.pageNumber}`}
                                                                                        className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-blue-500 border border-blue-100 hover:bg-blue-500 hover:text-white transition-all shadow-sm"
                                                                                    >
                                                                                        <Eye className="w-3.5 h-3.5" />
                                                                                    </button>

                                                                                    {/* ✅ Lixeira/Restaurar — remove/restaura página do orçamento */}
                                                                                    <button
                                                                                        onClick={() => togglePageInclusion(doc.id, pIdx)}
                                                                                        title={isInc ? 'Remover página do orçamento' : 'Restaurar página'}
                                                                                        className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-all shadow-sm ${isInc
                                                                                            ? 'bg-red-50 text-red-400 border-red-100 hover:bg-red-500 hover:text-white'
                                                                                            : 'bg-emerald-50 text-emerald-500 border-emerald-100 hover:bg-emerald-500 hover:text-white'}`}
                                                                                    >
                                                                                        {isInc ? <Trash2 className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* Urgency */}
                                {serviceType === 'translation' && documents.length > 0 && (
                                    <div className="mb-8">
                                        <h3 className="text-lg font-bold text-slate-900 mb-4">3. Prazo</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {[
                                                { id: 'standard', label: 'Standard', desc: '4 a 10 dias' },
                                                { id: 'urgent', label: 'Urgente', desc: '48 horas' },
                                                { id: 'flash', label: 'Flash', desc: '24 horas' }
                                            ].map(opt => (
                                                <button key={opt.id} onClick={() => setUrgency(opt.id)}
                                                    className={`p-3 rounded-lg border-2 text-left transition-all ${urgency === opt.id ? 'border-[#f58220] bg-orange-50' : 'border-slate-200'}`}>
                                                    <div className={`font-bold text-sm ${urgency === opt.id ? 'text-[#f58220]' : 'text-slate-700'}`}>{opt.label}</div>
                                                    <div className="text-xs text-slate-500">{opt.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Summary */}
                                {documents.length > 0 && (
                                    <div className="mt-8">
                                        <BudgetSummaryCard
                                            subtotal={totalPrice}
                                            totalDocs={breakdown.totalDocs}
                                            totalPages={breakdown.totalCount}
                                            onGenerateProposal={(final, disc) => handleGenerateProposal(final, disc)}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ✅ Quicklook Modal — mostra UMA página extraída */}
            {quicklookData && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={closeQuicklook}>
                    <div className="bg-slate-900 rounded-xl overflow-hidden w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl relative"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-800">
                            <div>
                                <h3 className="text-white font-bold flex items-center gap-2">
                                    <Eye className="w-5 h-5 text-[#f58220]" />
                                    Promobi Quicklook
                                </h3>
                                <p className="text-slate-400 text-xs">
                                    Visualizando página {quicklookData.pageNumber} isolada
                                </p>
                            </div>
                            <button onClick={closeQuicklook}
                                className="bg-slate-700 hover:bg-red-500 text-white rounded-full p-2 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 bg-slate-950 p-4">
                            <iframe src={quicklookData.url} className="w-full h-full rounded-lg bg-white" title="Quicklook Viewer" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
