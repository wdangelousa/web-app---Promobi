'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
    CheckCircle, FileText, ChevronDown, Clock, ShieldCheck,
    Smartphone, Download, X, AlertTriangle, CreditCard, Award,
    ChevronRight, Calendar, User, Mail, Hash, FileCheck,
} from 'lucide-react'
import { useUIFeedback } from '@/components/UIFeedbackProvider'
import { getLogoBase64 } from '@/app/actions/get-logo-base64'
import { generatePremiumProposalPDF } from '@/app/actions/generate-proposal-pdf'
import { deriveProposalFinancialSummary } from '@/lib/proposalPricingSummary'
import { formatDueDateLabel, resolveStoredOrCalculatedDueDate } from '@/lib/orderDueDate'
import {
    cleanDocumentName,
    getProposalValidity,
    getDensityLabel,
    getDensityColor,
    getDensityBgClass,
    getDensityDistribution,
    calculateBenefits,
} from '@/lib/proposalUtils'
import { Source_Serif_4, DM_Sans } from 'next/font/google'

const sourceSerif = Source_Serif_4({ subsets: ['latin'], display: 'swap', weight: ['400', '600', '700'] })
const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap' })

const WHATSAPP_NUMBER = '14076396154'
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`

export default function ProposalClient({
    order,
    globalSettings,
    deadlineNormal,
    deadlineUrgent,
}: {
    order: any
    globalSettings: any
    deadlineNormal?: number
    deadlineUrgent?: number
}) {
    const metadata = order.metadata ? JSON.parse(order.metadata) : null
    const metaDocs = metadata?.documents ?? []
    const { toast } = useUIFeedback()

    const [expandedDocs, setExpandedDocs] = useState<string[]>([])
    const [showAllDocs, setShowAllDocs] = useState(false)
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
    const [showApproveModal, setShowApproveModal] = useState(false)
    const [isApproving, setIsApproving] = useState(false)
    const [approvedLocally, setApprovedLocally] = useState(false)

    const financialSummary = deriveProposalFinancialSummary({
        totalAmount: order.totalAmount,
        extraDiscount: order.extraDiscount,
        metadata: order.metadata,
    })

    const dueDate = resolveStoredOrCalculatedDueDate({
        dueDate: order.dueDate ?? metadata?.dueDate ?? null,
        createdAt: order.createdAt,
        urgency: order.urgency,
        settings: globalSettings,
    })
    const dueDateLabel = formatDueDateLabel(dueDate)

    const validity = getProposalValidity(order.proposalExpiresAt, order.createdAt)
    const densityDist = getDensityDistribution(metaDocs)
    const benefits = calculateBenefits(metaDocs, financialSummary, order.documents)
    const hasBenefits = benefits.length > 0
    const totalBenefitSavings = benefits.reduce((sum, b) => sum + b.savings, 0)

    const isAwaitingPayment = order.status === 'PENDING_PAYMENT'
    const isExpired = validity.status === 'expired'
    const canApprove = isAwaitingPayment && !isExpired && !approvedLocally

    const urgencyLabels: Record<string, string> = {
        standard: 'Standard',
        normal: 'Standard',
        urgent: 'Express (48h)',
        flash: 'Ultra Express (24h)',
    }

    const createdDate = new Date(order.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    })

    // Count totals from metadata documents
    const totalPages = metaDocs.reduce((sum: number, d: any) => {
        const pages = d?.analysis?.pages?.filter((p: any) => p.included !== false) ?? []
        return sum + (pages.length || d.count || 1)
    }, 0)

    const visibleDocs = showAllDocs ? metaDocs : metaDocs.slice(0, 5)
    const hasMoreDocs = metaDocs.length > 5

    // ── Handlers ────────────────────────────────────────────────────────────────

    const handleDownloadPDF = async () => {
        if (isGeneratingPDF) return
        setIsGeneratingPDF(true)
        try {
            const result = await generatePremiumProposalPDF(order, globalSettings)
            if (result.success && result.base64) {
                const link = document.createElement('a')
                link.href = `data:application/pdf;base64,${result.base64}`
                link.download = result.fileName || `Proposta-Promobidocs-${order.id}.pdf`
                link.click()
                toast.success('PDF gerado com sucesso!')
            } else {
                toast.error(result.error || 'Erro ao gerar PDF.')
            }
        } catch {
            toast.error('Falha ao gerar PDF.')
        } finally {
            setIsGeneratingPDF(false)
        }
    }

    const handleApprove = async () => {
        setIsApproving(true)
        try {
            const res = await fetch('/api/confirm-manual-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: order.id, method: 'PENDING' }),
            })
            if (res.ok) {
                setApprovedLocally(true)
                setShowApproveModal(false)
                toast.success('Proposta aprovada com sucesso!')
            } else {
                toast.error('Erro ao aprovar proposta.')
            }
        } catch {
            toast.error('Falha de conexão.')
        } finally {
            setIsApproving(false)
        }
    }

    // ── Render ───────────────────────────────────────────────────────────────────

    return (
        <div className={`${dmSans.className} min-h-screen bg-[#FAFAF7] text-[#2D2A26] pb-20`}>
            {/* ── A. HEADER ──────────────────────────────────────────────────── */}
            <header className="bg-white border-b border-[#E8D5C0]/40 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <Image
                        src="/logo-promobi-transparent.png"
                        width={160}
                        height={48}
                        alt="Promobidocs"
                        className="h-10 sm:h-12 w-auto object-contain"
                    />
                    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#E8D5C0] bg-[#FAFAF7] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8B5A2B]">
                        <ShieldCheck className="h-3 w-3" /> Tradução Certificada · USCIS Accepted
                    </span>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 sm:px-6 mt-6 space-y-6">

                {/* ── B. STATUS + IDENTIFICACAO ────────────────────────────── */}
                <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                        <p className={`${sourceSerif.className} text-2xl sm:text-3xl font-bold text-[#2D2A26]`}>
                            Cotação <span className="text-[#B87333]">#{order.id}</span>
                        </p>
                        <p className="text-sm text-[#6B6560] mt-1">Emitida em {createdDate}</p>
                    </div>
                    <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${
                        validity.status === 'valid'
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : validity.status === 'expiring'
                            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                        {validity.status === 'expired' ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        {validity.label}
                    </div>
                </section>

                {/* Expired banner */}
                {isExpired && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
                        <p className="text-red-800 font-bold">Esta proposta expirou.</p>
                        <p className="text-red-600 text-sm mt-1">Entre em contato para uma nova cotacao.</p>
                        <a
                            href={`${WHATSAPP_LINK}?text=${encodeURIComponent(`Olá, a proposta #${order.id} expirou. Gostaria de uma nova cotação.`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 mt-4 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-full font-bold text-sm transition-colors"
                        >
                            <Smartphone className="h-4 w-4" /> Falar no WhatsApp
                        </a>
                    </div>
                )}

                {/* Approved banner */}
                {(!isAwaitingPayment || approvedLocally) && !isExpired && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                        <p className="text-sm text-green-800 font-medium">
                            {approvedLocally
                                ? 'Proposta aprovada! Siga as instruções de pagamento abaixo.'
                                : 'Esta proposta já foi aprovada e está em produção.'}
                        </p>
                    </div>
                )}

                {/* ── C. CARD DO CLIENTE ───────────────────────────────────── */}
                <section className="bg-white rounded-2xl border border-[#E8D5C0]/50 p-5 sm:p-6 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                        <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-[#B87333]" />
                            <div>
                                <p className="text-xs text-[#9C9A92] uppercase tracking-wider font-bold">Cliente</p>
                                <p className="text-sm font-bold">{order.user?.fullName || 'Cliente'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-[#B87333]" />
                            <div>
                                <p className="text-xs text-[#9C9A92] uppercase tracking-wider font-bold">Email</p>
                                <p className="text-sm">{order.user?.email || '-'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-[#B87333]" />
                            <div>
                                <p className="text-xs text-[#9C9A92] uppercase tracking-wider font-bold">Prazo</p>
                                <p className="text-sm font-bold">
                                    {urgencyLabels[order.urgency] || order.urgency}
                                    {dueDateLabel && <span className="font-normal text-[#6B6560]"> · Entrega até {dueDateLabel}</span>}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-[#FAFAF7] rounded-xl p-4 text-center border border-[#E8D5C0]/40">
                            <p className={`${sourceSerif.className} text-2xl font-bold text-[#2D2A26]`}>{metaDocs.length}</p>
                            <p className="text-xs text-[#9C9A92] mt-1">Documentos</p>
                        </div>
                        <div className="bg-[#FAFAF7] rounded-xl p-4 text-center border border-[#E8D5C0]/40">
                            <p className={`${sourceSerif.className} text-2xl font-bold text-[#2D2A26]`}>{totalPages}</p>
                            <p className="text-xs text-[#9C9A92] mt-1">Páginas</p>
                        </div>
                        <div className="bg-[#B87333]/5 rounded-xl p-4 text-center border border-[#B87333]/20">
                            <p className={`${sourceSerif.className} text-2xl font-bold text-[#B87333]`}>
                                ${financialSummary.totalPayable.toFixed(2)}
                            </p>
                            <p className="text-xs text-[#9C9A92] mt-1">Total USD</p>
                        </div>
                    </div>
                </section>

                {/* ── D. ANALISE DE DENSIDADE ──────────────────────────────── */}
                {densityDist.length > 0 && (
                    <section className="bg-white rounded-2xl border border-[#E8D5C0]/50 p-5 sm:p-6 shadow-sm">
                        <h3 className={`${sourceSerif.className} text-lg font-bold text-[#2D2A26] mb-4`}>
                            Análise de Densidade por IA
                        </h3>
                        <div className="space-y-3">
                            {densityDist.map((d) => (
                                <div key={d.density} className="flex items-center gap-3">
                                    <span className={`text-xs font-bold w-20 ${getDensityBgClass(d.density)} rounded-full px-2 py-0.5 text-center`}>
                                        {d.label}
                                    </span>
                                    <div className="flex-1 h-3 bg-[#F5F1EB] rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{ width: `${d.percentage}%`, backgroundColor: d.color }}
                                        />
                                    </div>
                                    <span className="text-xs text-[#6B6560] w-16 text-right">
                                        {d.count} pag ({d.percentage}%)
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── E. LISTA DE DOCUMENTOS ───────────────────────────────── */}
                <section className="bg-white rounded-2xl border border-[#E8D5C0]/50 p-5 sm:p-6 shadow-sm">
                    <h3 className={`${sourceSerif.className} text-lg font-bold text-[#2D2A26] mb-4`}>
                        Documentos Analisados
                    </h3>
                    <div className="space-y-2">
                        {visibleDocs.map((doc: any, idx: number) => {
                            const pages = doc?.analysis?.pages ?? []
                            const includedPages = pages.filter((p: any) => p.included !== false)
                            const docName = cleanDocumentName(doc.fileName || doc.customDescription)
                            const subtotal = includedPages.reduce((s: number, p: any) => s + (p.price || 0), 0)
                            const isExpanded = expandedDocs.includes(doc.id)
                            const fileType = doc?.analysis?.fileType === 'image' ? 'IMG' : 'PDF'

                            return (
                                <div key={doc.id || idx} className="border border-[#E8D5C0]/40 rounded-xl overflow-hidden">
                                    <button
                                        onClick={() => setExpandedDocs(prev =>
                                            prev.includes(doc.id) ? prev.filter(d => d !== doc.id) : [...prev, doc.id]
                                        )}
                                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#FAFAF7] transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-[10px] font-bold bg-[#F5F1EB] text-[#8B5A2B] px-2 py-0.5 rounded shrink-0">
                                                {fileType}
                                            </span>
                                            <span className="text-sm font-medium truncate">{docName}</span>
                                            <span className="text-xs text-[#9C9A92] shrink-0">
                                                {includedPages.length} pag
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            <span className="text-sm font-bold text-[#B87333]">
                                                ${(subtotal * (doc.handwritten ? 1.25 : 1)).toFixed(2)}
                                            </span>
                                            <ChevronDown className={`h-4 w-4 text-[#9C9A92] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.25 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-4 pb-3 space-y-1.5 border-t border-[#E8D5C0]/30 pt-3">
                                                    {includedPages.map((page: any) => (
                                                        <div key={page.pageNumber} className="flex items-center gap-2 text-xs">
                                                            <span className="text-[#9C9A92] w-12">Pag. {page.pageNumber}</span>
                                                            <div className="flex-1 h-2 bg-[#F5F1EB] rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full"
                                                                    style={{
                                                                        width: `${Math.max(5, (page.fraction || 0) * 100)}%`,
                                                                        backgroundColor: getDensityColor(page.density),
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className={`${getDensityBgClass(page.density)} px-1.5 py-0.5 rounded text-[10px] font-bold w-16 text-center`}>
                                                                {getDensityLabel(page.density)}
                                                            </span>
                                                            <span className="font-bold text-[#2D2A26] w-14 text-right">
                                                                ${page.price?.toFixed(2) || '0.00'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {doc.handwritten && (
                                                        <p className="text-[10px] text-amber-600 font-bold mt-1">
                                                            + 25% taxa manuscrito aplicada
                                                        </p>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )
                        })}
                    </div>

                    {hasMoreDocs && !showAllDocs && (
                        <button
                            onClick={() => setShowAllDocs(true)}
                            className="mt-4 w-full text-center text-sm font-bold text-[#B87333] hover:text-[#8B5A2B] transition-colors flex items-center justify-center gap-1"
                        >
                            Ver todos os {metaDocs.length} documentos <ChevronRight className="h-4 w-4" />
                        </button>
                    )}
                </section>

                {/* ── F. BENEFICIOS ────────────────────────────────────────── */}
                {hasBenefits && (
                    <section className="bg-green-50 rounded-2xl border border-green-200 p-5 sm:p-6">
                        <h3 className={`${sourceSerif.className} text-lg font-bold text-green-800 mb-3`}>
                            Benefícios desta proposta
                        </h3>
                        <div className="space-y-2">
                            {benefits.map((b, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm text-green-800">{b.label}</p>
                                        {b.savings > 0 && (
                                            <p className="text-sm font-bold text-green-700">
                                                Economia: -${b.savings.toFixed(2)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {totalBenefitSavings > 0 && (
                            <div className="mt-4 pt-3 border-t border-green-300 flex justify-between items-center">
                                <span className="text-sm font-bold text-green-800">Total economizado</span>
                                <span className={`${sourceSerif.className} text-xl font-bold text-green-700`}>
                                    -${totalBenefitSavings.toFixed(2)}
                                </span>
                            </div>
                        )}
                    </section>
                )}

                {/* ── H. PRICING ───────────────────────────────────────────── */}
                <section className="bg-white rounded-2xl border border-[#E8D5C0]/50 p-5 sm:p-6 shadow-sm">
                    <h3 className={`${sourceSerif.className} text-lg font-bold text-[#2D2A26] mb-4`}>
                        Detalhamento Financeiro
                    </h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-[#6B6560]">Subtotal tradução ({totalPages} págs)</span>
                            <span className="font-bold">${financialSummary.billableBasePrice.toFixed(2)}</span>
                        </div>
                        {financialSummary.urgencyFee > 0 && (
                            <div className="flex justify-between text-[#B87333]">
                                <span>Taxa de urgencia</span>
                                <span className="font-bold">+${financialSummary.urgencyFee.toFixed(2)}</span>
                            </div>
                        )}
                        {financialSummary.notaryFee > 0 && (
                            <div className="flex justify-between text-blue-600">
                                <span>Notarizacao oficial</span>
                                <span className="font-bold">+${financialSummary.notaryFee.toFixed(2)}</span>
                            </div>
                        )}
                        {financialSummary.totalSavings > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>Economia (páginas excluídas)</span>
                                <span className="font-bold">-${financialSummary.totalSavings.toFixed(2)}</span>
                            </div>
                        )}
                        {financialSummary.paymentDiscountAmount > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>Desconto pagamento integral (5%)</span>
                                <span className="font-bold">-${financialSummary.paymentDiscountAmount.toFixed(2)}</span>
                            </div>
                        )}
                        {financialSummary.manualDiscountAmount > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>
                                    Desconto {financialSummary.manualDiscountType === 'percent' ? `(${financialSummary.manualDiscountValue}%)` : 'concedido'}
                                </span>
                                <span className="font-bold">-${financialSummary.manualDiscountAmount.toFixed(2)}</span>
                            </div>
                        )}
                        {financialSummary.operationalAdjustmentAmount > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>Cortesia operacional</span>
                                <span className="font-bold">-${financialSummary.operationalAdjustmentAmount.toFixed(2)}</span>
                            </div>
                        )}

                        <div className="border-t border-[#E8D5C0] pt-3 mt-3 flex justify-between items-end">
                            <span className="text-[#6B6560] font-bold">Total a pagar</span>
                            <span className={`${sourceSerif.className} text-3xl font-bold text-[#B87333]`}>
                                ${financialSummary.totalPayable.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </section>

                {/* ── I. BOTAO APROVAR ─────────────────────────────────────── */}
                {canApprove && (
                    <button
                        onClick={() => setShowApproveModal(true)}
                        className="w-full bg-[#B87333] hover:bg-[#8B5A2B] text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-[#B87333]/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                        Aprovar Proposta
                    </button>
                )}

                {approvedLocally && (
                    <div className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-lg text-center flex items-center justify-center gap-2">
                        <CheckCircle className="h-5 w-5" /> Proposta Aprovada
                    </div>
                )}

                {/* ── J. PAGAMENTO ─────────────────────────────────────────── */}
                {(isAwaitingPayment || approvedLocally) && !isExpired && (
                    <section className="bg-white rounded-2xl border border-[#E8D5C0]/50 p-5 sm:p-6 shadow-sm">
                        <h3 className={`${sourceSerif.className} text-lg font-bold text-[#2D2A26] mb-4`}>
                            Formas de Pagamento
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="border border-[#E8D5C0]/50 rounded-xl p-4 text-center">
                                <p className="text-xs font-bold text-[#9C9A92] uppercase tracking-wider mb-2">Zelle</p>
                                <p className="text-sm font-bold text-[#2D2A26]">zelle@promobi.us</p>
                                <p className="text-xs text-[#6B6560] mt-1">Promobi Corporate Services LLC</p>
                            </div>
                            <div className="border border-[#E8D5C0]/50 rounded-xl p-4 text-center">
                                <p className="text-xs font-bold text-[#9C9A92] uppercase tracking-wider mb-2">Pix / Boleto</p>
                                <a
                                    href={`${WHATSAPP_LINK}?text=${encodeURIComponent(`Olá, gostaria dos dados para pagamento via Pix da proposta #${order.id}`)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm font-bold text-green-600 hover:underline"
                                >
                                    Solicitar via WhatsApp
                                </a>
                            </div>
                            <div className="border border-[#E8D5C0]/50 rounded-xl p-4 text-center">
                                <p className="text-xs font-bold text-[#9C9A92] uppercase tracking-wider mb-2">Cartão</p>
                                <a
                                    href={`${WHATSAPP_LINK}?text=${encodeURIComponent(`Olá, gostaria do link de pagamento por cartão da proposta #${order.id}`)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm font-bold text-[#B87333] hover:underline"
                                >
                                    Solicitar link de pagamento
                                </a>
                            </div>
                        </div>
                    </section>
                )}

                {/* ── K. ACOES ─────────────────────────────────────────────── */}
                <section className="flex flex-col sm:flex-row gap-3">
                    <button
                        onClick={handleDownloadPDF}
                        disabled={isGeneratingPDF}
                        className="flex-1 inline-flex items-center justify-center gap-2 border border-[#E8D5C0] bg-white hover:bg-[#FAFAF7] text-[#2D2A26] px-6 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        {isGeneratingPDF ? 'Gerando PDF...' : 'Baixar PDF'}
                    </button>
                    <a
                        href={`${WHATSAPP_LINK}?text=${encodeURIComponent(`Olá, tenho uma dúvida sobre a proposta #${order.id}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors"
                    >
                        <Smartphone className="h-4 w-4" /> Falar no WhatsApp
                    </a>
                </section>
            </main>

            {/* ── L. FOOTER ───────────────────────────────────────────────── */}
            <footer className="max-w-3xl mx-auto px-4 sm:px-6 mt-12 pb-8">
                <div className="border-t border-[#E8D5C0]/40 pt-8">
                    <div className="flex flex-wrap items-center justify-center gap-6 mb-6">
                        {[
                            { src: '/logo-notary.png', alt: 'Florida Notary Public' },
                            { src: '/logo-ata.png', alt: 'ATA Member' },
                            { src: '/atif.png', alt: 'ATIF Member' },
                        ].map((badge) => (
                            <img
                                key={badge.alt}
                                src={badge.src}
                                alt={badge.alt}
                                className="h-10 sm:h-12 w-auto object-contain opacity-60"
                            />
                        ))}
                    </div>
                    <div className="text-center text-xs text-[#9C9A92] space-y-1">
                        <p className="font-bold">Promobi Corporate Services LLC</p>
                        <p>4700 Millenia Blvd, Orlando, FL 32839, USA</p>
                        <p>(407) 639-6154 · desk@promobidocs.com · www.promobidocs.com</p>
                        <p className="mt-3 text-[10px]">
                            Esta proposta é confidencial e destinada exclusivamente ao destinatário identificado.
                            Os valores são válidos conforme a data de validade indicada.
                        </p>
                    </div>
                </div>
            </footer>

            {/* ── MODAL APROVAR ────────────────────────────────────────────── */}
            <AnimatePresence>
                {showApproveModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                        onClick={() => setShowApproveModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
                        >
                            <h3 className={`${sourceSerif.className} text-xl font-bold text-[#2D2A26] mb-3`}>
                                Confirmar aprovação
                            </h3>
                            <p className="text-sm text-[#6B6560] mb-6">
                                Ao aprovar, você confirma que revisou os documentos e valores apresentados.
                                Deseja continuar?
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowApproveModal(false)}
                                    className="flex-1 border border-[#E8D5C0] text-[#6B6560] py-2.5 rounded-xl font-bold text-sm hover:bg-[#FAFAF7] transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleApprove}
                                    disabled={isApproving}
                                    className="flex-1 bg-[#B87333] hover:bg-[#8B5A2B] text-white py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                                >
                                    {isApproving ? 'Aprovando...' : 'Sim, aprovar'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
