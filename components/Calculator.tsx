'use client'

import { useEffect, useState, type ChangeEvent, type MouseEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
    ArrowRight,
    Check,
    CheckCircle,
    ChevronDown,
    FileText,
    Globe,
    Plus,
    ShieldCheck,
    Smartphone,
    Trash2,
    Upload,
} from 'lucide-react'
import { createOrder } from '../app/actions/create-order'
import { createCheckoutSession } from '../app/actions/checkout'
import { getGlobalSettings, GlobalSettings } from '../app/actions/settings'
import { analyzeDocument, DocumentAnalysis } from '../lib/documentAnalyzer'
import { useUIFeedback } from './UIFeedbackProvider'

type DocumentItem = {
    id: string
    file?: File
    fileName: string
    count: number
    notarized: boolean
    analysis?: DocumentAnalysis
    isSelected: boolean
    handwritten?: boolean
    fileTranslated?: File
    fileNameTranslated?: string
}

type BreakdownState = {
    basePrice: number
    urgencyFee: number
    notaryFee: number
    totalDocs: number
    totalCount: number
    minOrderApplied: boolean
    totalMinimumAdjustment: number
    totalDiscountApplied: number
    volumeDiscountPercentage: number
    volumeDiscountAmount: number
}

const initialBreakdown: BreakdownState = {
    basePrice: 0,
    urgencyFee: 0,
    notaryFee: 0,
    totalDocs: 0,
    totalCount: 0,
    minOrderApplied: false,
    totalMinimumAdjustment: 0,
    totalDiscountApplied: 0,
    volumeDiscountPercentage: 0,
    volumeDiscountAmount: 0,
}

