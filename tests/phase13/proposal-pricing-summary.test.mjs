import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('shared proposal pricing helper tracks full base, savings, and reduced-base volume discount', () => {
  const helper = read('lib/proposalPricingSummary.ts')

  assert.match(helper, /export function calculateProposalBreakdown/)
  assert.match(helper, /export function calculateCanonicalProposalTotal/)
  assert.match(helper, /export function calculateManualProposalDiscount/)
  assert.match(helper, /export function sanitizeProposalBreakdown/)
  assert.match(helper, /fullBasePrice/)
  assert.match(helper, /totalSavings: roundCurrency\(fullBasePrice - basePrice\)/)
  assert.match(helper, /const volumeDiscountAmount = roundCurrency\(\s*baseWithUrgency \* \(volumeDiscountPercentage \/ 100\)/)
  assert.match(helper, /manualDiscountAmount = roundCurrency\(asNumber\(breakdown\.manualDiscountAmount\)\)/)
  assert.match(helper, /basePrice \+/)
  assert.match(helper, /urgencyFee \+/)
  assert.match(helper, /notaryFee -/)
  assert.match(helper, /volumeDiscountAmount -/)
  assert.match(helper, /manualDiscountAmount -/)
  assert.match(helper, /operationalAdjustmentAmount/)
})

test('manual proposal flow persists full base and savings into breakdown metadata', () => {
  const manualPage = read('app/admin/orcamento-manual/page.tsx')

  assert.match(manualPage, /calculateProposalBreakdown/)
  assert.match(manualPage, /fullBasePrice: 0/)
  assert.match(manualPage, /totalSavings: 0/)
  assert.match(manualPage, /excludedPages: 0/)
  assert.match(manualPage, /setBreakdown\(nextBreakdown\)/)
  assert.match(manualPage, /manualDiscountAmount: manualDiscount\.manualDiscountAmount/)
})

test('concierge flow uses the shared proposal breakdown helper as the internal pricing source-of-truth', () => {
  const conciergePage = read('app/admin/concierge/page.tsx')

  assert.match(conciergePage, /calculateProposalBreakdown/)
  assert.match(conciergePage, /fullBasePrice: 0/)
  assert.match(conciergePage, /totalSavings: 0/)
  assert.match(conciergePage, /setBreakdown\(nextBreakdown\)/)
  assert.match(conciergePage, /manualDiscountAmount: manualDiscount\.manualDiscountAmount/)
})

test('public proposal page reads the shared financial summary instead of recomputing optimization savings ad hoc', () => {
  const proposalClient = read('app/proposta/[order_id]/ProposalClient.tsx')

  assert.match(proposalClient, /deriveProposalFinancialSummary/)
  assert.match(proposalClient, /const financialSummary = deriveProposalFinancialSummary/)
  assert.match(proposalClient, /Valor Cheio/)
  assert.match(proposalClient, /Economia \(Páginas Excluídas\)/)
  assert.match(proposalClient, /Desconto Manual/)
  assert.doesNotMatch(proposalClient, /const optimizationSavings =/)
})

test('proposal PDF uses the shared financial summary and renders manual proposal discounts when present', () => {
  const proposalPdf = read('components/ProposalPDF.tsx')

  assert.match(proposalPdf, /deriveProposalFinancialSummary/)
  assert.match(proposalPdf, /const totalSavings = financialSummary\.totalSavings/)
  assert.match(proposalPdf, /const totalAmt = financialSummary\.totalPayable/)
  assert.match(proposalPdf, /financialSummary\.paymentDiscountAmount/)
  assert.match(proposalPdf, /financialSummary\.manualDiscountAmount/)
  assert.match(proposalPdf, /financialSummary\.operationalAdjustmentAmount/)
  assert.match(proposalPdf, /DESCONTO MANUAL/)
  assert.doesNotMatch(proposalPdf, /\+ \(order\.extraDiscount \|\| 0\)/)
})

test('admin order detail modal uses the shared financial summary for internal review', () => {
  const orderDetailModal = read('app/admin/components/OrderDetailModal.tsx')

  assert.match(orderDetailModal, /deriveProposalFinancialSummary/)
  assert.match(orderDetailModal, /const financialSummary = deriveProposalFinancialSummary/)
  assert.match(orderDetailModal, /Valor Cheio/)
  assert.match(orderDetailModal, /Economia por Exclusão/)
  assert.match(orderDetailModal, /Desconto de Volume/)
  assert.match(orderDetailModal, /Desconto Manual/)
  assert.match(orderDetailModal, /Total a Pagar/)
})

test('proposal creation flow persists manual discounts and budget card exposes both input modes', () => {
  const createOrder = read('app/actions/create-order.ts')
  const budgetCard = read('components/Budget/BudgetSummaryCard.tsx')

  assert.match(createOrder, /sanitizeProposalBreakdown/)
  assert.match(createOrder, /calculateCanonicalProposalTotal/)
  assert.match(createOrder, /manualDiscountAmount \|\| 0/)
  assert.match(createOrder, /extraDiscount: data\.extraDiscount \|\| 0/)
  assert.match(budgetCard, /Aplicar Desconto/)
  assert.match(budgetCard, /discountType/)
})
