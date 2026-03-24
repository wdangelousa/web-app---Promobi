import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function asNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100
}

function safeMetadata(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' ? raw : {}
}

function sanitizeProposalBreakdown(rawBreakdown) {
  const breakdown = safeMetadata(rawBreakdown)

  return {
    ...breakdown,
    manualDiscountAmount: 0,
  }
}

function calculateCanonicalProposalTotal({ breakdown, operationalAdjustmentAmount }) {
  const sanitizedBreakdown = sanitizeProposalBreakdown(breakdown)
  const basePrice = roundCurrency(asNumber(sanitizedBreakdown.basePrice))
  const urgencyFee = roundCurrency(asNumber(sanitizedBreakdown.urgencyFee))
  const notaryFee = roundCurrency(asNumber(sanitizedBreakdown.notaryFee))
  const volumeDiscountAmount = roundCurrency(asNumber(sanitizedBreakdown.volumeDiscountAmount))
  const paymentDiscountAmount = roundCurrency(asNumber(sanitizedBreakdown.totalDiscountApplied))
  const operationalAdjustment = roundCurrency(asNumber(operationalAdjustmentAmount))

  return roundCurrency(
    basePrice +
      urgencyFee +
      notaryFee -
      volumeDiscountAmount -
      paymentDiscountAmount -
      operationalAdjustment,
  )
}

async function main() {
  const rawOrderId = process.argv[2]
  const orderId = Number.parseInt(rawOrderId ?? '', 10)
  const shouldWrite = process.argv.includes('--write')

  if (!Number.isInteger(orderId) || orderId <= 0) {
    console.error('Uso: node scripts/repair-proposal-financials.mjs <orderId> [--write]')
    process.exit(1)
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      totalAmount: true,
      extraDiscount: true,
      discountAmount: true,
      metadata: true,
    },
  })

  if (!order) {
    console.error(`Pedido #${orderId} não encontrado.`)
    process.exit(1)
  }

  const metadata = typeof order.metadata === 'string' && order.metadata.length > 0
    ? JSON.parse(order.metadata)
    : {}
  const sanitizedBreakdown = sanitizeProposalBreakdown(metadata?.breakdown)
  const correctedTotal = calculateCanonicalProposalTotal({
    breakdown: sanitizedBreakdown,
    operationalAdjustmentAmount: order.extraDiscount ?? 0,
  })
  const correctedDiscountAmount =
    Number(sanitizedBreakdown.volumeDiscountAmount || 0) +
    Number(sanitizedBreakdown.totalDiscountApplied || 0)

  if (shouldWrite) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        totalAmount: correctedTotal,
        discountAmount: correctedDiscountAmount,
        metadata: JSON.stringify({
          ...metadata,
          breakdown: sanitizedBreakdown,
        }),
      },
    })
  }

  console.log(JSON.stringify({
    orderId,
    dryRun: shouldWrite ? 'no' : 'yes',
    previousTotalAmount: order.totalAmount,
    correctedTotalAmount: correctedTotal,
    previousDiscountAmount: order.discountAmount,
    correctedDiscountAmount,
    previousManualDiscountAmount: metadata?.breakdown?.manualDiscountAmount ?? null,
    correctedManualDiscountAmount: sanitizedBreakdown.manualDiscountAmount ?? 0,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error('Falha ao reparar proposta:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })