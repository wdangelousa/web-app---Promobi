import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('structured kit builder keeps strict parity as default and supports explicit decision modes', () => {
  const kit = read('services/structuredPreviewKit.ts')

  assert.match(kit, /const PAGE_PARITY_DEFAULT_MODE = 'strict_all_pages' as const/)
  assert.match(kit, /function evaluatePageParity\(/)
  assert.match(kit, /page_parity_decision_required/)
  assert.match(kit, /manual_override/)
  assert.match(kit, /blockingReason: 'page_parity_mismatch'/)
  assert.match(kit, /blockingReason: 'page_parity_unverifiable_source_page_count'/)
  assert.match(kit, /translated_zone_content_missing_or_source_language_detected/)
  assert.match(kit, /parity_status: 'pass'/)
  assert.match(kit, /parity_status: 'fail'/)
  assert.match(kit, /certification_generation_blocked: true/)
  assert.match(kit, /function logPageParityDiagnostics\(/)
})

test('preview and delivery kit actions propagate parity decision-required and hard failures', () => {
  const previewAction = read('app/actions/previewStructuredKit.ts')
  const deliveryAction = read('app/actions/generateDeliveryKit.ts')

  assert.match(previewAction, /parityDecisionRequired/)
  assert.match(previewAction, /kit\.parityDecisionRequired && kit\.parityDecisionContext/)
  assert.match(previewAction, /kit\.blockingReason === 'page_parity_mismatch'/)
  assert.match(previewAction, /kit\.blockingReason === 'page_parity_unverifiable_source_page_count'/)
  assert.match(previewAction, /kit\.blockingReason === 'translated_zone_content_missing_or_source_language_detected'/)

  assert.match(deliveryAction, /buildResult\.blockingReason === "page_parity_decision_required"/)
  assert.match(deliveryAction, /buildResult\.blockingReason === "page_parity_mismatch"/)
  assert.match(deliveryAction, /buildResult\.blockingReason === "page_parity_unverifiable_source_page_count"/)
  assert.match(deliveryAction, /buildResult\.blockingReason === "translated_zone_content_missing_or_source_language_detected"/)
})

test('release guard stays strict by default but honors approved parity overrides', () => {
  const workbench = read('app/actions/workbench.ts')

  assert.match(workbench, /getPageParityRegistryRecord/)
  assert.match(workbench, /const pageParityMode/)
  assert.match(workbench, /const translatedPageCount = deliveryTotalPageCount - 1 - sourcePageCount/)
  assert.match(workbench, /manual_override_approved/)
  assert.match(workbench, /page_parity_mode:/)
  assert.match(workbench, /blocking_reason: 'page_parity_mismatch'/)
  assert.match(workbench, /blocking_reason: 'page_parity_unverifiable_source_page_count'/)
  assert.match(workbench, /Release blocked by absolute page-parity rule/)
  assert.match(workbench, /function logReleasePageParityDiagnostics\(/)
})

test('capability model and structured guard expose page-parity readiness metadata', () => {
  const registry = read('services/documentFamilyRegistry.ts')
  const guard = read('services/structuredDocumentRenderer.ts')

  assert.match(registry, /exactPageParitySupported: boolean/)
  assert.match(registry, /parityCompactionProfile: FamilyParityCompactionProfile/)
  assert.match(registry, /maxSafeDensityProfile: FamilyMaxSafeDensityProfile/)
  assert.match(registry, /certificationPagePolicy: FamilyCertificationPagePolicy/)
  assert.match(guard, /if \(!familyClientFacingCapability\.exactPageParitySupported\)/)
})

test('legacy manual completion path remains blocked while parity is mandatory for release', () => {
  const adminOrdersAction = read('app/actions/adminOrders.ts')
  const workbench = read('app/actions/workbench.ts')

  assert.match(adminOrdersAction, /Manual completion is disabled/i)
  assert.match(workbench, /absolute page-parity rule/i)
})
