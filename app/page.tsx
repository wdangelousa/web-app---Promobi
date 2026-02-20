'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createOrder } from './actions/create-order'
import { createCheckoutSession } from './actions/checkout'
import { processParceladoPayment } from './actions/processParceladoPayment'
import {
    CheckCircle,
    ArrowRight,
    Upload,
    CreditCard,
    FileText,
    ShieldCheck,
    Plus,
    Trash2,
    FileUp,
    Smartphone,
    Globe,
    Lock,
    Zap,
    Users,
    ChevronDown,
    Star,
    Check,
    Menu,
    X
} from 'lucide-react'

// Types
import { analyzeDocument, DocumentAnalysis } from '../lib/documentAnalyzer'

type DocumentItem = {
    id: string;
    file?: File; // Actual file object
    fileName: string; // Display name
    count: number; // Pages (from analysis)
    notarized: boolean; // Upsell toggle
    analysis?: DocumentAnalysis; // New field for density data
    isSelected: boolean; // New: Selection state
    handwritten?: boolean; // New field for surcharge
    // New fields for Notarization Only flow
    fileTranslated?: File;
    fileNameTranslated?: string;
}

export default function Home() {
    // --- STATE & LOGIC ---
    const [serviceType, setServiceType] = useState<'translation' | 'notarization' | null>(null)
    const [documents, setDocuments] = useState<DocumentItem[]>([])
    // We can reuse 'documents' for both, but might need a union type or distinct state if they diverge too much.
    // For 'notarization', we need pairs. Let's try to fit it into DocumentItem or make a separate state?
    // User wants "Card B: Para cada item, peça dois uploads".
    // Let's use a unified specific type for Notary items if needed, but 'documents' is typed as DocumentItem[].
    // Let's extend DocumentItem to optional fields for Notary flow.

    const [urgency, setUrgency] = useState('normal') // normal, urgent, super_urgent
    const [totalPrice, setTotalPrice] = useState(0)

    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [paymentProvider, setPaymentProvider] = useState<'STRIPE' | 'PARCELADO_USA'>('STRIPE')
    const [loading, setLoading] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [whatsappSent, setWhatsappSent] = useState(false)
    const [breakdown, setBreakdown] = useState({
        basePrice: 0,
        urgencyFee: 0,
        notaryFee: 0,
        totalDocs: 0,
        totalCount: 0,
        minOrderApplied: false
    })

    const [activeFaq, setActiveFaq] = useState<number | null>(null)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const router = useRouter()

    const NOTARY_FEE_PER_DOC = 25.00
    const MIN_ORDER_VALUE = 10.00
    const URGENCY_MULTIPLIER: Record<string, number> = {
        normal: 1.0,
        urgent: 1.3, // +30%
        super_urgent: 1.6 // +60%
    }

    // --- HANDLERS ---

    const handleServiceSelection = (type: 'translation' | 'notarization') => {
        setServiceType(type)
        setDocuments([]) // Clear previous state on switch
        setUrgency('normal')
    }

    const resetServiceSelection = () => {
        if (documents.length > 0) {
            if (!confirm("Isso limpará seu orçamento atual. Deseja continuar?")) return
        }
        setServiceType(null)
        setDocuments([])
        setUrgency('normal')
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, specificId?: string, fileType?: 'original' | 'translated') => {
        if (e.target.files && e.target.files.length > 0) {

            // FLOW A: TRANSLATION (Existing Logic)
            if (serviceType === 'translation') {
                setIsAnalyzing(true)
                const newDocs: DocumentItem[] = []

                for (const file of Array.from(e.target.files)) {
                    try {
                        const analysis = await analyzeDocument(file)
                        newDocs.push({
                            id: crypto.randomUUID(),
                            file: file,
                            fileName: file.name,
                            count: analysis.totalPages,
                            notarized: false,
                            analysis: analysis,
                            isSelected: true,
                            handwritten: false
                        })
                    } catch (err) {
                        console.error("Analysis failed", err)
                        // Fallback
                        newDocs.push({
                            id: crypto.randomUUID(),
                            file: file,
                            fileName: file.name,
                            count: 1,
                            notarized: false,
                            isSelected: true,
                            handwritten: false
                        })
                    }
                }
                setDocuments(prev => [...prev, ...newDocs])
                setIsAnalyzing(false)

            }
            // FLOW B: NOTARIZATION (New Logic)
            else if (serviceType === 'notarization') {
                // In Notarization flow, we might add empty slots first OR handle direct upload if we change UI.
                // Plan: "Para cada item, peça dois uploads".
                // If specificId is provided, we are updating a slot.
                // If not, maybe we are adding a new pair? 

                // Let's assume the UI creates a "slot" first or we just add a new item with one file and ask for the second?
                // Better UX: "Adicionar Par de Documentos" button adds a visually empty slot, then user uploads.
                // OR: Input adds a new slot with the uploaded file as 'Original' by default?
                // Let's go with: Input adds a new item.

                // Only support adding new items via the main input for now, specific slots handled separately.
                const newDocs: DocumentItem[] = []
                for (const file of Array.from(e.target.files)) {
                    newDocs.push({
                        id: crypto.randomUUID(),
                        // We store the original here. The translated file will be added to specific slot.
                        file: file,
                        fileName: file.name,
                        count: 1, // Doesn't matter for price
                        notarized: true, // Always true for this flow
                        isSelected: true,
                        // Custom fields for Notion flow would be cleaner if typed, checking dynamic support
                        fileTranslated: undefined
                    } as DocumentItem)
                }
                setDocuments(prev => [...prev, ...newDocs])
            }
        }
    }

    // Helper for Notarization Pair Upload (Secondary file)
    // We need to extend DocumentItem type or cast usage. 
    // Let's update the Type definition first in a separate block or assume we patch it.
    // I will patch the DocumentItem type in the next tool call at the top of file.

    const updateNotaryPair = (id: string, file: File, type: 'original' | 'translated') => {
        setDocuments(documents.map(d => {
            if (d.id === id) {
                if (type === 'original') return { ...d, file: file, fileName: file.name }
                if (type === 'translated') return { ...d, fileTranslated: file, fileNameTranslated: file.name }
            }
            return d
        }))
    }

    const removeDocument = (id: string) => {
        setDocuments(documents.filter(d => d.id !== id))
    }

    const clearAllDocuments = () => {
        if (confirm("Tem certeza que deseja limpar todo o orçamento?")) {
            setDocuments([])
            setUrgency('normal')
        }
    }

    const updateDocument = (id: string, field: keyof DocumentItem, value: any) => {
        setDocuments(documents.map(d =>
            d.id === id ? { ...d, [field]: value } : d
        ))
    }

    useEffect(() => {
        const selectedDocs = documents.filter(d => d.isSelected)

        let totalBase = 0
        let totalPages = 0
        let notary = 0

        if (serviceType === 'translation') {
            // 1. Calculate Base Price (Sum of density prices per page)
            selectedDocs.forEach(doc => {
                let docPrice = 0;
                if (doc.analysis) {
                    docPrice = doc.analysis.totalPrice
                    totalPages += doc.analysis.totalPages
                } else {
                    // Fallback to $9.00 per page
                    docPrice = (doc.count || 1) * 9.00
                    totalPages += (doc.count || 1)
                }

                // Handwritten Surcharge: +25% on this document's base price
                if ((doc as any).handwritten) {
                    docPrice *= 1.25
                }

                totalBase += docPrice
            })
            // 2. Calculate Notary Fee ($25 per notarized doc)
            notary = selectedDocs.reduce((acc, doc) => acc + (doc.notarized ? NOTARY_FEE_PER_DOC : 0), 0)
        } else if (serviceType === 'notarization') {
            // Flat fee per document slot ($25)
            totalBase = 0
            notary = selectedDocs.length * NOTARY_FEE_PER_DOC
            totalPages = selectedDocs.length
        }

        // 3. Calculate Urgency Fee (Applied to Base Translation Cost)
        const baseWithUrgency = totalBase * URGENCY_MULTIPLIER[urgency]

        // Urgency Fee Component
        const urgencyPart = baseWithUrgency - totalBase

        let total = baseWithUrgency + notary
        let minOrderApplied = false

        // 4. Minimum Order Rule (Only if there are selected docs and total > 0)
        if (selectedDocs.length > 0 && total < MIN_ORDER_VALUE) {
            total = MIN_ORDER_VALUE
            minOrderApplied = true
        }

        setBreakdown({
            basePrice: totalBase,
            urgencyFee: urgencyPart,
            notaryFee: notary,
            totalDocs: selectedDocs.length,
            totalCount: totalPages,
            minOrderApplied
        })

        setTotalPrice(total)
    }, [documents, urgency, URGENCY_MULTIPLIER, serviceType])

    // Derived values for breakdown (using state for consistency)
    const { basePrice, urgencyFee, notaryFee, totalCount, minOrderApplied } = breakdown

    // ── Manual WhatsApp Concierge for BRL payments ────────────────────────────
    const handleManualPayment = () => {
        const selectedDocs = documents.filter(d => d.isSelected)
        const hasNotarization = selectedDocs.some(d => d.notarized) || serviceType === 'notarization'
        const dollarAmount = totalPrice.toFixed(2)
        const brlEstimate = (totalPrice * 5.2).toFixed(2)
        const docSummary = serviceType === 'notarization'
            ? `${selectedDocs.length} documento(s) para Notarização`
            : `${selectedDocs.reduce((acc, d) => acc + d.count, 0)} página(s) para Tradução Certificada${hasNotarization ? ' + Notarização' : ''}`
        const urgencyLabel = urgency === 'urgent' ? ' (Urgente – 24h)' : urgency === 'super_urgent' ? ' (Super Urgente – 12h)' : ''

        const message = encodeURIComponent(
            `Olá! Gostaria de solicitar o link de pagamento em Reais para meu pedido.\n\n` +
            `📋 Resumo do Pedido:\n` +
            `• ${docSummary}${urgencyLabel}\n` +
            `• Valor: $${dollarAmount} USD (aprox. R$ ${brlEstimate})\n\n` +
            `👤 Dados:\n` +
            `• Nome: ${fullName}\n` +
            `• E-mail: ${email}\n\n` +
            `Aguardo o link de pagamento via Pix ou Parcelado. Obrigado(a)!`
        )

        const WHATSAPP_NUMBER = '14076396154'
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank')
        setWhatsappSent(true)

        // ── Fire "Order Received" email silently (fire-and-forget) ────────────
        const selectedCount = selectedDocs.reduce((acc, d) => acc + d.count, 0)
        fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trigger: 'order_received',
                orderId: `BRL-${Date.now()}`,
                customerName: fullName,
                customerEmail: email,
                pageCount: selectedCount,
                serviceType,
                urgency,
                totalAmount: totalPrice,
                paymentMethod: 'BRL_WHATSAPP',
            }),
        }).catch(err => console.warn('[email] order_received fire failed:', err))

        // Auto-dismiss the toast after 8 seconds
        setTimeout(() => setWhatsappSent(false), 8000)
    }

    const handleSubmit = async () => {
        const selectedDocs = documents.filter(d => d.isSelected)

        if (!fullName || !email || !phone) {
            alert('Por favor, preencha seus dados de contato.')
            return
        }

        if (selectedDocs.length === 0) {
            alert('Por favor, selecione pelo menos um documento para pagamento.')
            return
        }

        // Validate Notarization Pairs
        if (serviceType === 'notarization') {
            const incomplete = selectedDocs.some(d => !d.file || !(d as any).fileTranslated)
            if (incomplete) {
                if (!confirm("Alguns documentos parecem estar sem o par (Original/Tradução). Deseja continuar mesmo assim?")) return
            }
        }

        // ── BRL flow: WhatsApp concierge (no API call needed) ─────────────────
        if (paymentProvider === 'PARCELADO_USA') {
            handleManualPayment()
            return
        }

        // ── USD/Stripe flow: create order + redirect to Stripe Checkout ────────
        setLoading(true)

        try {
            const orderData = {
                user: { fullName, email, phone },
                documents: selectedDocs.map(d => ({
                    id: d.id,
                    type: 'Uploaded File',
                    fileName: d.fileName,
                    count: d.count,
                    notarized: d.notarized,
                    customDescription: (d as any).fileNameTranslated
                        ? `Tradução: ${(d as any).fileNameTranslated}`
                        : undefined
                })),
                urgency,
                docCategory: 'standard' as const,
                notaryMode: 'none' as const,
                zipCode: '00000',
                grandTotalOverride: totalPrice,
                breakdown: { basePrice, notaryFee, urgencyFee, minOrderApplied, serviceType },
                paymentProvider: 'STRIPE' as const
            }

            const orderResult = await createOrder(orderData)

            if (!orderResult.success || !orderResult.orderId) {
                alert('Erro ao criar pedido. Tente novamente.')
                setLoading(false)
                return
            }

            const checkoutResult = await createCheckoutSession(orderResult.orderId)
            if (checkoutResult.success && checkoutResult.url) {
                window.location.href = checkoutResult.url
            } else {
                alert('Erro ao iniciar pagamento: ' + (checkoutResult.error || 'Tente novamente.'))
                setLoading(false)
            }
        } catch (error) {
            console.error('Checkout error:', error)
            alert('Falha ao processar pagamento. Verifique sua conexão.')
            setLoading(false)
        }
    }

    // --- ANIMATION VARIANTS ---
    const fadeInUp = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
    }

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.2
            }
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-[#f58220]/20">
            {/* --- HEADER --- */}
            <motion.header
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100"
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-24 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Image src="/logo.png" width={320} height={110} alt="Promobi" className="object-contain h-16 md:h-20 w-auto" />
                    </div>

                    {/* Desktop Nav */}
                    <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
                        <Link href="/" className="hover:text-[#f58220] transition-colors">Início</Link>
                        <Link href="/upload" className="hover:text-[#f58220] transition-colors">Enviar Documentos</Link>
                        <a href="/admin/orders" className="text-slate-900 border border-slate-200 px-4 py-2 rounded-full hover:bg-slate-50 transition-colors">Área Administrativa</a>
                    </nav>

                    {/* Mobile Menu Button */}
                    <button
                        className="md:hidden p-2 text-slate-600 hover:text-[#f58220] transition-colors"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    </button>
                </div>

                {/* Mobile Menu Overlay */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="md:hidden bg-white border-t border-gray-100 overflow-hidden"
                        >
                            <nav className="flex flex-col p-4 space-y-4 text-sm font-medium text-slate-600">
                                <Link
                                    href="/"
                                    className="p-2 hover:bg-slate-50 rounded-lg transition-colors"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    Início
                                </Link>
                                <Link
                                    href="/upload"
                                    className="p-2 hover:bg-slate-50 rounded-lg transition-colors"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    Enviar Documentos
                                </Link>
                                <a
                                    href="/admin/orders"
                                    className="p-2 text-[#f58220] font-bold bg-orange-50 rounded-lg transition-colors flex items-center gap-2"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <Lock className="h-4 w-4" /> Área Administrativa
                                </a>
                            </nav>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.header>

            {/* --- HERO SECTION --- */}
            <main className="pt-32 pb-16 lg:pt-48 lg:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                <div className="grid lg:grid-cols-2 gap-16 items-start">

                    {/* Left: Copy */}
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={staggerContainer}
                        className="space-y-8 pt-8 lg:pt-16"
                    >
                        <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full text-blue-800 text-xs font-bold tracking-wide uppercase">
                            <ShieldCheck className="h-3 w-3" />
                            Notarização Oficial na Flórida
                        </motion.div>

                        <motion.h1 variants={fadeInUp} className="text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
                            Traduções Certificadas com a <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f58220] to-orange-600">Velocidade da Tecnologia.</span>
                        </motion.h1>

                        <motion.p variants={fadeInUp} className="text-lg text-slate-600 max-w-xl leading-relaxed">
                            Unimos a precisão técnica de alto nível com a conveniência da notarização oficial imediata. Documentos prontos para imigração (USCIS) e negócios em tempo recorde.
                        </motion.p>

                        <motion.div variants={fadeInUp} className="flex gap-4">
                            <Link href="/upload" className="bg-[#f58220] hover:bg-orange-600 text-white px-8 py-4 rounded-full font-bold text-lg shadow-lg hover:shadow-orange-200 transition-all active:scale-95 flex items-center gap-2">
                                Traduzir Agora <ArrowRight className="h-5 w-5" />
                            </Link>
                        </motion.div>

                        {/* Integrated Authority Seals */}
                        <motion.div variants={fadeInUp} className="pt-8 flex items-center gap-8 opacity-100 transition-all duration-500">
                            <Image src="/logo-notary.png" width={300} height={120} alt="Florida Notary" className="h-24 md:h-32 w-auto object-contain" />
                            <div className="h-12 w-px bg-slate-200"></div>
                            <Image src="/logo-ata.png" width={300} height={120} alt="ATA Member" className="h-24 md:h-32 w-auto object-contain" />
                        </motion.div>
                    </motion.div>

                    {/* Right: The Calculator Card */}
                    <motion.div
                        id="calculator"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="bg-white rounded-3xl shadow-lg border border-slate-100 p-6 md:p-8 relative overflow-hidden"
                    >
                        {!serviceType ? (
                            // --- STEP 1: SERVICE TYPE SELECTION ---
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-2xl font-bold text-slate-900">Comece seu Pedido</h3>
                                    <p className="text-sm text-slate-500">Qual serviço você precisa hoje?</p>
                                </div>
                                <div className="grid gap-4">
                                    {/* CARD A: TRANSLATION */}
                                    <button
                                        onClick={() => handleServiceSelection('translation')}
                                        className="text-left group relative flex items-start gap-4 p-6 rounded-2xl border-2 border-slate-100 hover:border-[#f58220] hover:shadow-lg hover:shadow-orange-100 hover:bg-white transition-all active:scale-[0.98]"
                                    >
                                        <div className="bg-orange-50 text-orange-600 border border-orange-100 p-3 rounded-xl shrink-0 group-hover:scale-110 transition-transform">
                                            <Globe className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900 group-hover:text-[#f58220] transition-colors">Preciso Traduzir e Certificar</h4>
                                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                                Quero o serviço completo. Envio o documento original e vocês traduzem e certificam (USCIS).
                                            </p>
                                        </div>
                                    </button>

                                    {/* CARD B: NOTARIZATION ONLY */}
                                    <button
                                        onClick={() => handleServiceSelection('notarization')}
                                        className="text-left group relative flex items-start gap-4 p-6 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-100 hover:bg-white transition-all active:scale-[0.98]"
                                    >
                                        <div className="bg-blue-50 text-blue-600 border border-blue-100 p-3 rounded-xl shrink-0 group-hover:scale-110 transition-transform">
                                            <ShieldCheck className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Já tenho a tradução, quero apenas Notarizar</h4>
                                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                                Tenho o PDF traduzido pronto. Preciso apenas da notarização da assinatura.
                                            </p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            // --- STEP 2: CALCULATOR INTERFACE ---
                            <>
                                <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end">
                                    <div>
                                        <button
                                            onClick={resetServiceSelection}
                                            className="text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1 transition-colors"
                                        >
                                            <ArrowRight className="h-3 w-3 rotate-180" /> Voltar
                                        </button>
                                        <h3 className="text-2xl font-bold text-slate-900">
                                            {serviceType === 'translation' ? 'Orçamento de Tradução' : 'Orçamento de Notarização'}
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                            {serviceType === 'translation' ? 'Configure seu pedido em segundos.' : 'Upload dos pares de documentos.'}
                                        </p>
                                    </div>
                                    {documents.length > 0 && (
                                        <button
                                            onClick={clearAllDocuments}
                                            className="text-xs text-red-500 hover:text-red-700 hover:underline flex items-center gap-1 transition-colors"
                                        >
                                            <Trash2 className="h-3 w-3" /> Limpar
                                        </button>
                                    )}
                                </div>

                                {/* --- WARNING FOR NOTARIZATION FLOW --- */}
                                {serviceType === 'notarization' && (
                                    <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 text-sm text-blue-800">
                                        <ShieldCheck className="h-5 w-5 shrink-0" />
                                        <p className="leading-snug">
                                            Para notarizações de terceiros, utilizamos a plataforma segura <strong>BlueNotary</strong>.
                                            Você receberá o link para a sessão de vídeo após o pagamento.
                                        </p>
                                    </div>
                                )}

                                {/* --- DOCUMENT LIST (Stack) --- */}
                                {documents.length > 0 && (
                                    <div className="space-y-3 mb-4">
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Seus Documentos</div>
                                        <AnimatePresence>
                                            {documents.map((doc, index) => (
                                                <motion.div
                                                    key={doc.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className={`rounded-2xl p-4 border border-slate-200/60 shadow-[0_2px_8px_-2px_rgba(30,41,59,0.08)] hover:shadow-[0_4px_12px_-2px_rgba(245,130,32,0.15)] flex flex-col gap-3 relative group transition-all duration-300 ${doc.isSelected
                                                        ? 'bg-white opacity-100'
                                                        : 'bg-gray-50 opacity-60 grayscale-[0.8]'
                                                        }`}
                                                >
                                                    {/* Header Line */}
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-center gap-3 w-full">
                                                            {/* Checkbox Selection */}
                                                            <div className="relative flex items-center justify-center p-1">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={doc.isSelected}
                                                                    onChange={(e) => updateDocument(doc.id, 'isSelected', e.target.checked)}
                                                                    className="w-5 h-5 accent-[#f58220] rounded cursor-pointer z-10 opacity-0 absolute inset-0"
                                                                />
                                                                <div className={`w-5 h-5 rounded border border-slate-300 shadow-sm flex items-center justify-center pointer-events-none transition-colors ${doc.isSelected ? 'bg-[#f58220] border-[#f58220] shadow-md shadow-orange-100' : 'bg-white'}`}>
                                                                    {doc.isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                                                </div>
                                                            </div>

                                                            <div className={`p-2 rounded-lg transition-colors ${doc.isSelected ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-500'}`}>
                                                                <FileText className="h-5 w-5" />
                                                            </div>

                                                            <div className="overflow-hidden flex-1">
                                                                <div className="flex justify-between">
                                                                    <h5 className={`font-bold text-sm truncate max-w-[200px] transition-colors ${doc.isSelected ? 'text-slate-800' : 'text-slate-500'}`} title={doc.fileName}>{doc.fileName}</h5>
                                                                    {serviceType === 'notarization' && (
                                                                        <span className="text-sm font-bold text-green-600 shrink-0">$25.00</span>
                                                                    )}
                                                                </div>

                                                                {/* Helper text based on Service Type */}
                                                                {serviceType === 'translation' ? (
                                                                    <p className="text-xs text-slate-500">{doc.count} páginas identificadas</p>
                                                                ) : (
                                                                    <p className="text-xs text-slate-400 mt-1">Par Documental (Original + Tradução)</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button onClick={() => removeDocument(doc.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded-full ml-2">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>

                                                    {/* Flow A: Density Breakdown Grid */}
                                                    {serviceType === 'translation' && doc.isSelected && (
                                                        <div className="bg-white border border-slate-100 rounded-lg p-3 mt-2 shadow-inner text-xs text-gray-600 space-y-1">
                                                            {doc.analysis?.pages.map((p) => {
                                                                let label = 'Texto Completo (100%)';
                                                                let color = 'text-slate-800';
                                                                let isScanned = false;

                                                                if (p.density === 'high') { label = 'Alta Densidade (75%)'; color = 'text-slate-700'; }
                                                                if (p.density === 'medium') { label = 'Média Densidade (50%)'; color = 'text-blue-600'; }
                                                                if (p.density === 'low') { label = 'Baixa Densidade (25%)'; color = 'text-green-600'; }
                                                                if (p.density === 'empty') { label = 'Em Branco (0%)'; color = 'text-gray-400'; }

                                                                // Scanned / Image Logic
                                                                if (p.density === 'scanned') {
                                                                    label = 'Página Digitalizada (Imagem)';
                                                                    color = 'text-amber-600'; // Warning color
                                                                    isScanned = true;
                                                                }

                                                                return (
                                                                    <div key={p.pageNumber}>
                                                                        <div className="flex justify-between items-center border-b border-gray-100 last:border-0 pb-1 last:pb-0 pt-1">
                                                                            <span className="flex items-center gap-1">
                                                                                <span className="font-mono text-gray-400">Pg {p.pageNumber}:</span>
                                                                                <span className={isScanned ? "bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md font-medium border border-amber-100" : ""}>
                                                                                    {label}
                                                                                </span>
                                                                            </span>
                                                                            <span className={`font-bold ${color}`}>
                                                                                ${p.price.toFixed(2)}
                                                                            </span>
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
                                                                <div className="text-center italic text-gray-400 py-1">Análise manual necessária na revisão. Preço base aplicado.</div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Flow A: Actions (Upsell Notarization + Handwritten) */}
                                                    {serviceType === 'translation' && doc.isSelected && (
                                                        <div className="flex flex-col gap-2 pt-2 border-t border-gray-50">
                                                            {/* Handwritten Toggle */}
                                                            <div className="flex items-center justify-between group/handwritten cursor-pointer" onClick={() => updateDocument(doc.id, 'handwritten', !doc.handwritten)}>
                                                                <span className="text-xs text-gray-500 group-hover/handwritten:text-purple-600 transition-colors">Documento Manuscrito? (+25%)</span>
                                                                <div className={`w-8 h-5 rounded-full p-0.5 transition-colors duration-300 ease-in-out ${doc.handwritten ? 'bg-purple-500' : 'bg-gray-300'}`}>
                                                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ease-in-out ${doc.handwritten ? 'translate-x-3' : 'translate-x-0'}`} />
                                                                </div>
                                                            </div>

                                                            {/* Notarization Toggle */}
                                                            <div className="flex items-center justify-between group/notary cursor-pointer" onClick={() => updateDocument(doc.id, 'notarized', !doc.notarized)}>
                                                                <span className="text-xs text-gray-500 group-hover/notary:text-green-600 transition-colors">Adicionar Notarização? (+$25)</span>
                                                                <div className={`w-8 h-5 rounded-full p-0.5 transition-colors duration-300 ease-in-out ${doc.notarized ? 'bg-green-500' : 'bg-gray-300'}`}>
                                                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ease-in-out ${doc.notarized ? 'translate-x-3' : 'translate-x-0'}`} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Flow B: Dual Upload Inputs */}
                                                    {serviceType === 'notarization' && doc.isSelected && (
                                                        <div className="bg-slate-50 rounded-lg p-3 space-y-3 mt-1">
                                                            {/* Original File */}
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-8 h-8 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-400">
                                                                    <FileText className="h-4 w-4" />
                                                                </div>
                                                                <div className="flex-1 overflow-hidden">
                                                                    <p className="text-xs font-bold text-slate-700 truncate">{doc.fileName}</p>
                                                                    <p className="text-[10px] text-gray-400">Documento Original</p>
                                                                </div>
                                                            </div>

                                                            {/* Translated File (Upload or Display) */}
                                                            <div className="flex items-center gap-2">
                                                                <div className={`w-8 h-8 rounded border flex items-center justify-center text-gray-400 ${doc.fileTranslated ? 'bg-white border-gray-200' : 'bg-orange-50 border-orange-200 border-dashed'}`}>
                                                                    {doc.fileTranslated ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Upload className="h-4 w-4 text-[#f58220]" />}
                                                                </div>

                                                                <div className="flex-1 overflow-hidden relative">
                                                                    {doc.fileTranslated ? (
                                                                        <div>
                                                                            <p className="text-xs font-bold text-slate-700 truncate">{doc.fileNameTranslated}</p>
                                                                            <p className="text-[10px] text-gray-400">Tradução Anexada</p>
                                                                        </div>
                                                                    ) : (
                                                                        <label className="cursor-pointer block">
                                                                            <span className="text-xs font-bold text-[#f58220] hover:underline">Anexar Tradução</span>
                                                                            <p className="text-[10px] text-gray-400">Clique para enviar o PDF traduzido</p>
                                                                            <input
                                                                                type="file"
                                                                                className="hidden"
                                                                                accept=".pdf"
                                                                                onChange={(e) => {
                                                                                    if (e.target.files?.[0]) updateNotaryPair(doc.id, e.target.files[0], 'translated')
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

                                {/* --- FILE UPLOAD (Dynamic) --- */}
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
                                        // EMPTY STATE: Large Dropzone
                                        <label
                                            htmlFor="file-upload"
                                            className="cursor-pointer block w-full p-8 border-2 border-dashed border-gray-300 rounded-2xl hover:border-[#f58220] hover:bg-orange-50 transition-all text-center group"
                                        >
                                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-white group-hover:text-[#f58220] text-gray-400 transition-colors shadow-sm">
                                                <Upload className="h-8 w-8" />
                                            </div>
                                            <h4 className="text-lg font-bold text-slate-700 mb-1">
                                                {serviceType === 'notarization' ? 'Adicionar Par de Documentos' : 'Clique para Anexar Arquivos'}
                                            </h4>
                                            <p className="text-sm text-gray-500">
                                                {isAnalyzing ? (
                                                    <span className="flex items-center justify-center gap-2 text-[#f58220] animate-pulse">
                                                        <div className="animate-spin h-3 w-3 border-b-2 border-[#f58220] rounded-full"></div> Analisando...
                                                    </span>
                                                ) : (serviceType === 'notarization' ? "Inicie com o Documento Original (PDF)" : "PDF, JPG ou PNG (Detecção automática)")}
                                            </p>
                                        </label>
                                    ) : (
                                        // CART STATE: Small "Add Another" Button
                                        <label
                                            htmlFor="file-upload"
                                            className="cursor-pointer flex items-center justify-center gap-2 w-full p-3 border border-dashed border-gray-300 rounded-xl hover:border-[#f58220] hover:bg-orange-50 transition-all text-slate-600 font-medium text-sm group"
                                        >
                                            <Plus className="h-4 w-4 text-gray-400 group-hover:text-[#f58220]" />
                                            {isAnalyzing ? "Analisando..." : (serviceType === 'notarization' ? "Adicionar Novo Par" : "Adicionar outro documento")}
                                        </label>
                                    )}
                                </div>


                                {/* Urgency & Total */}
                                <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-600 font-medium">Urgência:</span>
                                        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                                            {['normal', 'urgent', 'super_urgent'].map((u) => (
                                                <button
                                                    key={u}
                                                    onClick={() => setUrgency(u)}
                                                    className={`px-3 py-1 rounded-md text-xs transition-all ${urgency === u ? 'bg-[#f58220] text-white shadow-md shadow-orange-200 scale-105 font-bold' : 'text-slate-600 bg-slate-50 hover:bg-slate-100'}`}
                                                >
                                                    {u === 'normal' ? 'Standard (2-3 dias)' : u === 'urgent' ? 'Urgente (24h)' : 'Super Urgente (12h)'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="h-px bg-gray-200" />

                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase">Seus Dados</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="text" placeholder="Nome" value={fullName} onChange={e => setFullName(e.target.value)} className="p-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-[#f58220]" />
                                            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="p-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-[#f58220]" />
                                            <input type="tel" placeholder="Telefone" value={phone} onChange={e => setPhone(e.target.value)} className="col-span-2 p-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-[#f58220]" />
                                        </div>
                                    </div>

                                    <div className="h-px bg-gray-200" />

                                    {/* Payment Selector Mini */}
                                    <div className="flex gap-2">
                                        <div onClick={() => setPaymentProvider('STRIPE')} className={`flex-1 p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-center gap-2 text-xs font-bold ${paymentProvider === 'STRIPE' ? 'border-[#f58220] bg-[#f58220]/10 text-[#f58220]' : 'border-gray-200 bg-white text-gray-500'}`}>
                                            <Globe className="h-3 w-3" /> USD (Card)
                                        </div>
                                        <div onClick={() => setPaymentProvider('PARCELADO_USA')} className={`flex-1 p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-center gap-2 text-xs font-bold ${paymentProvider === 'PARCELADO_USA' ? 'border-[#f58220] bg-[#f58220]/10 text-[#f58220]' : 'border-gray-200 bg-white text-gray-500'}`}>
                                            <Smartphone className="h-3 w-3" /> BRL (Pix/12x)
                                        </div>
                                    </div>

                                </div>

                                {/* --- BREAKDOWN & TOTAL --- */}
                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                    {isAnalyzing ? (
                                        <div className="flex flex-col items-center justify-center py-6 space-y-3 text-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f58220]"></div>
                                            <p className="text-xs text-slate-500 font-medium animate-pulse">
                                                {serviceType === 'notarization' ? "Preparando slots..." : "Analisando densidade do documento..."}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Detalhes do Orçamento</h4>
                                            </div>

                                            {/* Dynamic Lines */}
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between text-gray-600">
                                                    <span>Documentos ({documents.length})</span>
                                                    <span>{totalCount} {serviceType === 'notarization' ? 'itens' : 'páginas'}</span>
                                                </div>

                                                {serviceType === 'translation' && (
                                                    <div className="flex justify-between text-gray-600">
                                                        <span>Tradução (Densidade Inteligente)</span>
                                                        <span className="font-medium">${basePrice.toFixed(2)}</span>
                                                    </div>
                                                )}

                                                {notaryFee > 0 && (
                                                    <div className="flex justify-between text-green-600">
                                                        <span>{serviceType === 'notarization' ? 'Notarização (BlueNotary)' : 'Notarização Oficial'}</span>
                                                        <span className="font-medium font-bold">+${notaryFee.toFixed(2)}</span>
                                                    </div>
                                                )}

                                                {urgency !== 'normal' && (
                                                    <div className="flex justify-between text-[#f58220]">
                                                        <span>Taxa de Urgência ({urgency === 'urgent' ? '24h' : '12h'})</span>
                                                        {/* Now Urgency applies to Notary too, so it might be higher */}
                                                        <span className="font-bold">+${urgencyFee.toFixed(2)}</span>
                                                    </div>
                                                )}

                                                {minOrderApplied && (
                                                    <div className="flex justify-between text-blue-600 bg-blue-50 p-1 rounded">
                                                        <span>Ajuste Pedido Mínimo</span>
                                                        <span className="font-bold">Aplicado</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="h-px bg-gray-200 my-2" />

                                            <div className="flex items-end justify-between pt-1">
                                                <span className="text-gray-500 font-medium text-sm">Total Estimado</span>
                                                <div className="text-right">
                                                    <span className="block text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-[#f58220] leading-none">${totalPrice.toFixed(2)}</span>
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

                                {/* WhatsApp Concierge Confirmation Toast */}
                                {whatsappSent && (
                                    <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="shrink-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                                            <Check className="h-4 w-4 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-green-800">Solicitação Enviada!</p>
                                            <p className="text-xs text-green-700 mt-0.5 leading-snug">
                                                Um consultor entrará em contato em instantes com seu link de pagamento parcelado. Verifique o WhatsApp.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || totalPrice === 0 || (serviceType === 'notarization' && documents.some(d => !d.fileTranslated))}
                                    className="w-full bg-[#f58220] hover:bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                                >
                                    {loading ? 'Processando...' :
                                        paymentProvider === 'PARCELADO_USA'
                                            ? <><Smartphone className="h-5 w-5" /> Solicitar Link via WhatsApp</>
                                            : <>Ir para Pagamento (Checkout) <ArrowRight className="h-5 w-5" /></>
                                    }
                                </button>
                            </>
                        )}
                    </motion.div>
                </div>
            </main>

            {/* --- BENTO GRID SECTON (Tech Advantage) --- */}
            <section id="features" className="py-24 bg-white border-t border-gray-100">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-slate-900 mb-4">Especialidades & Soluções</h2>
                        <p className="text-slate-500 max-w-2xl mx-auto">Atendemos as demandas mais complexas de imigração e validação profissional com rigor técnico.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Card 1: Immigration */}
                        <div className="p-6 bg-slate-50 rounded-2xl border border-gray-100 hover:shadow-lg transition-all group">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4 text-blue-600 group-hover:scale-110 transition-transform">
                                <Globe className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold text-slate-900 mb-2">Imigração (USCIS)</h3>
                            <p className="text-sm text-slate-500">Traduções certificadas de certidões (nascimento, casamento, divórcio) e antecedentes criminais.</p>
                        </div>

                        {/* Card 2: Education */}
                        <div className="p-6 bg-slate-50 rounded-2xl border border-gray-100 hover:shadow-lg transition-all group">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4 text-orange-500 group-hover:scale-110 transition-transform">
                                <FileText className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold text-slate-900 mb-2">Educação & Carreira</h3>
                            <p className="text-sm text-slate-500">Validação de históricos escolares e diplomas para universidades e conselhos de classe.</p>
                        </div>

                        {/* Card 3: Financial */}
                        <div className="p-6 bg-slate-50 rounded-2xl border border-gray-100 hover:shadow-lg transition-all group">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4 text-green-600 group-hover:scale-110 transition-transform">
                                <CreditCard className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold text-slate-900 mb-2">Bancos & Mortgages</h3>
                            <p className="text-sm text-slate-500">Tradução técnica de extratos bancários, declarações de IR e comprovantes de fundos.</p>
                        </div>

                        {/* Card 4: DMV */}
                        <div className="p-6 bg-slate-50 rounded-2xl border border-gray-100 hover:shadow-lg transition-all group">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4 text-purple-600 group-hover:scale-110 transition-transform">
                                <Smartphone className="h-6 w-6" />
                            </div>
                            <h3 className="font-bold text-slate-900 mb-2">DMV (Driver's License)</h3>
                            <p className="text-sm text-slate-500">Tradução oficial de CNH brasileira para emissão da carteira de motorista na Flórida.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- AUTHORITY (Social Proof) --- */}
            <section id="team" className="py-24 bg-slate-50">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-slate-900 mb-4">Conformidade Documental e Precisão Técnica</h2>
                    </div>
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-white p-12 md:p-16 rounded-3xl shadow-sm border border-gray-100 text-center">
                            <h4 className="text-3xl font-bold text-slate-900 mb-6">Equipe Técnica Promobi</h4>

                            <p className="text-slate-600 text-lg md:text-xl leading-relaxed max-w-3xl mx-auto">
                                "Nossos processos são conduzidos por especialistas técnicos membros da ATA e validados por Notários Públicos comissionados na Flórida. Garantimos aceitação total nos principais órgãos americanos (USCIS, DMV, Universidades e Bancos)."
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- FAQ Accordion --- */}
            <section className="py-24 bg-white">
                <div className="max-w-3xl mx-auto px-4">
                    <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Perguntas Frequentes</h2>
                    <div className="space-y-4">
                        {[
                            { q: "O que é uma Tradução Certificada nos EUA?", a: "É uma tradução acompanhada de um 'Certificate of Accuracy' (Certificado de Precisão), assinado pelo tradutor ou empresa de tradução, atestando que o documento é uma representação fiel e precisa do original. É a exigência padrão do USCIS e outros órgãos americanos." },
                            { q: "Qual a diferença entre a 'Tradução Juramentada' do Brasil e a Certificada nos EUA?", a: "Nos EUA não existe a figura do tradutor concursado (juramentado) como no Brasil. O sistema americano exige uma Tradução Certificada e, para maior segurança jurídica (como exigido por tribunais, DMV e universidades), a assinatura do tradutor deve ser Notarizada por um Notary Public oficial." },
                            { q: "Eu mesmo posso traduzir meus documentos para o USCIS?", a: "Não. O USCIS proíbe expressamente que o próprio requerente, ou membros da sua família, certifiquem traduções de seus próprios documentos, sob risco de negativa do processo. É necessário um profissional imparcial e capacitado." },
                            { q: "A Promobi é credenciada para fazer essas traduções?", a: "Sim. Nossa equipe técnica é composta por membros da American Translators Association (ATA) e atuamos em conformidade com as diretrizes do governo americano. Além disso, nossos processos são validados por Notários Públicos comissionados no Estado da Flórida." },
                            { q: "Preciso enviar meu documento original físico para vocês?", a: "Não. Todo o nosso processo é 100% digital. Basta enviar uma foto nítida ou um documento escaneado (PDF/JPG) com todas as bordas visíveis e legíveis através da nossa plataforma segura." },
                            { q: "O USCIS aceita traduções digitais ou preciso do papel impresso?", a: "O USCIS aceita cópias digitais impressas de traduções certificadas em 99% dos casos, aplicados online ou por correio. Nós enviamos o PDF final com todas as certificações e selos notariais digitais prontos para envio." },
                            { q: "Quando é necessário notarizar (reconhecer firma) a tradução?", a: "Embora o USCIS exija apenas a certificação, muitos bancos, tribunais estaduais, universidades e o DMV exigem que a assinatura do tradutor seja notarizada. Como nosso processo já inclui validação por um Notary Public da Flórida, seu documento terá máxima aceitação." },
                            { q: "Vocês traduzem documentos para o DMV (Driver's License) e Universidades?", a: "Sim! Além de processos imigratórios, traduzimos CNHs brasileiras, históricos escolares (transcripts), diplomas, extratos bancários e declarações de imposto de renda para fins financeiros e educacionais." },
                            { q: "Como o prazo de entrega funciona?", a: "Depende da urgência do seu processo. Oferecemos opções de entrega 'Standard' (3 a 5 dias), 'Express' (24 horas) e 'Ultra-Express' (12 horas). O prazo começa a contar a partir da confirmação do pagamento." },
                            { q: "Meus dados e documentos estão seguros?", a: "Absolutamente. Utilizamos infraestrutura de ponta e criptografia de nível bancário. Seus documentos são acessados apenas pela nossa equipe técnica restrita e excluídos de nossos servidores após a conclusão do serviço, garantindo total privacidade." }
                        ].map((item, i) => (
                            <div key={i} className="border border-gray-200 rounded-2xl overflow-hidden">
                                <button
                                    onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                                    className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
                                >
                                    <span className="font-bold text-slate-800">{item.q}</span>
                                    <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${activeFaq === i ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence>
                                    {activeFaq === i && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="p-6 pt-0 text-slate-600 leading-relaxed text-sm">
                                                {item.a}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- FOOTER --- */}
            <footer className="bg-slate-900 text-slate-400 py-12 text-center text-sm">
                <p>&copy; 2024 Promobi Services LLC. Todos os direitos reservados.</p>
                <p className="mt-2 text-slate-500">Orlando, FL • Florida Notary Public & ATA Member</p>
                <p className="mt-4 max-w-2xl mx-auto text-xs opacity-60">
                    A Promobi é uma empresa de tecnologia e serviços de tradução e notarização. Não somos um escritório de advocacia (Law Firm) e não prestamos consultoria jurídica.
                </p>
                <div className="mt-8 pt-8 border-t border-slate-800">
                    <a href="/admin/orders" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                        Acesso Colaborador
                    </a>
                </div>
            </footer>

        </div>
    )
}
