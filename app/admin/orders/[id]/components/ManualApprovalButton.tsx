'use client'

import RegisterManualPaymentButton from '@/components/admin/RegisterManualPaymentButton'
import { type FinancialStatus } from '@/lib/manualPayment'

interface ManualApprovalButtonProps {
    orderId: number
    orderTotal: number
    amountAlreadyReceived: number
    currentFinancialStatus: FinancialStatus
}

export default function ManualApprovalButton({
    orderId,
    orderTotal,
    amountAlreadyReceived,
    currentFinancialStatus,
}: ManualApprovalButtonProps) {
    return (
        <RegisterManualPaymentButton
            orderId={orderId}
            orderTotal={orderTotal}
            amountAlreadyReceived={amountAlreadyReceived}
            currentFinancialStatus={currentFinancialStatus}
            triggerLabel="Register manual payment"
            triggerClassName="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors"
        />
    )
}