export default function Calculator() {
    const [serviceType, setServiceType] = useState<'translation' | 'notarization'>('translation')
    const [docLanguage, setDocLanguage] = useState<'PT_BR' | 'ES'>('PT_BR')
    const [documents, setDocuments] = useState<DocumentItem[]>([])
    const [urgency, setUrgency] = useState('standard')
    const [paymentPlan, setPaymentPlan] = useState<'upfront_discount' | 'upfront' | 'split'>('upfront')
    const [totalPrice, setTotalPrice] = useState(0)
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [paymentProvider, setPaymentProvider] = useState<'STRIPE' | 'PARCELADO_USA'>('STRIPE')
    const [loading, setLoading] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [whatsappSent, setWhatsappSent] = useState(false)
    const [uploadProgress, setUploadProgress] = useState<string | null>(null)
    const [breakdown, setBreakdown] = useState<BreakdownState>(initialBreakdown)
    const [expandedDocs, setExpandedDocs] = useState<string[]>([])
    const [termsAccepted, setTermsAccepted] = useState(false)
    const [termsError, setTermsError] = useState(false)
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null)
    const { confirm, toast } = useUIFeedback()

    useEffect(() => {
        getGlobalSettings().then(setGlobalSettings)
    }, [])

    const NOTARY_FEE_PER_DOC = globalSettings?.notaryFee || 25.0
    const URGENCY_MULTIPLIER: Record<string, number> = {
        standard: 1.0,
        urgent: 1.0 + (globalSettings?.urgencyRate || 0.3),
        flash: 1.0 + (globalSettings?.urgencyRate ? globalSettings.urgencyRate * 2 : 0.6),
    }

    const handleServiceSelection = (type: 'translation' | 'notarization') => {
        if (type === serviceType) return

        if (documents.length > 0) {
            confirm({
                title: 'Trocar Fluxo',
                message: 'Ao mudar de serviço, o orçamento atual será limpo. Deseja continuar?',
                confirmText: 'Trocar serviço',
                danger: true,
                onConfirm: () => {
                    setServiceType(type)
                    setDocuments([])
                    setUrgency('standard')
                    setExpandedDocs([])
                },
            })
            return
        }

        setServiceType(type)
        setDocuments([])
        setUrgency('standard')
        setExpandedDocs([])
    }

    const toggleDocExpand = (id: string, e?: MouseEvent) => {
        if (e) e.stopPropagation()
        setExpandedDocs((prev) => (prev.includes(id) ? prev.filter((docId) => docId !== id) : [...prev, id]))
    }

    const resetServiceSelection = () => {
        const hasFormProgress = documents.length > 0 || fullName || email || phone || termsAccepted

        if (hasFormProgress) {
            confirm({
                title: 'Recomeçar Calculadora',
                message: 'Isso limpará o fluxo atual e os dados preenchidos. Deseja continuar?',
                confirmText: 'Recomeçar',
                danger: true,
                onConfirm: () => {
                    setDocuments([])
                    setUrgency('standard')
                    setExpandedDocs([])
                    setFullName('')
                    setEmail('')
                    setPhone('')
                    setTermsAccepted(false)
                    setTermsError(false)
                    setWhatsappSent(false)
                },
            })
            return
        }

        setDocuments([])
        setUrgency('standard')
        setExpandedDocs([])
        setTermsAccepted(false)
        setTermsError(false)
        setWhatsappSent(false)
    }

    const handleFileUpload = async (
        e: ChangeEvent<HTMLInputElement>,
        _specificId?: string,
        _fileType?: 'original' | 'translated'
    ) => {
        if (!e.target.files || e.target.files.length === 0) {
            return
        }

        if (serviceType === 'translation') {
            setIsAnalyzing(true)
            const newDocs: DocumentItem[] = []

            for (const file of Array.from(e.target.files)) {
                try {
                    const analysis = await analyzeDocument(file)
                    newDocs.push({
                        id: crypto.randomUUID(),
                        file,
                        fileName: file.name,
                        count: analysis.totalPages,
                        notarized: false,
                        analysis,
                        isSelected: true,
                        handwritten: false,
                    })
                } catch (err) {
                    console.error('Analysis failed', err)
                    newDocs.push({
                        id: crypto.randomUUID(),
                        file,
                        fileName: file.name,
                        count: 1,
                        notarized: false,
                        isSelected: true,
                        handwritten: false,
                    })
                }
            }

            setDocuments((prev) => [...prev, ...newDocs])
            setIsAnalyzing(false)
            toast.success('Documentos adicionados ao orçamento com sucesso!')
        } else if (serviceType === 'notarization') {
            const newDocs: DocumentItem[] = []

            for (const file of Array.from(e.target.files)) {
                newDocs.push({
                    id: crypto.randomUUID(),
                    file,
                    fileName: file.name,
                    count: 1,
                    notarized: true,
                    isSelected: true,
                    fileTranslated: undefined,
                })
            }

            setDocuments((prev) => [...prev, ...newDocs])
            toast.success('Pares de documentos adicionados com sucesso!')
        }
    }

    const updateNotaryPair = (id: string, file: File, type: 'original' | 'translated') => {
        setDocuments(
            documents.map((doc) => {
                if (doc.id === id) {
                    if (type === 'original') return { ...doc, file, fileName: file.name }
                    if (type === 'translated') return { ...doc, fileTranslated: file, fileNameTranslated: file.name }
                }
                return doc
            })
        )
    }

    const removeDocument = (id: string) => {
        const doc = documents.find((item) => item.id === id)
        if (!doc) return

        confirm({
            title: 'Remover Documento',
            message: `Tem certeza que deseja remover "${doc.fileName}" do orçamento?`,
            confirmText: 'Remover',
            danger: true,
            onConfirm: () => {
                setDocuments((prev) => prev.filter((item) => item.id !== id))
            },
        })
    }

    const clearAllDocuments = () => {
        confirm({
            title: 'Limpar Orçamento',
            message: 'Tem certeza que deseja limpar todo o orçamento atual?',
            confirmText: 'Limpar',
            danger: true,
            onConfirm: () => {
                setDocuments([])
                setUrgency('standard')
                toast.info('Orçamento reiniciado.')
            },
        })
    }

    const updateDocument = (id: string, field: keyof DocumentItem, value: any) => {
        setDocuments(documents.map((doc) => (doc.id === id ? { ...doc, [field]: value } : doc)))
    }

    useEffect(() => {
        const selectedDocs = documents.filter((doc) => doc.isSelected)

        let totalBaseBeforeFloor = 0
        let totalBaseAfterFloor = 0
        let totalPages = 0
        let notary = 0
        let minOrderApplied = false
        let totalMinimumAdjustment = 0
        let totalDiscountApplied = 0

        if (serviceType === 'translation') {
            let anyDocHitFloor = false

            selectedDocs.forEach((doc) => {
                let docPrice = 0

                if (doc.analysis) {
                    docPrice = doc.analysis.totalPrice
                    totalPages += doc.analysis.totalPages
                } else {
                    const base = globalSettings?.basePrice || 9.0
                    docPrice = (doc.count || 1) * base
                    totalPages += doc.count || 1
                }

                if (doc.handwritten) {
                    docPrice *= 1.25
                }

                totalBaseBeforeFloor += docPrice

                if (docPrice < 10.0) {
                    totalMinimumAdjustment += 10.0 - docPrice
                    docPrice = 10.0
                    anyDocHitFloor = true
                }

                totalBaseAfterFloor += docPrice
            })

            minOrderApplied = anyDocHitFloor
            notary = selectedDocs.reduce((acc, doc) => acc + (doc.notarized ? NOTARY_FEE_PER_DOC : 0), 0)
        } else if (serviceType === 'notarization') {
            totalBaseBeforeFloor = 0
            totalBaseAfterFloor = 0
            notary = selectedDocs.length * NOTARY_FEE_PER_DOC
            totalPages = selectedDocs.length
        }

        const baseWithUrgency = totalBaseAfterFloor * (URGENCY_MULTIPLIER[urgency] ?? 1.0)
        const urgencyPart = baseWithUrgency - totalBaseAfterFloor

        const volumeDiscountPercentage = 0
        const volumeDiscountAmount = 0

        let total = baseWithUrgency + notary

        if (urgency === 'standard' && paymentPlan === 'upfront_discount') {
            totalDiscountApplied = total * 0.05
            total = total * 0.95
        }

        setBreakdown({
            basePrice: totalBaseBeforeFloor,
            urgencyFee: urgencyPart,
            notaryFee: notary,
            totalDocs: selectedDocs.length,
            totalCount: totalPages,
            minOrderApplied,
            totalMinimumAdjustment,
            totalDiscountApplied,
            volumeDiscountPercentage,
            volumeDiscountAmount,
        })

        setTotalPrice(total)
    }, [
        documents,
        urgency,
        paymentPlan,
        serviceType,
        globalSettings?.basePrice,
        globalSettings?.notaryFee,
        globalSettings?.urgencyRate,
    ])

    const { basePrice, urgencyFee, notaryFee, totalCount, minOrderApplied, totalMinimumAdjustment, totalDiscountApplied } =
        breakdown

    const handleManualPayment = () => {
        if (whatsappSent || loading) return

        const selectedDocs = documents.filter((doc) => doc.isSelected)
        const brlOrderId = `BRL-${Date.now()}`
        const prazoText = urgency === 'standard' ? 'Standard 3-8 dias' : urgency === 'urgent' ? 'Express 48h' : 'Ultra Express 24h'
        const modText = paymentPlan === 'split' ? '50-50' : 'Integral'
        const message = encodeURIComponent(
            `Pedido #${brlOrderId} - Prazo: ${prazoText} - Modalidade: ${modText} - Valor Atual: $${totalPrice.toFixed(2)} USD`
        )
        const WHATSAPP_NUMBER = '14076396154'

        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank')
        setWhatsappSent(true)

        const selectedCount = selectedDocs.reduce((acc, doc) => acc + doc.count, 0)

        fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trigger: 'order_received',
                orderId: brlOrderId,
                customerName: fullName,
                customerEmail: email,
                pageCount: selectedCount,
                serviceType,
                urgency,
                totalAmount: totalPrice,
                paymentMethod: 'BRL_WHATSAPP',
            }),
        }).catch((err) => console.warn('[email] order_received fire failed:', err))

        fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trigger: 'brl_admin_alert',
                orderId: brlOrderId,
                customerName: fullName,
                customerEmail: email,
                customerPhone: phone,
                pageCount: selectedCount,
                serviceType,
                urgency,
                totalAmount: totalPrice,
            }),
        }).catch((err) => console.warn('[email] brl_admin_alert fire failed:', err))

        setTimeout(() => setWhatsappSent(false), 8000)
    }

    const handleSubmit = async () => {
        const selectedDocs = documents.filter((doc) => doc.isSelected)

        if (!fullName || !email || !phone) {
            toast.error('Por favor, preencha todos os seus dados de contato na etapa Seus Dados.')
            return
        }

        if (selectedDocs.length === 0) {
            toast.error('Por favor, selecione pelo menos um documento para o pagamento.')
            return
        }

        if (!termsAccepted) {
            setTermsError(true)
            toast.error('Você deve concordar com os Termos de Serviço para prosseguir.')
            setTimeout(() => setTermsError(false), 2000)
            return
        }

        const executeSubmit = async () => {
            if (paymentProvider === 'PARCELADO_USA') {
                handleManualPayment()
                return
            }

            setLoading(true)
            setUploadProgress(null)

            try {
                const docsWithFiles = selectedDocs.filter((doc) => doc.file)
                const uploadedDocs: Array<{ docIndex: number; url: string; fileName: string; contentType: string }> = []

                if (docsWithFiles.length > 0) {
                    for (let i = 0; i < docsWithFiles.length; i++) {
                        const doc = docsWithFiles[i]
                        setUploadProgress(`Enviando documentos… (${i + 1}/${docsWithFiles.length})`)

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
                        } else {
                            console.warn(`[upload] File upload failed for: ${doc.fileName}`)
                        }
                    }
                }

                setUploadProgress('Criando pedido…')

                const orderDocuments = selectedDocs.map((doc, idx) => {
                    const uploaded = uploadedDocs.find((item) => item.docIndex === idx)
                    return {
                        id: doc.id,
                        type: 'Uploaded File',
                        fileName: doc.fileName,
                        count: doc.count,
                        notarized: doc.notarized,
                        customDescription: doc.fileNameTranslated ? `Tradução: ${doc.fileNameTranslated}` : undefined,
                        uploadedFile: uploaded
                            ? { url: uploaded.url, fileName: uploaded.fileName, contentType: uploaded.contentType }
                            : undefined,
                    }
                })

                const orderResult = await createOrder({
                    user: { fullName, email, phone },
                    documents: orderDocuments,
                    urgency,
                    docCategory: 'standard',
                    notaryMode: 'none',
                    zipCode: '00000',
                    grandTotalOverride: totalPrice,
                    breakdown: { basePrice, notaryFee, urgencyFee, minOrderApplied, serviceType },
                    paymentProvider: 'STRIPE',
                    serviceType: serviceType,
                    sourceLanguage: docLanguage,
                })

                if (!orderResult.success || !orderResult.orderId) {
                    toast.error('Erro ao criar pedido. Tente novamente.')
                    setLoading(false)
                    setUploadProgress(null)
                    return
                }

                setUploadProgress('Redirecionando para pagamento…')

                const checkoutResult = await createCheckoutSession(orderResult.orderId)
                if (checkoutResult.success && checkoutResult.url) {
                    window.location.href = checkoutResult.url
                } else {
                    toast.error('Erro ao iniciar pagamento: ' + (checkoutResult.error || 'Tente novamente.'))
                    setLoading(false)
                    setUploadProgress(null)
                }
            } catch (error) {
                console.error('Checkout error:', error)
                toast.error('Falha ao processar pagamento. Verifique sua conexão.')
                setLoading(false)
                setUploadProgress(null)
            }
        }

        if (serviceType === 'notarization') {
            const incomplete = selectedDocs.some((doc) => !doc.file || !doc.fileTranslated)
            if (incomplete) {
                confirm({
                    title: 'Verificação de Pares',
                    message:
                        'Alguns documentos parecem estar sem o par (Original/Tradução). Deseja continuar o checkout assim mesmo?',
                    confirmText: 'Continuar',
                    onConfirm: executeSubmit,
                })
                return
            }
        }

        executeSubmit()
    }

    const isTranslation = serviceType === 'translation'
    const hasFormProgress = documents.length > 0 || fullName || email || phone || termsAccepted
    return (
        <div className="relative overflow-hidden rounded-3xl border border-slate-100/80 bg-white p-5 shadow-xl md:p-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(184,118,62,0.1),transparent_72%)]" />
            <div className="relative space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="grid flex-1 grid-cols-2 gap-2 rounded-2xl border border-[#E8D5C0]/80 bg-[#FAFAF8] p-1.5">
                    <button
                        type="button"
                        onClick={() => handleServiceSelection('translation')}
                        className={`rounded-[18px] px-3 py-3 text-left transition-all ${
                            isTranslation
                                ? 'bg-white shadow-md shadow-[#B8763E]/10 ring-1 ring-[#E8D5C0]'
                                : 'text-[#6B6560] hover:bg-white/70'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                                    isTranslation
                                        ? 'border-[#E8D5C0] bg-[#F5EDE3] text-[#B8763E]'
                                        : 'border-slate-200 bg-white text-slate-400'
                                }`}
                            >
                                <Globe className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-[#111110]">Tradução Certificada</p>
                                <p className="text-[11px] text-[#9C9A92]">Upload + análise por densidade</p>
                            </div>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleServiceSelection('notarization')}
                        className={`rounded-[18px] px-3 py-3 text-left transition-all ${
                            !isTranslation
                                ? 'bg-white shadow-md shadow-blue-100 ring-1 ring-blue-100'
                                : 'text-[#6B6560] hover:bg-white/70'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                                    !isTranslation
                                        ? 'border-blue-100 bg-blue-50 text-blue-600'
                                        : 'border-slate-200 bg-white text-slate-400'
                                }`}
                            >
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-[#111110]">Notarização Oficial</p>
                                <p className="text-[11px] text-[#9C9A92]">Validação + notário da Flórida</p>
                            </div>
                        </div>
                    </button>
                </div>

                    {hasFormProgress && (
                        <button
                            type="button"
                            onClick={resetServiceSelection}
                            className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#9C9A92] transition-colors hover:border-[#E8D5C0] hover:text-[#64625C]"
                        >
                            Recomeçar
                        </button>
                    )}
                </div>

                {isTranslation ? (
                    <div className="rounded-xl border border-[#E8D5C0] bg-[#F5EDE3] p-3">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setDocLanguage('PT_BR')}
                                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
                                    docLanguage === 'PT_BR'
                                        ? 'bg-[#B8763E] text-white shadow-md'
                                        : 'border border-slate-200 bg-white text-[#64625C] hover:border-[#B8763E]'
                                }`}
                            >
                                Portugues
                            </button>
                            <button
                                type="button"
                                onClick={() => setDocLanguage('ES')}
                                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
                                    docLanguage === 'ES'
                                        ? 'bg-[#B8763E] text-white shadow-md'
                                        : 'border border-slate-200 bg-white text-[#64625C] hover:border-[#B8763E]'
                                }`}
                            >
                                Espanol
                            </button>
                        </div>
                    </div>
                ) : null}

                {documents.length > 0 && (
                        <div className="space-y-3 mb-4">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <div className="text-xs font-bold uppercase tracking-widest text-[#C0C0C8]">Seus Documentos</div>
                                <button
                                    type="button"
                                    onClick={clearAllDocuments}
                                    className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#9C9A92] transition-colors hover:text-red-500"
                                >
                                    Limpar tudo
                                </button>
                            </div>
                            <AnimatePresence>
                                {documents.map((doc) => (
                                    <motion.div
                                        key={doc.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className={`rounded-2xl p-4 border border-slate-200/60 shadow-[0_2px_8px_-2px_rgba(30,41,59,0.08)] hover:shadow-[0_4px_12px_-2px_rgba(184,118,62,0.18)] flex flex-col gap-3 relative group transition-all duration-300 ${
                                            doc.isSelected ? 'bg-white opacity-100' : 'bg-slate-50 opacity-60 grayscale-[0.8]'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3 w-full">
                                                <div className="relative flex items-center justify-center p-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={doc.isSelected}
                                                        onChange={(e) => updateDocument(doc.id, 'isSelected', e.target.checked)}
                                                        className="w-5 h-5 accent-[#B8763E] rounded cursor-pointer z-10 opacity-0 absolute inset-0"
                                                    />
                                                    <div
                                                        className={`w-5 h-5 rounded border border-slate-300 shadow-sm flex items-center justify-center pointer-events-none transition-colors ${
                                                            doc.isSelected
                                                                ? 'bg-[#B8763E] border-[#B8763E] shadow-md shadow-[#B8763E]/15'
                                                                : 'bg-white'
                                                        }`}
                                                    >
                                                        {doc.isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                                    </div>
                                                </div>

                                                <div
                                                    className={`p-2 rounded-lg transition-colors ${
                                                        doc.isSelected ? 'bg-[#F5EDE3] text-[#B8763E]' : 'bg-slate-200 text-slate-500'
                                                    }`}
                                                >
                                                    <FileText className="h-5 w-5" />
                                                </div>

                                                <div className="overflow-hidden flex-1">
                                                    <div className="flex justify-between gap-3">
                                                        <h5
                                                            className={`font-bold text-sm truncate max-w-[200px] transition-colors ${
                                                                doc.isSelected ? 'text-[#1A1A1A]' : 'text-[#9C9A92]'
                                                            }`}
                                                            title={doc.fileName}
                                                        >
                                                            {doc.fileName}
                                                        </h5>
                                                        {serviceType === 'notarization' && (
                                                            <span className="text-sm font-bold text-green-600 shrink-0">$25.00</span>
                                                        )}
                                                    </div>

                                                    {serviceType === 'translation' ? (
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <p className="text-xs text-[#9C9A92]">{doc.count} páginas identificadas</p>
                                                            {doc.analysis && (
                                                                <button
                                                                    onClick={(e) => toggleDocExpand(doc.id, e)}
                                                                    className="text-xs text-[#B8763E] hover:underline flex items-center bg-[#F5EDE3] px-2 py-0.5 rounded transition-colors group-hover:bg-[#E8D5C0] border border-[#E8D5C0]"
                                                                >
                                                                    {expandedDocs.includes(doc.id) ? 'Ocultar Densidade' : 'Ver Densidade'}
                                                                    <ChevronDown
                                                                        className={`w-3 h-3 ml-0.5 transition-transform ${
                                                                            expandedDocs.includes(doc.id) ? 'rotate-180' : ''
                                                                        }`}
                                                                    />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-[#9C9A92] mt-1">Par Documental (Original + Tradução)</p>
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => removeDocument(doc.id)}
                                                className="text-slate-300 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded-full ml-2"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>

                                        <AnimatePresence>
                                            {serviceType === 'translation' && doc.isSelected && expandedDocs.includes(doc.id) && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="bg-white border border-slate-100 rounded-lg p-3 mt-2 shadow-inner text-xs text-[#64625C] space-y-2 overflow-hidden"
                                                >
                                                    {doc.analysis?.pages.map((page) => {
                                                        let label = 'Texto Completo'
                                                        let color = 'text-slate-800'
                                                        let barColor = 'bg-slate-800'
                                                        let isScanned = false

                                                        if (page.density === 'high') {
                                                            label = 'Alta Densidade'
                                                            color = 'text-slate-700'
                                                            barColor = 'bg-[#B8763E]'
                                                        }
                                                        if (page.density === 'low') {
                                                            label = 'Baixa Densidade'
                                                            color = 'text-green-600'
                                                            barColor = 'bg-green-500'
                                                        }
                                                        if (page.density === 'blank') {
                                                            label = 'Em Branco'
                                                            color = 'text-slate-400'
                                                            barColor = 'bg-slate-300'
                                                        }
                                                        if (page.density === 'scanned') {
                                                            label = 'Página Digitalizada (Imagem)'
                                                            color = 'text-amber-600'
                                                            barColor = 'bg-amber-500'
                                                            isScanned = true
                                                        }

                                                        return (
                                                            <div key={page.pageNumber}>
                                                                <div className="flex justify-between items-center border-b border-slate-100 last:border-0 pb-2 last:pb-0 pt-1.5">
                                                                    <div className="flex-1 pr-4">
                                                                        <span className="flex items-center gap-2 mb-1.5">
                                                                            <span className="font-mono text-slate-400 shrink-0">
                                                                                Pg {page.pageNumber}:
                                                                            </span>
                                                                            <span
                                                                                className={
                                                                                    isScanned
                                                                                        ? 'bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md font-medium border border-amber-100'
                                                                                        : `font-medium ${color}`
                                                                                }
                                                                            >
                                                                                {label}{' '}
                                                                                {page.density !== 'scanned' && (
                                                                                    <span className="opacity-70 font-normal">
                                                                                        ({(page.fraction * 100).toFixed(0)}%)
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        </span>
                                                                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden flex">
                                                                            <div
                                                                                className={`h-full ${barColor} transition-all duration-500`}
                                                                                style={{ width: `${page.fraction * 100}%` }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <span className={`font-bold ${color} shrink-0`}>${page.price.toFixed(2)}</span>
                                                                </div>
                                                                {isScanned && (
                                                                    <p className="text-[10px] text-amber-600/80 italic pl-8 leading-tight mb-1">
                                                                        * Texto em imagem requer formatação manual complexa. Valor padrão aplicado.
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                    {!doc.analysis && (
                                                        <div className="text-center italic text-slate-400 py-2">
                                                            Análise manual necessária na revisão. Preço base aplicado.
                                                        </div>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {serviceType === 'translation' && doc.isSelected && (
                                            <div className="flex flex-col gap-2 pt-2 border-t border-slate-50">
                                                <div
                                                    className="flex items-center justify-between group/handwritten cursor-pointer"
                                                    onClick={() => updateDocument(doc.id, 'handwritten', !doc.handwritten)}
                                                >
                                                    <span className="text-xs text-[#64625C] group-hover/handwritten:text-[#8B5E2F] transition-colors">
                                                        Documento Manuscrito? (+25%)
                                                    </span>
                                                    <div
                                                        className={`w-8 h-5 rounded-full p-0.5 transition-colors duration-300 ease-in-out ${
                                                            doc.handwritten ? 'bg-[#B8763E]' : 'bg-slate-300'
                                                        }`}
                                                    >
                                                        <div
                                                            className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ease-in-out ${
                                                                doc.handwritten ? 'translate-x-3' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </div>
                                                </div>

                                                <div
                                                    className="flex items-center justify-between group/notary cursor-pointer"
                                                    onClick={() => updateDocument(doc.id, 'notarized', !doc.notarized)}
                                                >
                                                    <span className="text-xs text-[#64625C] group-hover/notary:text-green-600 transition-colors">
                                                        Adicionar Notarizacao Oficial? (+$25)
                                                    </span>
                                                    <div
                                                        className={`w-8 h-5 rounded-full p-0.5 transition-colors duration-300 ease-in-out ${
                                                            doc.notarized ? 'bg-green-500' : 'bg-slate-300'
                                                        }`}
                                                    >
                                                        <div
                                                            className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ease-in-out ${
                                                                doc.notarized ? 'translate-x-3' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {serviceType === 'notarization' && doc.isSelected && (
                                            <div className="bg-slate-50 rounded-lg p-3 space-y-3 mt-1">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-400">
                                                        <FileText className="h-4 w-4" />
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <p className="text-xs font-bold text-[#64625C] truncate">{doc.fileName}</p>
                                                        <p className="text-[10px] text-[#9C9A92]">Documento Original</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className={`w-8 h-8 rounded border flex items-center justify-center text-slate-400 ${
                                                            doc.fileTranslated
                                                                ? 'bg-white border-slate-200'
                                                                : 'bg-[#F5EDE3] border-[#E8D5C0] border-dashed'
                                                        }`}
                                                    >
                                                        {doc.fileTranslated ? (
                                                            <CheckCircle className="h-4 w-4 text-green-500" />
                                                        ) : (
                                                            <Upload className="h-4 w-4 text-[#B8763E]" />
                                                        )}
                                                    </div>

                                                    <div className="flex-1 overflow-hidden relative">
                                                        {doc.fileTranslated ? (
                                                            <div>
                                                                <p className="text-xs font-bold text-[#64625C] truncate">
                                                                    {doc.fileNameTranslated}
                                                                </p>
                                                                <p className="text-[10px] text-[#9C9A92]">Tradução Anexada</p>
                                                            </div>
                                                        ) : (
                                                            <label className="cursor-pointer block">
                                                                <span className="text-xs font-bold text-[#B8763E] hover:underline">
                                                                    Anexar Tradução
                                                                </span>
                                                                <p className="text-[10px] text-[#9C9A92]">
                                                                    Clique para enviar o PDF traduzido
                                                                </p>
                                                                <input
                                                                    type="file"
                                                                    className="hidden"
                                                                    accept=".pdf"
                                                                    onChange={(e) => {
                                                                        if (e.target.files?.[0]) {
                                                                            updateNotaryPair(doc.id, e.target.files[0], 'translated')
                                                                        }
                                                                    }}
                                                                />
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}

                    <div className="mb-6">
                        <input
                            type="file"
                            id="file-upload"
                            className="hidden"
                            multiple
                            accept=".pdf, .jpg, .jpeg, .png"
                            onChange={handleFileUpload}
                        />

                        {documents.length === 0 ? (
                            <label
                                htmlFor="file-upload"
                                className="cursor-pointer block w-full p-8 border-2 border-dashed border-slate-300 rounded-2xl hover:border-[#B8763E] hover:bg-[#F5EDE3] transition-all text-center group"
                            >
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-white group-hover:text-[#B8763E] text-slate-400 transition-colors shadow-sm">
                                    <Upload className="h-8 w-8" />
                                </div>
                                <h4 className="text-lg font-bold text-[#64625C] mb-1">
                                    {serviceType === 'notarization' ? 'Adicionar Par de Documentos' : 'Clique para Anexar Arquivos'}
                                </h4>
                                <p className="text-sm text-[#9C9A92]">
                                    {isAnalyzing ? (
                                        <span className="flex items-center justify-center gap-2 text-[#B8763E] animate-pulse">
                                            <div className="animate-spin h-3 w-3 border-b-2 border-[#B8763E] rounded-full" />
                                            A analisar densidade do documento...
                                        </span>
                                    ) : serviceType === 'notarization' ? (
                                        'Inicie com o Documento Original (PDF)'
                                    ) : (
                                        'PDF, JPG ou PNG com leitura automatica por IA'
                                    )}
                                </p>
                            </label>
                        ) : (
                            <label
                                htmlFor="file-upload"
                                className="cursor-pointer flex items-center justify-center gap-2 w-full p-3 border border-dashed border-slate-300 rounded-xl hover:border-[#B8763E] hover:bg-[#F5EDE3] transition-all text-[#64625C] font-medium text-sm group"
                            >
                                <Plus className="h-4 w-4 text-slate-400 group-hover:text-[#B8763E]" />
                                {isAnalyzing ? 'A analisar densidade...' : serviceType === 'notarization' ? 'Adicionar Novo Par' : 'Adicionar outro documento'}
                            </label>
                        )}
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                        <div className="flex flex-col md:flex-row md:justify-between md:items-center text-sm gap-3">
                            <span className="text-[#64625C] font-medium whitespace-nowrap">Prazo:</span>
                            <div className="flex flex-col sm:flex-row w-full bg-white rounded-lg p-1 border border-slate-200 shadow-sm gap-1">
                                {(
                                    [
                                        { id: 'standard', label: 'Standard (3-8 dias)' },
                                        { id: 'urgent', label: 'Express (48h)' },
                                        { id: 'flash', label: 'Ultra Express (24h)' },
                                    ] as const
                                ).map(({ id, label }) => (
                                    <button
                                        key={id}
                                        onClick={() => {
                                            setUrgency(id)
                                            if (id !== 'standard') {
                                                setPaymentPlan('upfront')
                                            } else if (paymentPlan === 'upfront') {
                                                setPaymentPlan('upfront_discount')
                                            }
                                        }}
                                        className={`w-full sm:flex-1 px-3 py-3 sm:py-2 rounded-md text-xs transition-all ${
                                            urgency === id
                                                ? 'bg-[#B8763E] text-white shadow-md shadow-[#B8763E]/20 font-bold'
                                                : 'text-[#64625C] bg-slate-50 hover:bg-slate-100'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <AnimatePresence>
                            {urgency === 'standard' && (
                                <motion.div
                                    key="payment-plan"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="overflow-hidden"
                                >
                                    <div className="pt-2 border-t border-slate-200">
                                        <span className="text-xs font-medium text-[#9C9A92] block mb-2">Modalidade de Pagamento:</span>
                                        <div className="grid grid-cols-2 gap-2">
                                            {([
                                                { id: 'upfront_discount', label: 'Integral', sub: '5% OFF' },
                                                { id: 'split', label: '50 / 50', sub: 'Preço cheio' },
                                            ] as const).map(({ id, label, sub }) => (
                                                <button
                                                    key={id}
                                                    onClick={() => setPaymentPlan(id)}
                                                    className={`flex flex-col items-center justify-center p-3 sm:p-2 rounded-lg border text-xs transition-all ${
                                                        paymentPlan === id
                                                            ? 'border-[#B8763E] bg-[#B8763E]/10 text-[#B8763E] font-bold'
                                                            : 'border-slate-200 bg-white text-[#9C9A92] hover:border-slate-300'
                                                    }`}
                                                >
                                                    <span className="font-bold text-sm">{label}</span>
                                                    <span className="text-[10px] opacity-70 mt-0.5">{sub}</span>
                                                </button>
                                            ))}
                                        </div>
                                        {paymentPlan === 'upfront_discount' && (
                                            <p className="text-[10px] text-green-600 font-bold mt-2 text-center">
                                                5% de desconto aplicado no total
                                            </p>
                                        )}
                                        {paymentPlan === 'split' && (
                                            <p className="text-[10px] text-blue-600 font-medium mt-2 text-center">
                                                50% agora · 50% na entrega dos documentos
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {urgency !== 'standard' && (
                                <motion.div
                                    key="upfront-badge"
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
                                >
                                        <span className="text-amber-600 text-xs font-bold">
                                            Pagamento 100% Upfront obrigatório para este prazo.
                                        </span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="h-px bg-slate-200" />

                        <div className="space-y-3">
                            <h4 className="text-xs font-bold text-[#9C9A92] uppercase">Seus Dados</h4>
                            <div className="flex flex-col gap-3">
                                <input
                                    type="text"
                                    placeholder="Nome"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full p-3 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-[#B8763E] min-h-[44px]"
                                />
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full p-3 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-[#B8763E] min-h-[44px]"
                                />
                                <input
                                    type="tel"
                                    placeholder="Telefone"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full p-3 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-[#B8763E] min-h-[44px]"
                                />
                            </div>
                        </div>

                        <div className="h-px bg-slate-200" />

                        <div className="flex flex-col sm:flex-row gap-3">
                            <div
                                onClick={() => setPaymentProvider('STRIPE')}
                                className={`flex-1 p-3 sm:p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-center gap-2 text-xs font-bold min-h-[44px] ${
                                    paymentProvider === 'STRIPE'
                                        ? 'border-[#B8763E] bg-[#B8763E]/10 text-[#B8763E]'
                                        : 'border-slate-200 bg-white text-[#9C9A92]'
                                }`}
                            >
                                <Globe className="h-4 w-4 sm:h-3 sm:w-3" /> USD (Card)
                            </div>
                            <div
                                onClick={() => setPaymentProvider('PARCELADO_USA')}
                                className={`flex-1 p-3 sm:p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-center gap-2 text-xs font-bold min-h-[44px] ${
                                    paymentProvider === 'PARCELADO_USA'
                                        ? 'border-[#B8763E] bg-[#B8763E]/10 text-[#B8763E]'
                                        : 'border-slate-200 bg-white text-[#9C9A92]'
                                }`}
                            >
                                <Smartphone className="h-4 w-4 sm:h-3 sm:w-3" /> BRL (Pix/12x)
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        {isAnalyzing ? (
                            <div className="flex flex-col items-center justify-center py-6 space-y-3 text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B8763E]" />
                                <p className="text-xs text-[#9C9A92] font-medium animate-pulse">
                                    {serviceType === 'notarization' ? 'A preparar a etapa de notarizacao...' : 'A analisar densidade do documento...'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                    <h4 className="text-xs font-bold uppercase tracking-wide text-[#9C9A92]">Detalhes do Orçamento</h4>
                                </div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between text-[#64625C]">
                                        <span>Documentos ({documents.length})</span>
                                        <span>{totalCount} {serviceType === 'notarization' ? 'itens' : 'páginas'}</span>
                                    </div>

                                    {serviceType === 'translation' && (
                                        <div className="flex justify-between text-[#64625C]">
                                            <span>Subtotal da Tradução (Densidade)</span>
                                            <span className="font-medium">${basePrice.toFixed(2)}</span>
                                        </div>
                                    )}

                                    {notaryFee > 0 && (
                                        <div className="flex justify-between text-green-600">
                                            <span>{serviceType === 'notarization' ? 'Notarização (BlueNotary)' : 'Notarização Oficial'}</span>
                                            <span className="font-medium font-bold">+${notaryFee.toFixed(2)}</span>
                                        </div>
                                    )}

                                    {urgency !== 'standard' && (
                                        <div className="flex justify-between text-[#B8763E]">
                                            <span>Taxa de Urgência ({urgency === 'urgent' ? '48h' : '24h'})</span>
                                            <span className="font-bold">+${urgencyFee.toFixed(2)}</span>
                                        </div>
                                    )}

                                    {minOrderApplied && (
                                        <div className="flex justify-between text-blue-600 bg-blue-50 p-1 rounded">
                                            <span>Ajuste de Custo Operacional (Mínimo)</span>
                                            <span className="font-bold">+${totalMinimumAdjustment.toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="h-px bg-slate-200 my-2" />

                                <div className="space-y-1 pb-2 mb-2 border-b border-slate-100 border-dashed">
                                    <div className="flex justify-between text-[#9C9A92] text-sm">
                                        <span>Subtotal Base</span>
                                        <span>${(totalPrice + totalDiscountApplied).toFixed(2)}</span>
                                    </div>
                                    {totalDiscountApplied > 0 && (
                                        <div className="flex justify-between text-green-600 bg-green-50 p-1 rounded text-sm mt-1">
                                            <span>Desconto Pagamento Integral (5%)</span>
                                            <span className="font-bold">-${totalDiscountApplied.toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-end justify-between pt-1">
                                    <span className="text-[#64625C] font-medium text-sm">Total Estimado</span>
                                    <div className="text-right">
                                        <span className="block text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-[#1A1A1A] to-[#B8763E] leading-none">
                                            ${totalPrice.toFixed(2)}
                                        </span>
                                        {paymentProvider === 'PARCELADO_USA' && (
                                            <span className="text-[10px] text-green-600 font-bold block mt-1">
                                                aprox. R$ {(totalPrice * 5.2).toFixed(2)} (Pix)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {whatsappSent && (
                        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="shrink-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                                <Check className="h-4 w-4 text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-green-800">Solicitação Enviada!</p>
                                <p className="text-xs text-green-700 mt-0.5 leading-snug">
                                    Um consultor entrará em contato em instantes com seu link de pagamento parcelado.
                                    Verifique o WhatsApp.
                                </p>
                            </div>
                        </div>
                    )}

                    <div
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                            termsError ? 'bg-red-50 border-red-300 animate-pulse' : 'bg-transparent border-transparent'
                        }`}
                    >
                        <input
                            type="checkbox"
                            id="termsCheckbox"
                            checked={termsAccepted}
                            onChange={(e) => {
                                setTermsAccepted(e.target.checked)
                                if (e.target.checked) setTermsError(false)
                            }}
                            className="mt-1 w-4 h-4 text-[#B8763E] border-slate-300 rounded focus:ring-[#B8763E] cursor-pointer"
                        />
                        <label
                            htmlFor="termsCheckbox"
                            className={`text-xs cursor-pointer select-none leading-relaxed ${
                                termsError ? 'text-red-700 font-medium' : 'text-[#64625C]'
                            }`}
                        >
                            Declaro que as informações e documentos enviados são verdadeiros e concordo com os{' '}
                            <a
                                href="/termos"
                                target="_blank"
                                className="underline hover:text-[#B8763E] font-medium"
                                onClick={(e) => e.stopPropagation()}
                            >
                                Termos de Serviço e Política de Privacidade.
                            </a>
                        </label>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={loading || totalPrice === 0 || (serviceType === 'notarization' && documents.some((doc) => !doc.fileTranslated))}
                        className="w-full bg-[#B8763E] hover:bg-[#9A6232] text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                    >
                        {loading ? (
                            uploadProgress ?? 'Processando...'
                        ) : paymentProvider === 'PARCELADO_USA' ? (
                            <>
                                <Smartphone className="h-5 w-5" /> Solicitar Link via WhatsApp
                            </>
                        ) : (
                            <>
                                Ir para Pagamento (Checkout) <ArrowRight className="h-5 w-5" />
                            </>
                        )}
                    </button>
            </div>
        </div>
    )
}
