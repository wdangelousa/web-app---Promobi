import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('confirm-payment uses the shared manual-payment workflow instead of the legacy edge function', () => {
  const action = read('app/actions/confirm-payment.ts')

  assert.match(action, /registerManualPayment/)
  assert.match(action, /readFinancialLedger/)
  assert.doesNotMatch(action, /functions\/v1\/translate-order/)
})

test('schema and order creation support optional dueDate and scopedFileUrl fields', () => {
  const schema = read('prisma/schema.prisma')
  const createOrder = read('app/actions/create-order.ts')

  assert.match(schema, /dueDate\s+DateTime\?/)
  assert.match(schema, /scopedFileUrl\s+String\?/)
  assert.match(createOrder, /dueDate:\s*dueDate \?\? undefined/)
  assert.match(createOrder, /dueDate:\s*dueDate\?\.toISOString\(\) \?\? null/)
})

test('scope reduction no longer overwrites finalPaidAmount and stores summary in metadata', () => {
  const action = read('app/actions/scope-reduction.ts')

  assert.match(action, /scopeReductionSummary/)
  assert.doesNotMatch(action, /finalPaidAmount:\s*newEffectiveTotal/)
})

test('reopen flow preserves pricing and financial ledger columns', () => {
  const sql = read('supabase/migrations/20260309_reopen_quote.sql')
  const adminAction = read('app/actions/adminOrders.ts')

  assert.doesNotMatch(sql, /"finalPaidAmount"\s*=\s*NULL/)
  assert.doesNotMatch(sql, /"extraDiscount"\s*=\s*0/)
  assert.match(adminAction, /status:\s*'PENDING'/)
  assert.doesNotMatch(adminAction, /finalPaidAmount:\s*null/)
})

test('preview, delivery, and workbench flows resolve scoped source files before falling back to original files', () => {
  const preview = read('app/actions/previewStructuredKit.ts')
  const delivery = read('app/actions/generateDeliveryKit.ts')
  const workbench = read('app/actions/workbench.ts')

  assert.match(preview, /resolveDocumentSourceFileUrl/)
  assert.match(delivery, /resolveDocumentSourceFileUrl/)
  assert.match(workbench, /resolveDocumentSourceFileUrl/)
})
