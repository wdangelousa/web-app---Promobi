import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('workbench actions support partial selected-document dispatch with per-document sent metadata', () => {
  const workbench = read('app/actions/workbench.ts')

  assert.match(workbench, /export async function sendSelectedDocuments\(/)
  assert.match(workbench, /selectedDocumentIds\?: number\[\]/)
  assert.match(workbench, /const docsToRelease = order\.documents\.filter\(\(d\) => selectedDocIdSet\.has\(d\.id\)\)/)
  assert.match(workbench, /for \(const d of docsToRelease\)/)
  assert.match(workbench, /upsertDocumentDeliveryStatusRecord/)
  assert.match(workbench, /readDocumentDeliveryStatusRegistry/)
  assert.match(workbench, /lifecycleStatus:\s*'sent'\s*\|\s*'partially_sent'/)
  assert.match(workbench, /const shouldMarkOrderCompleted = lifecycleStatus === 'sent'/)
  assert.match(workbench, /const nextOrderStatus = shouldMarkOrderCompleted \? 'COMPLETED' : order\.status/)
})

test('delivery generation no longer mutates review\/approval status when kit is generated', () => {
  const generateDeliveryKit = read('app/actions/generateDeliveryKit.ts')

  assert.match(generateDeliveryKit, /delivery_pdf_url:\s*urlData\.publicUrl/)
  assert.doesNotMatch(generateDeliveryKit, /translation_status:\s*"approved"/)
})

test('admin workbench sends only selected docs and surfaces partial-send and review-friendly kit states', () => {
  const workbenchUi = read('app/admin/orders/[id]/components/Workbench.tsx')

  assert.match(workbenchUi, /const \{ sendSelectedDocuments \} = await import\('\.\.\/\.\.\/\.\.\/\.\.\/actions\/workbench'\)/)
  assert.match(workbenchUi, /sendSelectedDocuments\(order\.id,\s*selectedDocsForDelivery,\s*'Isabele'/)
  assert.match(workbenchUi, /releaseResult\.lifecycleStatus === 'partially_sent'/)
  assert.match(workbenchUi, /Status: Envio Parcial/)
  assert.match(workbenchUi, /Kit Gerado \(Aguardando revisão\)/)
  assert.match(workbenchUi, /Kit Gerado \+ Revisado/)
  assert.match(workbenchUi, /deliveryStatusRecord\?\.deliveryStatus === 'sent'/)
})
