'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
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
    X
} from 'lucide-react'
import { useUIFeedback } from '../../../components/UIFeedbackProvider'
import { analyzeDocument, DocumentAnalysis } from '../../../lib/documentAnalyzer'

// --- TYPES ---
type DocumentItem = {
    id: string;
    file?: File;
    fileName: string;
    count: number;
    notarized: boolean;
    analysis?: DocumentAnalysis;
    isSelected: boolean;
    handwritten?: boolean;
    fileTranslated?: File;
    fileNameTranslated?: string;
}

export default function OrcamentoManual() {
    // --- STATE & LOGIC ---
    const [serviceType, setServiceType] = useState<'translation' | 'notarization' | null>(null)
    const [documents, setDocuments] = useState<DocumentItem[]>([])
    const [urgency, setUrgency] = useState('standard')
    const [totalPrice, setTotalPrice] = useState(0)

    const [clientName, setClientName] = useState('')
    const [clientEmail, setClientEmail] = useState('')
    const [clientPhone, setClientPhone] = useState('')

    const [loading, setLoading] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [uploadProgress, setUploadProgress] = useState<string | null>(null)
    const [generatedLink, setGeneratedLink] = useState<string | null>(null)
    const [importUrl, setImportUrl] = useState('')
    const [showImportUrl, setShowImportUrl] = useState(false)
    const [quicklookData, setQuicklookData] = useState<{ url: string, pageNumber: number } | null>(null) // Added quicklookData state

    const [breakdown, setBreakdown] = useState({
        basePrice: 0,
        urgencyFee: 0,
        notaryFee: 0,
        totalDocs: 0,
        totalCount: 0,
        minOrderApplied: false,
        totalMinimumAdjustment: 0,
        totalDiscountApplied: 0
    })

    const [expandedDocs, setExpandedDocs] = useState<string[]>([])
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null)

    const { confirm, toast } = useUIFeedback()

    useEffect(() => {
        getGlobalSettings().then(setGlobalSettings)
    }, [])

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
        if (e) e.stopPropagation();
        setExpandedDocs(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
    }

    const resetServiceSelection = () => {
        if (documents.length > 0) {
            confirm({
                title: 'Alterar Serviço',
                message: 'Isso limpará seu orçamento atual. Deseja continuar?',
                confirmText: 'Sim, alterar',
                danger: true,
                onConfirm: () => {
                    setServiceType(null)
                    setDocuments([])
                    setUrgency('normal')
                }
            })
            return
        }
        setServiceType(null)
        setDocuments([])
        setUrgency('normal')
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            if (serviceType === 'translation') {
                setIsAnalyzing(true)
                const newDocs: DocumentItem[] = []

                for (const file of Array.from(e.target.files)) {
                    // Only process PDFs for density analysis if possible, but the analyzer handles it
                    try {
                        const analysis = await analyzeDocument(file)
                        newDocs.push({
                            id: crypto.randomUUID(),
                            file: file,
                            fileName: (file.webkitRelativePath || file.name).split(/[/\\]/).pop() || file.name, // Extract strictly the final filename
                            count: analysis.totalPages,
                            notarized: false,
                            analysis: analysis,
                            isSelected: true,
                            handwritten: false
                        })
                    } catch (err) {
                        console.error("Analysis failed", err)
                        newDocs.push({
                            id: crypto.randomUUID(),
                            file: file,
                            fileName: file.webkitRelativePath || file.name,
                            count: 1, // Fallback
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
                const newDocs: DocumentItem[] = []
                for (const file of Array.from(e.target.files)) {
                    newDocs.push({
                        id: crypto.randomUUID(),
                        file: file,
                        fileName: (file.webkitRelativePath || file.name).split(/[/\\]/).pop() || file.name,
                        count: 1,
                        notarized: true,
                        isSelected: true,
                    } as DocumentItem)
                }
                setDocuments(prev => [...prev, ...newDocs])
                toast.success(`${newDocs.length} documentos adicionados com sucesso!`)
            }
        }
        // Reset the input value so the same files can be selected again if needed
        e.target.value = '';
    }

    const handleImportUrl = () => {
        if (!importUrl) return;

        try {
            new URL(importUrl); // Basic validation

            // Create a fake DocumentItem for the link
            const newDoc: DocumentItem = {
                id: crypto.randomUUID(),
                fileName: `Link: ${importUrl.substring(0, 30)}...`,
                count: 1, // Default to 1 page for links, user might need to adjust manually later if we allow it, or it's just a placeholder
                notarized: false,
                isSelected: true,
                handwritten: false,
                // We don't have a File object, so we'll need to handle this in the submit logic
            }
            // Add a mock analysis so it gets priced at base rate initially if translation
            if (serviceType === 'translation') {
                newDoc.analysis = {
                    totalPages: 1,
                    totalPrice: globalSettings?.basePrice || 9.00,
                    pages: [{ pageNumber: 1, wordCount: 0, density: 'blank', fraction: 0, price: globalSettings?.basePrice || 9.00 }],
                    isImage: false
                }
            }

            setDocuments(prev => [...prev, newDoc])
            setImportUrl('')
            setShowImportUrl(false)
            toast.success('Link importado e adicionado à lista.')

        } catch (e) {
            toast.error('Por favor, insira uma URL válida.')
        }
    }

    const removeDocument = (id: string) => {
        setDocuments(prev => prev.filter(d => d.id !== id))
    }

    const clearAllDocuments = () => {
        setDocuments([])
        setUrgency('normal')
        toast.info('Orçamento reiniciado.')
    }

    const updateDocument = (id: string, field: keyof DocumentItem, value: any) => {
        setDocuments(documents.map(d =>
            d.id === id ? { ...d, [field]: value } : d
        ))
    }

    const updatePageDensity = (docId: string, pageIdx: number, newDensity: 'high' | 'medium' | 'low' | 'blank' | 'scanned') => {
        setDocuments(prev => prev.map(doc => {
            if (doc.id === docId && doc.analysis) {
                const newPages = [...doc.analysis.pages]
                const page = newPages[pageIdx]
                const base = globalSettings?.basePrice || 9.00

                let fraction = 1.0
                let price = base

                if (newDensity === 'blank') { fraction = 0; price = 0; }
                else if (newDensity === 'low') { fraction = 0.25; price = base * 0.25; }
                else if (newDensity === 'medium') { fraction = 0.5; price = base * 0.5; }
                else { fraction = 1.0; price = base; } // high or scanned

                newPages[pageIdx] = { ...page, density: newDensity, fraction, price }

                const newTotalPrice = newPages.reduce((acc, p) => acc + p.price, 0)

                return { ...doc, analysis: { ...doc.analysis, pages: newPages, totalPrice: newTotalPrice } }
            }
            return doc
        }))
    }

    useEffect(() => {
        const selectedDocs = documents.filter(d => d.isSelected)

        let totalBaseBeforeFloor = 0
        let totalBaseAfterFloor = 0
        let totalPages = 0
        let notary = 0
        let minOrderApplied = false
        let totalMinimumAdjustment = 0

        if (serviceType === 'translation') {
            selectedDocs.forEach(doc => {
                let docPrice = 0;
                if (doc.analysis) {
                    docPrice = doc.analysis.totalPrice
                    totalPages += doc.analysis.totalPages
                } else {
                    const base = globalSettings?.basePrice || 9.00
                    docPrice = (doc.count || 1) * base
                    totalPages += (doc.count || 1)
                }

                if ((doc as any).handwritten) {
                    docPrice *= 1.25
                }

                totalBaseBeforeFloor += docPrice
                totalBaseAfterFloor += docPrice
            })

            notary = selectedDocs.reduce((acc, doc) => acc + (doc.notarized ? NOTARY_FEE_PER_DOC : 0), 0)
        } else if (serviceType === 'notarization') {
            notary = selectedDocs.length * NOTARY_FEE_PER_DOC
            totalPages = selectedDocs.length
        }

        const baseWithUrgency = totalBaseAfterFloor * (URGENCY_MULTIPLIER[urgency] ?? 1.0)
        const urgencyPart = baseWithUrgency - totalBaseAfterFloor

        let total = baseWithUrgency + notary

        setBreakdown({
            basePrice: totalBaseBeforeFloor,
            urgencyFee: urgencyPart,
            notaryFee: notary,
            totalDocs: selectedDocs.length,
            totalCount: totalPages,
            minOrderApplied: false,
            totalMinimumAdjustment: 0,
            totalDiscountApplied: 0
        })

        setTotalPrice(total)
    }, [documents, urgency, URGENCY_MULTIPLIER, serviceType])

    const handleGenerateProposal = async () => {
        const selectedDocs = documents.filter(d => d.isSelected)

        if (!clientName || !clientEmail) {
            toast.error('Preencha pelo menos Nome e Email do cliente.')
            return
        }
        if (selectedDocs.length === 0) {
            toast.error('Selecione pelo menos um documento.')
            return
        }

        setLoading(true)
        setUploadProgress(null)

        try {
            const docsWithFiles = selectedDocs.filter(d => d.file)
            const uploadedDocs: Array<{ docIndex: number; url: string; fileName: string; contentType: string }> = []

            if (docsWithFiles.length > 0) {
                for (let i = 0; i < docsWithFiles.length; i++) {
                    const doc = docsWithFiles[i]
                    setUploadProgress(`Enviando documentos... (${i + 1}/${docsWithFiles.length})`)

                    const form = new FormData()
                    form.append('file', doc.file as File)

                    const res = await fetch('/api/upload', { method: 'POST', body: form })
                    if (res.ok) {
                        const data = await res.json()
                        uploadedDocs.push({
                            docIndex: selectedDocs.indexOf(doc),
                            url: data.url,
                            fileName: data.fileName,
                            contentType: data.contentType,
                        })
                    }
                }
            }

            setUploadProgress('Gerando proposta comercial...')

            const orderDocuments = selectedDocs.map((d, idx) => {
                const uploaded = uploadedDocs.find(u => u.docIndex === idx)
                return {
                    id: d.id,
                    type: 'Uploaded File',
                    fileName: d.fileName,
                    count: d.count,
                    notarized: d.notarized,
                    analysis: d.analysis, // Include density analysis here
                    handwritten: d.handwritten,
                    uploadedFile: uploaded
                        ? { url: uploaded.url, fileName: uploaded.fileName, contentType: uploaded.contentType }
                        : undefined,
                }
            })

            const orderResult = await createOrder({
                user: { fullName: clientName, email: clientEmail, phone: clientPhone },
                documents: orderDocuments,
                urgency,
                docCategory: 'standard',
                notaryMode: 'none',
                zipCode: '00000',
                grandTotalOverride: totalPrice,
                breakdown: { ...breakdown, serviceType },
                paymentProvider: 'STRIPE', // Default, won't be charged immediately
                serviceType: serviceType ?? 'translation',
                status: 'PENDING_PAYMENT' // Crucial status for the concierge flow
            })

            if (!orderResult.success || !orderResult.orderId) {
                toast.error(orderResult.error || 'Erro ao gerar proposta.')
                setLoading(false)
                setUploadProgress(null)
                return
            }

            // Success! Generate Link
            const link = `${window.location.origin}/proposta/${orderResult.orderId}`
            setGeneratedLink(link)
            toast.success('Proposta gerada! Envie o link ao cliente.')

        } catch (error) {
            console.error('Proposal generation error:', error)
            toast.error('Falha ao gerar proposta.')
        } finally {
            setLoading(false)
            setUploadProgress(null)
        }
    }

    const copyToClipboard = () => {
        if (generatedLink) {
            navigator.clipboard.writeText(generatedLink);
            toast.success('Link copiado!');
        }
    }


    const resetFlow = () => {
        setGeneratedLink(null);
        setDocuments([]);
        setClientName('');
        setClientEmail('');
        setClientPhone('');
        setServiceType(null);
        setUrgency('standard');
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
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl shadow-xl p-8 border border-green-100 text-center"
                    >
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
                            <button
                                onClick={copyToClipboard}
                                className="ml-4 shrink-0 bg-[#f58220] hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md transition-all active:scale-95 flex items-center gap-2"
                            >
                                <Copy className="w-4 h-4" /> Copiar Link
                            </button>
                        </div>

                        <button onClick={resetFlow} className="text-[#f58220] font-bold hover:underline">
                            Gerar Nova Proposta
                        </button>
                    </motion.div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 md:p-8">

                        {/* 1. Client Info */}
                        <div className="mb-8 pb-8 border-b border-slate-100">
                            <h3 className="text-lg font-bold mb-4">1. Dados do Cliente</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Nome Completo</label>
                                    <input
                                        type="text"
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f58220]/50"
                                        placeholder="Ex: Maria Silva"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">E-mail</label>
                                    <input
                                        type="email"
                                        value={clientEmail}
                                        onChange={(e) => setClientEmail(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f58220]/50"
                                        placeholder="maria@email.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Telefone (Opcional)</label>
                                    <input
                                        type="tel"
                                        value={clientPhone}
                                        onChange={(e) => setClientPhone(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f58220]/50"
                                        placeholder="+1 (555) 000-0000"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 2. Service Selection & Documents */}
                        {!serviceType ? (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 mb-4">2. Serviço e Documentos</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button
                                        onClick={() => handleServiceSelection('translation')}
                                        className="text-left group relative flex items-start gap-4 p-6 rounded-2xl border-2 border-slate-100 hover:border-[#f58220] transition-all"
                                    >
                                        <div className="bg-orange-50 text-orange-600 p-3 rounded-xl shrink-0"><Globe className="h-6 w-6" /></div>
                                        <div><h4 className="font-bold">Tradução + Certificação</h4></div>
                                    </button>
                                    <button
                                        onClick={() => handleServiceSelection('notarization')}
                                        className="text-left group relative flex items-start gap-4 p-6 rounded-2xl border-2 border-slate-100 hover:border-blue-500 transition-all"
                                    >
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
                                        {/* Accept multiple and folders */}
                                        <input
                                            type="file"
                                            multiple
                                            // @ts-ignore - webkitdirectory is non-standard but widely supported
                                            webkitdirectory={""}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            onChange={handleFileUpload}
                                        />
                                        <div className="w-16 h-16 rounded-full bg-slate-100 group-hover:bg-[#f58220] flex items-center justify-center mx-auto mb-4 transition-colors shadow-sm text-slate-500 group-hover:text-white">
                                            {isAnalyzing ? (
                                                <div className="w-6 h-6 border-4 border-slate-300 border-t-[#f58220] rounded-full animate-spin"></div>
                                            ) : (
                                                <Upload className="h-6 w-6" />
                                            )}
                                        </div>
                                        <p className="font-bold text-slate-700 text-base mb-1">Arraste Arquivos ou Pastas</p>
                                        <p className="text-xs text-slate-500">ou clique para selecionar do seu computador</p>
                                    </div>

                                    {/* Import via Link */}
                                    <div className="mt-3 text-center">
                                        {!showImportUrl ? (
                                            <button
                                                onClick={() => setShowImportUrl(true)}
                                                className="text-xs text-slate-500 hover:text-[#f58220] flex items-center justify-center gap-1 mx-auto transition-colors font-medium border border-transparent hover:border-orange-200 px-3 py-1.5 rounded-full"
                                            >
                                                <LinkIcon className="w-3.5 h-3.5" /> Ou importar via link (Drive/Dropbox)
                                            </button>
                                        ) : (
                                            <div className="flex items-center max-w-md mx-auto bg-white p-1 rounded-lg border border-slate-300 shadow-sm">
                                                <input
                                                    type="url"
                                                    placeholder="Cole a URL do documento aqui..."
                                                    value={importUrl}
                                                    onChange={(e) => setImportUrl(e.target.value)}
                                                    className="flex-1 text-sm px-3 py-2 outline-none bg-transparent"
                                                />
                                                <button
                                                    onClick={handleImportUrl}
                                                    className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-slate-700 transition-colors"
                                                >
                                                    Adicionar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Doc List */}
                                {documents.length > 0 && (
                                    <div className="space-y-4 mb-8">
                                        {documents.map((doc) => {
                                            // Calculate document density stats
                                            let densityLabel = 'N/A'
                                            let densityColor = 'bg-slate-200 text-slate-500'
                                            let densityProgress = 0
                                            let docPrice = doc.count * (globalSettings?.basePrice || 9.00)

                                            if (doc.analysis) {
                                                const avgFraction = doc.analysis.pages.reduce((acc, p) => acc + p.fraction, 0) / doc.analysis.pages.length
                                                densityProgress = Math.round(avgFraction * 100)

                                                if (densityProgress === 0) {
                                                    densityLabel = 'Em Branco'
                                                    densityColor = 'bg-gray-100 text-gray-500'
                                                } else if (densityProgress < 40) {
                                                    densityLabel = 'Baixa Densidade'
                                                    densityColor = 'bg-green-100 text-green-700'
                                                } else if (densityProgress < 70) {
                                                    densityLabel = 'Média Densidade'
                                                    densityColor = 'bg-yellow-100 text-yellow-700'
                                                } else {
                                                    densityLabel = 'Alta Densidade'
                                                    densityColor = 'bg-red-100 text-red-700'
                                                }
                                                docPrice = doc.analysis.totalPrice
                                            }

                                            // Apply handwritting modifier for display
                                            if (serviceType === 'translation' && doc.handwritten) {
                                                docPrice *= 1.25
                                            }

                                            return (
                                                <div
                                                    key={doc.id}
                                                    className={`rounded-2xl p-4 border transition-all duration-300 ${doc.isSelected ? 'border-slate-200 bg-white shadow-sm' : 'border-dashed border-slate-200 bg-slate-50 opacity-60 grayscale-[0.2]'}`}
                                                >
                                                    <div className="flex items-start justify-between">

                                                        {/* Left: Info */}
                                                        <div className="flex items-start gap-4">
                                                            <div className={`mt-1 h-5 w-5 rounded border flex items-center justify-center cursor-pointer transition-colors ${doc.isSelected ? 'bg-[#f58220] border-[#f58220]' : 'border-slate-300 bg-white'}`}
                                                                onClick={() => updateDocument(doc.id, 'isSelected', !doc.isSelected)}
                                                            >
                                                                {doc.isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                                            </div>

                                                            <div>
                                                                <h5 className="font-bold text-sm text-slate-800 truncate max-w-[200px] md:max-w-[300px]">{doc.fileName}</h5>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-xs text-slate-500 font-medium">{doc.count} pág.</span>

                                                                    {/* Raio-X Scanner */}
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

                                                        {/* Right: Actions & Price */}
                                                        <div className="flex flex-col items-end gap-3">
                                                            {doc.isSelected && serviceType === 'translation' && (
                                                                <div className="font-mono font-bold text-slate-800">
                                                                    ${docPrice.toFixed(2)}
                                                                </div>
                                                            )}

                                                            <div className="flex items-center gap-4">
                                                                {serviceType === 'translation' && doc.isSelected && (
                                                                    <>
                                                                        <label className="flex items-center gap-1.5 cursor-pointer group">
                                                                            <input type="checkbox" checked={doc.notarized} onChange={(e) => updateDocument(doc.id, 'notarized', e.target.checked)} className="rounded accent-[#f58220] w-3.5 h-3.5" />
                                                                            <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700 transition-colors">+ Notarização</span>
                                                                        </label>
                                                                        <label className="flex items-center gap-1.5 cursor-pointer group">
                                                                            <input type="checkbox" checked={doc.handwritten} onChange={(e) => updateDocument(doc.id, 'handwritten', e.target.checked)} className="rounded accent-[#f58220] w-3.5 h-3.5" />
                                                                            <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700 transition-colors">Manuscrito</span>
                                                                        </label>
                                                                    </>
                                                                )}
                                                                <button onClick={() => removeDocument(doc.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1" title="Excluir Permanentemente">
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                    </div>

                                                    {/* Accordion Detalhamento por Página */}
                                                    {serviceType === 'translation' && doc.analysis && (
                                                        <div className="mt-4 pt-4 border-t border-slate-100">
                                                            <button
                                                                onClick={(e) => toggleDocExpand(doc.id, e)}
                                                                className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-[#f58220] transition-colors mb-2"
                                                            >
                                                                <ChevronDown className={`w-4 h-4 transition-transform ${expandedDocs.includes(doc.id) ? 'rotate-180' : ''}`} />
                                                                Detalhes de Densidade
                                                            </button>

                                                            {expandedDocs.includes(doc.id) && (
                                                                <div className="space-y-2 mt-3 pt-2 pl-6 border-l-2 border-slate-100">
                                                                    {doc.analysis.pages.some(p => p.density === 'scanned') && (
                                                                        <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                                                                            <p className="text-[10px] text-red-800 leading-tight">
                                                                                <span className="font-bold">Auditoria de Preço Justo:</span> Páginas escaneadas (não-pesquisáveis) requerem extração e formatação manual (DTP). Devido a este processamento humano, estas páginas são classificadas como "Alta Densidade".
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                    {doc.analysis.pages.map((p: any, pIdx: number) => {
                                                                        let color = 'bg-gray-100 text-gray-500';
                                                                        let label = '⚪ Em Branco';
                                                                        if (p.density === 'high') { color = 'bg-red-50 text-red-700 border border-red-100'; label = '🔴 Alta Density'; }
                                                                        else if (p.density === 'medium') { color = 'bg-yellow-50 text-yellow-700 border border-yellow-100'; label = '🟡 Média Density'; }
                                                                        else if (p.density === 'low') { color = 'bg-green-50 text-green-700 border border-green-100'; label = '🟢 Baixa Density'; }
                                                                        else if (p.density === 'scanned') { color = 'bg-red-50 text-red-700 border border-red-100'; label = '🔴 Alta/Scanned'; }

                                                                        return (
                                                                            <div key={pIdx} className="flex items-center gap-3 text-[11px] bg-slate-50/50 py-2 px-3 rounded-xl border border-slate-100 shadow-sm">
                                                                                <span className="text-slate-400 font-bold w-12">Pg {p.pageNumber}:</span>
                                                                                <span className="text-slate-600 font-medium w-24">{p.wordCount} pal. <span className="text-slate-300 mx-1">→</span></span>

                                                                                <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5 rounded-lg">
                                                                                    {(['blank', 'low', 'medium', 'high', 'scanned'] as const).map((dType) => (
                                                                                        <button
                                                                                            key={dType}
                                                                                            onClick={() => updatePageDensity(doc.id, pIdx, dType)}
                                                                                            className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${p.density === dType
                                                                                                ? dType === 'blank' ? 'bg-gray-200 text-gray-700' :
                                                                                                    dType === 'low' ? 'bg-green-500 text-white' :
                                                                                                        dType === 'medium' ? 'bg-yellow-500 text-white' :
                                                                                                            dType === 'high' ? 'bg-red-500 text-white' :
                                                                                                                'bg-red-500 text-white'
                                                                                                : 'text-slate-400 hover:bg-slate-50'
                                                                                                }`}
                                                                                            title={dType}
                                                                                        >
                                                                                            {dType === 'blank' ? '0%' : dType === 'low' ? '25%' : dType === 'medium' ? '50%' : dType === 'high' ? '100%' : 'SCAN'}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>

                                                                                <span className={`font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider ${color}`}>
                                                                                    {label}
                                                                                </span>
                                                                                <div className="ml-auto flex items-center gap-3">
                                                                                    <span className="font-mono text-slate-900 font-extrabold text-sm">${p.price.toFixed(2)}</span>
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            const url = doc.file ? URL.createObjectURL(doc.file) : undefined;
                                                                                            if (url) setQuicklookData({ url, pageNumber: p.pageNumber });
                                                                                        }}
                                                                                        className="text-slate-400 hover:text-[#f58220] transition-colors p-1.5 bg-white hover:bg-orange-50 rounded-lg border border-slate-100 shadow-sm"
                                                                                        title="Visualizar Página Original"
                                                                                    >
                                                                                        <Eye className="w-3.5 h-3.5" />
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
                                                <button
                                                    key={opt.id}
                                                    onClick={() => setUrgency(opt.id)}
                                                    className={`p-3 rounded-lg border-2 text-left transition-all ${urgency === opt.id ? 'border-[#f58220] bg-orange-50' : 'border-slate-200'}`}
                                                >
                                                    <div className={`font-bold text-sm ${urgency === opt.id ? 'text-[#f58220]' : 'text-slate-700'}`}>{opt.label}</div>
                                                    <div className="text-xs text-slate-500">{opt.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Summary & Actions */}
                                {documents.length > 0 && (
                                    <div className="bg-slate-900 text-white rounded-2xl p-6 mt-8">
                                        <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                                            <span className="font-bold">Total Calculado</span>
                                            <span className="text-2xl font-black text-[#f58220]">${totalPrice.toFixed(2)}</span>
                                        </div>

                                        <button
                                            onClick={handleGenerateProposal}
                                            disabled={loading}
                                            className="w-full bg-[#f58220] hover:bg-orange-600 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-lg shadow-lg transition-all"
                                        >
                                            {loading ? uploadProgress || 'Processando...' : 'Gerar Proposta Comercial'}
                                        </button>
                                    </div>
                                )}

                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* Quicklook Modal */}
            {quicklookData && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-slate-900 rounded-xl overflow-hidden w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl relative">
                        <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-800">
                            <div>
                                <h3 className="text-white font-bold flex items-center gap-2">
                                    <Eye className="w-5 h-5 text-[#f58220]" />
                                    Promobi Quicklook
                                </h3>
                                <p className="text-slate-400 text-xs">Página {quicklookData.pageNumber} do formato original</p>
                            </div>
                            <button
                                onClick={() => setQuicklookData(null)}
                                className="bg-slate-700 hover:bg-red-500 text-white rounded-full p-2 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 bg-slate-950 p-4">
                            <iframe
                                src={`${quicklookData.url}#page=${quicklookData.pageNumber}`}
                                className="w-full h-full rounded-lg bg-white"
                                title="Quicklook Viewer"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
