'use client'

import { useMemo } from 'react'
import RegisterManualPaymentButton from '@/components/admin/RegisterManualPaymentButton'
import { readFinancialLedger, type FinancialStatus } from '@/lib/manualPayment'

interface Order {
  id: number
  status: string
  totalAmount: number
  metadata?: string | Record<string, unknown> | null
  finalPaidAmount?: number | null
}

interface ConfirmPaymentButtonProps {
  order: Order
  confirmedByName?: string
  onConfirmed?: (result?: { operationalStatus?: string; financialStatus?: string }) => void
}

function parseMetadata(input: Order['metadata']): Record<string, unknown> {
  if (!input) return {}
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return typeof input === 'object' ? (input as Record<string, unknown>) : {}
}

export function ConfirmPaymentButton({
  order,
  onConfirmed,
}: ConfirmPaymentButtonProps) {
  const canRegister = order.status !== 'CANCELLED'
  if (!canRegister) return null

  const metadata = useMemo(() => parseMetadata(order.metadata), [order.metadata])
  const snapshot = useMemo(
    () =>
      readFinancialLedger(
        metadata,
        order.totalAmount ?? 0,
        typeof order.finalPaidAmount === 'number' ? order.finalPaidAmount : null,
      ),
    [metadata, order.totalAmount, order.finalPaidAmount],
  )

  return (
    <RegisterManualPaymentButton
      orderId={order.id}
      orderTotal={order.totalAmount}
      amountAlreadyReceived={snapshot.amountReceived}
      currentFinancialStatus={snapshot.status as FinancialStatus}
      triggerLabel="Register manual payment"
      triggerClassName="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all text-sm"
      onCompleted={(result) => onConfirmed?.(result)}
    />
  )
}
