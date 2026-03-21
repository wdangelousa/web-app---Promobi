/**
 * tests/phase13/single-page-safeguard.test.mjs
 *
 * Verifies the single-page routing safeguard:
 *   - SINGLE_PAGE_STRUCTURED_AI_WHITELIST contents
 *   - resolveSinglePageRouting outcomes for all routing cases
 *   - structuredPreviewKit.ts exposes singlePageExpansionDetected
 *   - previewStructuredKit.ts action imports and applies the safeguard
 *   - generateDeliveryKit.ts action imports and applies the safeguard
 *   - Telemetry log lines are present in the action files
 *
 * All tests run on source text only (no runtime imports, no DB, no Gotenberg).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

// ── SINGLE_PAGE_STRUCTURED_AI_WHITELIST ────────────────────────────────────────

test('singlePageSafeguard exports SINGLE_PAGE_STRUCTURED_AI_WHITELIST', () => {
  const src = read('lib/singlePageSafeguard.ts')

  assert.match(src, /export const SINGLE_PAGE_STRUCTURED_AI_WHITELIST/)
})

test('SINGLE_PAGE_STRUCTURED_AI_WHITELIST includes dedicated certificate renderers', () => {
  const src = read('lib/singlePageSafeguard.ts')

  assert.match(src, /'marriage_certificate_brazil'/)
  assert.match(src, /'birth_certificate_brazil'/)
  assert.match(src, /'course_certificate_landscape'/)
  assert.match(src, /'academic_diploma_certificate'/)
})

test('SINGLE_PAGE_STRUCTURED_AI_WHITELIST includes field-heavy forms', () => {
  const src = read('lib/singlePageSafeguard.ts')

  assert.match(src, /'civil_record_general'/)
  assert.match(src, /'identity_travel_record'/)
  assert.match(src, /'academic_transcript'/)
})

test('SINGLE_PAGE_STRUCTURED_AI_WHITELIST includes complex editorial layouts', () => {
  const src = read('lib/singlePageSafeguard.ts')

  assert.match(src, /'eb1_evidence_photo_sheet'/)
  assert.match(src, /'editorial_news_pages'/)
  assert.match(src, /'publication_media_record'/)
})

test('letters_and_statements is NOT in the whitelist', () => {
  const src = read('lib/singlePageSafeguard.ts')

  // The whitelist Set definition must not mention letters_and_statements
  const whitelistIdx = src.indexOf('SINGLE_PAGE_STRUCTURED_AI_WHITELIST = new Set')
  assert.ok(whitelistIdx > 0, 'whitelist Set definition must exist')
  // Find the closing bracket of the Set constructor
  const setStart = src.indexOf('[', whitelistIdx)
  const setEnd = src.indexOf(']', setStart)
  const whitelistBody = src.slice(setStart, setEnd)
  assert.doesNotMatch(whitelistBody, /'letters_and_statements'/)
})

test('recommendation_letter is NOT in the whitelist', () => {
  const src = read('lib/singlePageSafeguard.ts')

  const whitelistIdx = src.indexOf('SINGLE_PAGE_STRUCTURED_AI_WHITELIST = new Set')
  const setStart = src.indexOf('[', whitelistIdx)
  const setEnd = src.indexOf(']', setStart)
  const whitelistBody = src.slice(setStart, setEnd)
  assert.doesNotMatch(whitelistBody, /'recommendation_letter'/)
})

test('employment_record is NOT in the whitelist', () => {
  const src = read('lib/singlePageSafeguard.ts')

  const whitelistIdx = src.indexOf('SINGLE_PAGE_STRUCTURED_AI_WHITELIST = new Set')
  const setStart = src.indexOf('[', whitelistIdx)
  const setEnd = src.indexOf(']', setStart)
  const whitelistBody = src.slice(setStart, setEnd)
  assert.doesNotMatch(whitelistBody, /'employment_record'/)
})

// ── resolveSinglePageRouting ───────────────────────────────────────────────────

test('singlePageSafeguard exports resolveSinglePageRouting function', () => {
  const src = read('lib/singlePageSafeguard.ts')

  assert.match(src, /export function resolveSinglePageRouting\(/)
})

test('resolveSinglePageRouting returns not_single_page for sourcePageCount !== 1', () => {
  const src = read('lib/singlePageSafeguard.ts')

  assert.match(src, /return 'not_single_page'/)
  // Guard checks sourcePageCount !== 1
  assert.match(src, /sourcePageCount !== 1/)
})

test('resolveSinglePageRouting returns structured_ai_allowed for whitelisted types', () => {
  const src = read('lib/singlePageSafeguard.ts')

  assert.match(src, /return 'structured_ai_allowed'/)
  assert.match(src, /SINGLE_PAGE_STRUCTURED_AI_WHITELIST\.has\(documentType\)/)
})

test('resolveSinglePageRouting returns safeguard_blocked for non-whitelisted 1-page docs', () => {
  const src = read('lib/singlePageSafeguard.ts')

  assert.match(src, /return 'safeguard_blocked'/)
})

test('resolveSinglePageRouting accepts null and undefined for sourcePageCount', () => {
  const src = read('lib/singlePageSafeguard.ts')

  // Type guard must handle null and undefined
  assert.match(src, /typeof sourcePageCount !== 'number'/)
})

// ── SinglePageRoutingOutcome type ─────────────────────────────────────────────

test('singlePageSafeguard exports SinglePageRoutingOutcome type', () => {
  const src = read('lib/singlePageSafeguard.ts')

  assert.match(src, /export type SinglePageRoutingOutcome =/)
  assert.match(src, /\| 'structured_ai_allowed'/)
  assert.match(src, /\| 'safeguard_blocked'/)
  assert.match(src, /\| 'not_single_page'/)
})

// ── structuredPreviewKit.ts: singlePageExpansionDetected ──────────────────────

test('structuredPreviewKit.ts StructuredKitBuildResult includes singlePageExpansionDetected', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /singlePageExpansionDetected\?.*boolean/)
})

test('structuredPreviewKit.ts StructuredPreviewKitResult includes singlePageExpansionDetected', () => {
  const src = read('services/structuredPreviewKit.ts')

  // Both the build result and the preview kit result should carry the flag
  const occurrences = (src.match(/singlePageExpansionDetected/g) ?? []).length
  assert.ok(occurrences >= 3, `Expected ≥3 occurrences of singlePageExpansionDetected, got ${occurrences}`)
})

test('buildStructuredKitBuffer logs single_page_expansion_detected when source=1 and translated>1', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /single_page_expansion_detected:/)
  assert.match(src, /source=1 translated=\$\{translatedPageCount\}/)
  assert.match(src, /overflow=\$\{translatedPageCount - 1\}/)
})

test('buildStructuredKitBuffer computes singlePageExpansionDetected from sourcePageCount and translatedPageCount', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /input\.sourcePageCount === 1/)
  assert.match(src, /translatedPageCount > 1/)
})

// ── previewStructuredKit.ts action ────────────────────────────────────────────

test('previewStructuredKit.ts imports resolveSinglePageRouting', () => {
  const src = read('app/actions/previewStructuredKit.ts')

  assert.match(src, /resolveSinglePageRouting/)
  assert.match(src, /singlePageSafeguard/)
})

test('previewStructuredKit.ts calls resolveSinglePageRouting with documentType and sourcePageCount', () => {
  const src = read('app/actions/previewStructuredKit.ts')

  assert.match(src, /resolveSinglePageRouting\(\s*classification\.documentType/)
  assert.match(src, /sourcePageCount/)
})

test('previewStructuredKit.ts tracks singlePageSafeguardApplied', () => {
  const src = read('app/actions/previewStructuredKit.ts')

  assert.match(src, /singlePageSafeguardApplied.*safeguard_blocked/)
})

test('previewStructuredKit.ts uses faithful_light_safeguard renderer name when blocked', () => {
  const src = read('app/actions/previewStructuredKit.ts')

  assert.match(src, /faithful_light_safeguard/)
})

test('previewStructuredKit.ts logs single_page_routing structured_ai_blocked=true when safeguard fires', () => {
  const src = read('app/actions/previewStructuredKit.ts')

  assert.match(src, /single_page_routing:.*source_page_count=1/)
  assert.match(src, /structured_ai_blocked=true/)
})

test('previewStructuredKit.ts has single-page expansion retry using faithful_light_expansion_retry', () => {
  const src = read('app/actions/previewStructuredKit.ts')

  assert.match(src, /single_page_expansion_retry/)
  assert.match(src, /faithful_light_expansion_retry/)
})

test('previewStructuredKit.ts logs rerouted and final_output_single_page telemetry fields', () => {
  const src = read('app/actions/previewStructuredKit.ts')

  assert.match(src, /rerouted=/)
  assert.match(src, /final_output_single_page=/)
})

test('previewStructuredKit.ts skips structured AI when safeguard is applied (no renderStructuredFamilyDocument call for blocked path)', () => {
  const src = read('app/actions/previewStructuredKit.ts')

  // The try block with renderStructuredFamilyDocument must be inside the else branch
  const elseIdx = src.indexOf('} else {\n      if (singlePageRouting === \'structured_ai_allowed\')')
  assert.ok(elseIdx > 0, 'else block for non-safeguard path must exist')

  const renderCallIdx = src.indexOf('renderStructuredFamilyDocument(')
  assert.ok(renderCallIdx > elseIdx, 'renderStructuredFamilyDocument must be after the safeguard else branch')
})

// ── generateDeliveryKit.ts action ─────────────────────────────────────────────

test('generateDeliveryKit.ts imports resolveSinglePageRouting', () => {
  const src = read('app/actions/generateDeliveryKit.ts')

  assert.match(src, /resolveSinglePageRouting/)
  assert.match(src, /singlePageSafeguard/)
})

test('generateDeliveryKit.ts tracks singlePageSafeguardApplied', () => {
  const src = read('app/actions/generateDeliveryKit.ts')

  assert.match(src, /singlePageSafeguardApplied.*safeguard_blocked/)
})

test('generateDeliveryKit.ts uses faithful_light_safeguard renderer name when blocked', () => {
  const src = read('app/actions/generateDeliveryKit.ts')

  assert.match(src, /faithful_light_safeguard/)
})

test('generateDeliveryKit.ts has single-page expansion retry using faithful_light_expansion_retry', () => {
  const src = read('app/actions/generateDeliveryKit.ts')

  assert.match(src, /single_page_expansion_retry/)
  assert.match(src, /faithful_light_expansion_retry/)
})

test('generateDeliveryKit.ts logs single_page_routing telemetry', () => {
  const src = read('app/actions/generateDeliveryKit.ts')

  assert.match(src, /single_page_routing:.*source_page_count=1/)
  assert.match(src, /structured_ai_blocked=/)
  assert.match(src, /final_output_single_page=/)
})
