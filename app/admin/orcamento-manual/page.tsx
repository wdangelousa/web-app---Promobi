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
    CheckCircle
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
                toast.success('Documentos adicionados ao orçamento com sucesso!')
            } else if (serviceType === 'notarization') {
                const newDocs: DocumentItem[] = []
                for (const file of Array.from(e.target.files)) {
                    newDocs.push({
                        id: crypto.randomUUID(),
                        file: file,
                        fileName: file.name,
                        count: 1,
                        notarized: true,
                        isSelected: true,
                    } as DocumentItem)
                }
                setDocuments(prev => [...prev, ...newDocs])
                toast.success('Pares de documentos adicionados com sucesso!')
            }
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

    useEffect(() => {
        const selectedDocs = documents.filter(d => d.isSelected)

        let totalBaseBeforeFloor = 0
        let totalBaseAfterFloor = 0
        let totalPages = 0
        let notary = 0
        let minOrderApplied = false
        let totalMinimumAdjustment = 0

        if (serviceType === 'translation') {
            let anyDocHitFloor = false;

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

                if (docPrice < 10.00) {
                    totalMinimumAdjustment += (10.00 - docPrice)
                    docPrice = 10.00
                    anyDocHitFloor = true;
                }

                totalBaseAfterFloor += docPrice
            })

            minOrderApplied = anyDocHitFloor;
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
            minOrderApplied,
            totalMinimumAdjustment,
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
                toast.error('Erro ao gerar proposta.')
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
                                <div className="mb-6 relative group cursor-pointer border-2 border-dashed border-slate-200 rounded-2xl p-8 hover:border-[#f58220] hover:bg-orange-50/50 transition-all text-center">
                                    <input type="file" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileUpload} accept=".pdf,.png,.jpg,.jpeg,.heic" />
                                    <div className="w-12 h-12 rounded-full bg-slate-50 group-hover:bg-[#f58220] flex items-center justify-center mx-auto mb-3 transition-colors shadow-sm text-slate-400 group-hover:text-white">
                                        <Upload className="h-5 w-5" />
                                    </div>
                                    <p className="font-bold text-slate-700 text-sm">Clique ou arraste Arquivos</p>
                                </div>

                                {/* Doc List */}
                                {documents.length > 0 && (
                                    <div className="space-y-3 mb-8">
                                        {documents.map((doc) => (
                                            <div key={doc.id} className="rounded-xl p-3 border border-slate-200 flex items-center justify-between bg-slate-50">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="h-5 w-5 text-slate-400" />
                                                    <div>
                                                        <h5 className="font-bold text-sm text-slate-700 truncate max-w-[250px]">{doc.fileName}</h5>
                                                        <span className="text-xs text-slate-500">{doc.count} páginas</span>
                                                    </div>
                                                </div>

                                                {serviceType === 'translation' && (
                                                    <div className="flex items-center gap-4">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input type="checkbox" checked={doc.notarized} onChange={(e) => updateDocument(doc.id, 'notarized', e.target.checked)} className="rounded accent-[#f58220]" />
                                                            <span className="text-xs font-bold text-slate-600">+ Notarização</span>
                                                        </label>
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input type="checkbox" checked={doc.handwritten} onChange={(e) => updateDocument(doc.id, 'handwritten', e.target.checked)} className="rounded accent-[#f58220]" />
                                                            <span className="text-xs font-bold text-slate-600">Manuscrito (25%)</span>
                                                        </label>
                                                        <button onClick={() => removeDocument(doc.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                                                    </div>
                                                )}
                                                {serviceType === 'notarization' && (
                                                    <button onClick={() => removeDocument(doc.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                                                )}
                                            </div>
                                        ))}
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
        </div>
    )
}
