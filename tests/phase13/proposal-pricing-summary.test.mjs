import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('shared proposal pricing helper tracks full base, savings, and reduced-base volume discount', () => {
  const helper = read('lib/proposalPricingSummary.ts')

  assert.match(helper, /export function calculateProposalBreakdown/)
  assert.match(helper, /fullBasePrice/)
  assert.match(helper, /totalSavings: roundCurrency\(fullBasePrice - basePrice\)/)
  assert.match(helper, /const volumeDiscountAmount = roundCurrency\(\s*baseWithUrgency \* \(volumeDiscountPercentage \/ 100\)/)
  assert.match(helper, /totalPayable \+/)
  assert.match(helper, /totalSavings \+/)
  assert.match(helper, /volumeDiscountAmount \+/)
  assert.match(helper, /operationalAdjustmentAmount \+/)
  assert.match(helper, /manualDiscountAmount \-/)
  assert.match(helper, /urgencyFee \-/)
  assert.match(helper, /notaryFee/)
})

test('manual proposal flow persists full base and savings into breakdown metadata', () => {
  const manualPage = read('app/admin/orcamento-manual/page.tsx')

  assert.match(manualPage, /calculateProposalBreakdown/)
  assert.match(manualPage, /fullBasePrice: 0/)
  assert.match(manualPage, /totalSavings: 0/)
  assert.match(manualPage, /excludedPages: 0/)
  assert.match(manualPage, /setBreakdown\(nextBreakdown\)/)
})

test('concierge flow uses the shared proposal breakdown helper as the internal pricing source-of-truth', () => {
  const conciergePage = read('app/admin/concierge/page.tsx')

  assert.match(conciergePage, /calculateProposalBreakdown/)
  assert.match(conciergePage, /fullBasePrice: 0/)
  assert.match(conciergePage, /totalSavings: 0/)
  assert.match(conciergePage, /setBreakdown\(nextBreakdown\)/)
})

test('public proposal page reads the shared financial summary instead of recomputing optimization savings ad hoc', () => {
  const proposalClient = read('app/proposta/[order_id]/ProposalClient.tsx')

  assert.match(proposalClient, /deriveProposalFinancialSummary/)
  assert.match(proposalClient, /const financialSummary = deriveProposalFinancialSummary/)
  assert.match(proposalClient, /Valor Cheio/)
  assert.match(proposalClient, /Economia \(Páginas Excluídas\)/)
  assert.doesNotMatch(proposalClient, /const optimizationSavings =/)
})

test('proposal PDF uses the shared financial summary and no longer mixes extraDiscount into memorial savings', () => {
  const proposalPdf = read('components/ProposalPDF.tsx')

  assert.match(proposalPdf, /deriveProposalFinancialSummary/)
  assert.match(proposalPdf, /const totalSavings = financialSummary\.totalSavings/)
  assert.match(proposalPdf, /financialSummary\.paymentDiscountAmount/)
  assert.match(proposalPdf, /financialSummary\.operationalAdjustmentAmount/)
  assert.doesNotMatch(proposalPdf, /\+ \(order\.extraDiscount \|\| 0\)/)
})

test('admin order detail modal uses the shared financial summary for internal review', () => {
  const orderDetailModal = read('app/admin/components/OrderDetailModal.tsx')

  assert.match(orderDetailModal, /deriveProposalFinancialSummary/)
  assert.match(orderDetailModal, /const financialSummary = deriveProposalFinancialSummary/)
  assert.match(orderDetailModal, /Valor Cheio/)
  assert.match(orderDetailModal, /Economia por Exclusão/)
  assert.match(orderDetailModal, /Desconto de Volume/)
  assert.match(orderDetailModal, /Total a Pagar/)
})
