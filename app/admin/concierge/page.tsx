'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createOrder } from '@/app/actions/create-order'
import { getGlobalSettings, GlobalSettings } from '@/app/actions/settings'
import {
    CheckCircle,
    ArrowRight,
    Upload,
    FileText,
    ShieldCheck,
    Plus,
    Trash2,
    Check,
    ChevronDown,
    Lock,
    Globe,
    FilePlus,
    Copy,
    ExternalLink
} from 'lucide-react'
import { useUIFeedback } from '@/components/UIFeedbackProvider'
import { analyzeDocument, DocumentAnalysis } from '@/lib/documentAnalyzer'

// Types (Mirrored from Home for consistency)
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

    const handleServiceSelection = (type: 'translation' | 'notarization') => {
        setServiceType(type)
        setDocuments([])
        setUrgency('standard')
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setIsAnalyzing(true)
            const newDocs: DocumentItem[] = []

            for (const file of Array.from(e.target.files)) {
                try {
                    const analysis = serviceType === 'translation' ? await analyzeDocument(file) : { totalPages: 1, pages: [] }
                    newDocs.push({
                        id: crypto.randomUUID(),
                        file: file,
                        fileName: file.name,
                        count: analysis.totalPages,
                        notarized: serviceType === 'notarization',
                        analysis: serviceType === 'translation' ? analysis as DocumentAnalysis : undefined,
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
                        notarized: serviceType === 'notarization',
                        isSelected: true,
                        handwritten: false
                    })
                }
            }
            setDocuments(prev => [...prev, ...newDocs])
            setIsAnalyzing(false)
            toast.success('Documentos adicionados.')
        }
    }

    const removeDocument = (id: string) => {
        setDocuments(prev => prev.filter(d => d.id !== id))
    }

    const updateDocument = (id: string, field: keyof DocumentItem, value: any) => {
        setDocuments(documents.map(d =>
            d.id === id ? { ...d, [field]: value } : d
        ))
    }

    useEffect(() => {
        const selectedDocs = documents.filter(d => d.isSelected)
        let totalBaseAfterFloor = 0
        let totalPages = 0
        let notary = 0
        let anyDocHitFloor = false
        let totalMinimumAdjustment = 0
        let totalDiscountApplied = 0
        let totalBaseBeforeFloor = 0

        if (serviceType === 'translation') {
            selectedDocs.forEach(doc => {
                let docPrice = 0
                if (doc.analysis) {
                    docPrice = doc.analysis.totalPrice
                    totalPages += doc.analysis.totalPages
                } else {
                    const base = globalSettings?.basePrice || 9.00
                    docPrice = (doc.count || 1) * base
                    totalPages += (doc.count || 1)
                }

                if (doc.handwritten) docPrice *= 1.25
                totalBaseBeforeFloor += docPrice

                if (docPrice < 10.00) {
                    totalMinimumAdjustment += (10.00 - docPrice)
                    docPrice = 10.00
                    anyDocHitFloor = true
                }
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
            minOrderApplied: anyDocHitFloor,
            totalMinimumAdjustment,
            totalDiscountApplied
        })
        setTotalPrice(total)
    }, [documents, urgency, paymentPlan, serviceType])

    const handleCreateConciergeOrder = async () => {
        if (!fullName || !email || !phone) {
            toast.error('Preencha os dados do cliente.')
            return
        }
        if (documents.length === 0) {
            toast.error('Adicione pelo menos um documento.')
            return
        }

        setLoading(true)
        setUploadProgress('Enviando arquivos...')

        try {
            // Upload files
            const uploadedDocs = []
            for (let i = 0; i < documents.length; i++) {
                const doc = documents[i]
                if (doc.file) {
                    const form = new FormData()
                    form.append('file', doc.file)
                    const res = await fetch('/api/upload', { method: 'POST', body: form })
                    if (res.ok) {
                        const data = await res.json()
                        uploadedDocs.push({
                            docIndex: i,
                            url: data.url,
                            fileName: data.fileName,
                            contentType: data.contentType
                        })
                    }
                }
            }

            setUploadProgress('Gerando link...')

            const orderDocuments = documents.map((d, idx) => {
                const uploaded = uploadedDocs.find(u => u.docIndex === idx)
                return {
                    id: d.id,
                    type: 'Uploaded File',
                    fileName: d.fileName,
                    count: d.count,
                    notarized: d.notarized,
                    uploadedFile: uploaded ? { url: uploaded.url, fileName: uploaded.fileName, contentType: uploaded.contentType } : undefined
                }
            })

            const result = await createOrder({
                user: { fullName, email, phone },
                documents: orderDocuments as any,
                urgency,
                docCategory: 'standard',
                notaryMode: 'none',
                zipCode: '00000',
                grandTotalOverride: totalPrice,
                breakdown: { ...breakdown, serviceType },
                paymentProvider: 'STRIPE',
                serviceType: serviceType ?? 'translation',
                status: 'PENDING_PAYMENT'
            })

            if (result.success) {
                const payLink = `${window.location.origin}/pay/${result.orderId}`
                setGeneratedLink(payLink)
                toast.success('Link de cobrança gerado com sucesso!')
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

    const copyToClipboard = () => {
        if (generatedLink) {
            navigator.clipboard.writeText(generatedLink)
            toast.success('Link copiado para a área de transferência!')
        }
    }

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
                {/* Left side: Calculator */}
                <div className="space-y-6">
                    {!serviceType ? (
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-6">
                            <h3 className="text-xl font-bold">Selecione o Serviço</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <button onClick={() => handleServiceSelection('translation')} className="flex items-start gap-4 p-6 rounded-2xl border-2 border-gray-100 hover:border-[#f58220] hover:bg-orange-50 transition-all text-left group">
                                    <div className="bg-orange-100 p-3 rounded-xl text-orange-600 group-hover:scale-110 transition-transform"><Globe className="w-6 h-6" /></div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">Tradução + Certificação</h4>
                                        <p className="text-xs text-gray-500 mt-1">Fluxo completo para USCIS.</p>
                                    </div>
                                </button>
                                <button onClick={() => handleServiceSelection('notarization')} className="flex items-start gap-4 p-6 rounded-2xl border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group">
                                    <div className="bg-blue-100 p-3 rounded-xl text-blue-600 group-hover:scale-110 transition-transform"><ShieldCheck className="w-6 h-6" /></div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">Apenas Notarização</h4>
                                        <p className="text-xs text-gray-500 mt-1">Tradução já existe.</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
                            <div className="flex justify-between items-center pb-4 border-b border-gray-50">
                                <button onClick={() => setServiceType(null)} className="text-xs font-bold text-gray-400 hover:text-[#f58220] flex items-center gap-1">
                                    <ArrowRight className="w-3 h-3 rotate-180" /> Trocar Serviço
                                </button>
                                <h3 className="font-bold text-gray-900">{serviceType === 'translation' ? 'Editor de Tradução' : 'Editor de Notarização'}</h3>
                            </div>

                            {/* Document List */}
                            <div className="space-y-3">
                                {documents.map(doc => (
                                    <div key={doc.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex justify-between items-center group">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded-lg text-gray-400"><FileText className="w-5 h-5" /></div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-800 line-clamp-1">{doc.fileName}</p>
                                                <p className="text-[10px] text-gray-500">{doc.count} páginas</p>
                                            </div>
                                        </div>
                                        <button onClick={() => removeDocument(doc.id)} className="text-gray-300 hover:text-red-500 p-2"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}

                                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-[#f58220] hover:bg-orange-50 transition-all group">
                                    <Upload className="w-5 h-5 text-gray-400 group-hover:text-[#f58220]" />
                                    <span className="text-sm font-bold text-gray-500 group-hover:text-[#f58220]">
                                        {isAnalyzing ? 'Analisando...' : 'Anexar Documentos'}
                                    </span>
                                    <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                                </label>
                            </div>

                            {/* Urgency */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Prazo de Entrega</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['standard', 'urgent', 'flash'].map(id => (
                                        <button
                                            key={id}
                                            onClick={() => setUrgency(id)}
                                            className={`py-2 rounded-xl text-xs font-bold transition-all ${urgency === id ? 'bg-[#f58220] text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                        >
                                            {id === 'standard' ? 'Standard' : id === 'urgent' ? 'Urgente' : 'Flash'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Client Data */}
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

                {/* Right side: Summary & Action */}
                <div className="space-y-6">
                    <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#f58220] opacity-10 rounded-full -mr-16 -mt-16 blur-3xl"></div>

                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Resumo do Orçamento</h4>

                        <div className="space-y-4 mb-8">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Páginas/Itens:</span>
                                <span>{breakdown.totalCount}</span>
                            </div>
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
                            <div className="h-px bg-white/10 my-4"></div>
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
                                    <button
                                        onClick={copyToClipboard}
                                        className="flex-1 bg-white text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-all"
                                    >
                                        <Copy className="w-4 h-4" /> Copiar Link
                                    </button>
                                    <a
                                        href={generatedLink}
                                        target="_blank"
                                        className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all"
                                    >
                                        <ExternalLink className="w-5 h-5" />
                                    </a>
                                </div>
                                <button onClick={() => { setGeneratedLink(null); setDocuments([]); setFullName(''); setEmail(''); setPhone(''); }} className="w-full text-center text-xs text-gray-500 hover:text-white transition-colors">Criar Outro</button>
                            </div>
                        ) : (
                            <button
                                onClick={handleCreateConciergeOrder}
                                disabled={loading || totalPrice === 0}
                                className="w-full bg-[#f58220] hover:bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <><div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> {uploadProgress}</>
                                ) : (
                                    <><Lock className="w-5 h-5" /> Gerar Link de Cobrança</>
                                )}
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
