import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('manual payment action no longer delegates to DeepL confirmation flow and uses Anthropic route trigger', () => {
  const action = read('app/actions/manualPaymentBypass.ts')

  assert.match(action, /export async function registerManualPayment/)
  assert.doesNotMatch(action, /confirmPayment\(/)
  assert.match(action, /\/api\/translate\/claude/)
  assert.doesNotMatch(action, /functions\/v1\/translate-order/)
  assert.match(action, /resolveProductionReleasePolicy/)
  assert.match(action, /shouldReleaseOperationalWorkflow/)
})

test('manual payment UI now exposes register-payment modal microcopy and amount-driven summary', () => {
  const sharedButton = read('components/admin/RegisterManualPaymentButton.tsx')
  const workbenchButton = read('app/admin/orders/[id]/components/ManualApprovalButton.tsx')
  const legacyButton = read('components/admin/ConfirmPaymentButton.tsx')

  assert.match(sharedButton, /Register manual payment/)
  assert.match(sharedButton, /Amount received/)
  assert.match(sharedButton, /Order total/)
  assert.match(sharedButton, /Already received/)
  assert.match(sharedButton, /Remaining balance/)
  assert.match(sharedButton, /Status after this payment/)
  assert.match(workbenchButton, /Register manual payment/)
  assert.match(legacyButton, /Register manual payment/)
})

test('finance dashboard reads installment ledger and displays financial status independent of workflow', () => {
  const finance = read('app/admin/finance/page.tsx')

  assert.match(finance, /readFinancialLedger/)
  assert.match(finance, /Financial status is tracked independently from operational workflow status/)
  assert.match(finance, /Partially paid/)
  assert.match(finance, /remaining/i)
  assert.match(finance, /workflow:/)
})
