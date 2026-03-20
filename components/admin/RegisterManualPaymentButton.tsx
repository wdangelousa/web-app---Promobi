'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, Loader2 } from 'lucide-react'
import { registerManualPayment } from '@/app/actions/manualPaymentBypass'
import { deriveFinancialStatus, roundMoney, type FinancialStatus } from '@/lib/manualPayment'
import { UI_Z_INDEX } from '@/lib/uiZIndex'
import ModalPortal from '@/components/ui/ModalPortal'

interface RegisterManualPaymentButtonProps {
    orderId: number
    orderTotal: number
    amountAlreadyReceived: number
    currentFinancialStatus?: FinancialStatus
    triggerLabel?: string
    triggerClassName?: string
    onCompleted?: (result: {
        operationalStatus?: string
        financialStatus?: string
        amountReceived?: number
        remainingBalance?: number
        productionReleased?: boolean
    }) => void
}

const PAYMENT_METHOD_OPTIONS = [
    { value: '', label: 'Select method (optional)' },
    { value: 'ZELLE', label: 'Zelle' },
    { value: 'PIX', label: 'Pix' },
    { value: 'STRIPE', label: 'Card / Stripe' },
    { value: 'PARCELADO_USA', label: 'Parcelado USA' },
    { value: 'BANK_TRANSFER', label: 'Bank transfer' },
    { value: 'CASH', label: 'Cash' },
    { value: 'OTHER', label: 'Other' },
]

const STATUS_LABEL: Record<FinancialStatus, string> = {
    unpaid: 'Unpaid',
    partially_paid: 'Partially paid',
    paid: 'Paid',
    overpaid: 'Overpaid',
}

const STATUS_CLASS: Record<FinancialStatus, string> = {
    unpaid: 'bg-slate-100 text-slate-700 border-slate-200',
    partially_paid: 'bg-amber-50 text-amber-800 border-amber-200',
    paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    overpaid: 'bg-cyan-50 text-cyan-800 border-cyan-200',
}

function toInputDate(value: Date): string {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function parseAmount(raw: string): number | null {
    if (!raw.trim()) return null
    const parsed = Number(raw.replace(',', '.'))
    if (!Number.isFinite(parsed)) return null
    return roundMoney(parsed)
}

function money(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        Number.isFinite(value) ? value : 0,
    )
}

export default function RegisterManualPaymentButton({
    orderId,
    orderTotal,
    amountAlreadyReceived,
    currentFinancialStatus,
    triggerLabel = 'Register manual payment',
    triggerClassName = 'bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
    onCompleted,
}: RegisterManualPaymentButtonProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [amountNow, setAmountNow] = useState('')
    const [paymentDate, setPaymentDate] = useState<string>(() => toInputDate(new Date()))
    const [paymentMethod, setPaymentMethod] = useState('')
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const safeOrderTotal = roundMoney(Math.max(orderTotal || 0, 0))
    const safeAlreadyReceived = roundMoney(Math.max(amountAlreadyReceived || 0, 0))

    const summary = useMemo(() => {
        const parsed = parseAmount(amountNow)
        const now = parsed && parsed > 0 ? parsed : 0
        const nextReceived = roundMoney(safeAlreadyReceived + now)
        const remaining = roundMoney(Math.max(safeOrderTotal - nextReceived, 0))
        const status = deriveFinancialStatus(safeOrderTotal, nextReceived)

        return { now, nextReceived, remaining, status, parsed }
    }, [amountNow, safeAlreadyReceived, safeOrderTotal])

    const currentStatus = currentFinancialStatus ?? deriveFinancialStatus(safeOrderTotal, safeAlreadyReceived)

    const closeModal = () => {
        if (loading) return
        setOpen(false)
        setAmountNow('')
        setPaymentMethod('')
        setNotes('')
        setError(null)
    }

    const handleConfirm = async () => {
        const parsedAmount = summary.parsed
        if (!parsedAmount || parsedAmount <= 0) {
            setError('Enter a valid received amount.')
            return
        }
        if (!paymentDate) {
            setError('Select a payment date.')
            return
        }

        setLoading(true)
        setError(null)
        try {
            const result = await registerManualPayment(orderId, {
                amountReceived: parsedAmount,
                paymentDate: new Date(paymentDate).toISOString(),
                paymentMethod: paymentMethod || null,
                notes: notes.trim() || null,
            })

            if (!result.success) {
                setError(result.message || 'Failed to register payment.')
                return
            }

            onCompleted?.({
                operationalStatus: result.operationalStatus,
                financialStatus: result.financialStatus,
                amountReceived: result.amountReceived,
                remainingBalance: result.remainingBalance,
                productionReleased: result.productionReleased,
            })
            closeModal()
            router.refresh()
            alert(result.message)
        } catch (err: any) {
            setError(err?.message || 'Failed to register payment.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className={`inline-flex items-center gap-1.5 ${triggerClassName}`}
            >
                <DollarSign className="h-3.5 w-3.5" />
                {triggerLabel}
            </button>

            {open && (
                <ModalPortal>
                    <div
                        className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
                        style={{ zIndex: UI_Z_INDEX.modalOverlay }}
                        onClick={closeModal}
                    >
                        <div
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-gray-200 overflow-hidden"
                            style={{ zIndex: UI_Z_INDEX.modalContent }}
                            onClick={(e) => e.stopPropagation()}
                        >
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h2 className="text-lg font-bold text-gray-900">Register manual payment</h2>
                            <p className="text-xs text-gray-600 mt-1">
                                Enter the amount received to update the financial status of this order and release the operational workflow according to Promobi policy.
                            </p>
                        </div>

                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                        Amount received <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={amountNow}
                                        onChange={(e) => {
                                            setAmountNow(e.target.value)
                                            setError(null)
                                        }}
                                        placeholder="0.00"
                                        className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                                        disabled={loading}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                        Payment date <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={paymentDate}
                                        onChange={(e) => {
                                            setPaymentDate(e.target.value)
                                            setError(null)
                                        }}
                                        className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                        Payment method
                                    </label>
                                    <select
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                                        disabled={loading}
                                    >
                                        {PAYMENT_METHOD_OPTIONS.map((opt) => (
                                            <option key={opt.value || 'empty'} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                        Financial status now
                                    </label>
                                    <span
                                        className={`inline-flex h-10 items-center px-3 rounded-lg border text-xs font-bold ${STATUS_CLASS[currentStatus]}`}
                                    >
                                        {STATUS_LABEL[currentStatus]}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                    Notes
                                </label>
                                <textarea
                                    rows={3}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Optional"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                                    disabled={loading}
                                />
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Summary</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Order total</span>
                                        <span className="font-semibold text-gray-900">{money(safeOrderTotal)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Already received</span>
                                        <span className="font-semibold text-gray-900">{money(safeAlreadyReceived)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Received now</span>
                                        <span className="font-semibold text-gray-900">{money(summary.now)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Remaining balance</span>
                                        <span className="font-semibold text-gray-900">{money(summary.remaining)}</span>
                                    </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                                    <span className="text-xs font-semibold text-gray-500">Status after this payment</span>
                                    <span
                                        className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold ${STATUS_CLASS[summary.status]}`}
                                    >
                                        {STATUS_LABEL[summary.status]}
                                    </span>
                                </div>
                            </div>

                            {error && (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    {error}
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button
                                onClick={closeModal}
                                disabled={loading}
                                className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-white transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={loading || !summary.parsed || summary.parsed <= 0}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                                Confirm payment
                            </button>
                        </div>
                        </div>
                    </div>
                </ModalPortal>
            )}
        </>
    )
}
