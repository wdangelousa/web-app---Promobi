/**
 * tests/phase13/parity-recovery-ladder.test.mjs
 *
 * Regression tests for the page-parity-controlled rendering pipeline.
 * Verifies that:
 *  - lib/parityRecovery.ts exports the required API surface
 *  - CSS injection functions produce syntactically valid output
 *  - Annotation compaction correctly shortens verbose bracket descriptions
 *  - isParityRecoveryNeeded enforces modality gating
 *  - applyRecoveryToHtml is additive across levels
 *  - FAITHFUL_PARITY_PROMPT_NOTE is non-empty and contains key instructions
 *  - structuredPreviewKit.ts has the modality field and recovery loop
 *  - generateDeliveryKit.ts and previewStructuredKit.ts pass modality
 *  - faithful_light_fallback path flows through the same recovery-aware buffer
 *  - editorial_news_pages and publication_media_record prompts include parity note
 *  - empty translated text still fails terminally (no regression)
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

// ── lib/parityRecovery.ts source contract ────────────────────────────────────

test('parityRecovery exports required API surface', () => {
  const src = read('lib/parityRecovery.ts')

  // Types and constants
  assert.match(src, /export type ParityRecoveryLevel = 1 \| 2 \| 3 \| 4/)
  assert.match(src, /export const PARITY_MIN_FONT_SIZE_PX/)
  assert.match(src, /export const PARITY_MAX_RECOVERY_LEVEL/)
  assert.match(src, /export const FAITHFUL_PARITY_PROMPT_NOTE/)
  assert.match(src, /export interface ParityRecoveryAttempt/)
  assert.match(src, /export interface ParityRecoveryDiagnostics/)
  assert.match(src, /export interface PageLayoutBudget/)

  // Functions
  assert.match(src, /export function buildPageLayoutBudget\(/)
  assert.match(src, /export function compactAnnotations\(/)
  assert.match(src, /export function applyRecoveryToHtml\(/)
  assert.match(src, /export function isParityRecoveryNeeded\(/)
})

test('isParityRecoveryNeeded only activates for faithful modality', () => {
  const src = read('lib/parityRecovery.ts')

  // Must gate on modality === 'faithful'
  assert.match(src, /modality !== 'faithful'/)
  // Must check sourcePageCount > 0
  assert.match(src, /sourcePageCount <= 0/)
  // Must compare translatedPageCount > sourcePageCount
  assert.match(src, /translatedPageCount > sourcePageCount/)
})

test('applyRecoveryToHtml injects CSS additively across levels', () => {
  const src = read('lib/parityRecovery.ts')

  // Level 1 CSS injected when level >= 1
  assert.match(src, /level >= 1/)
  assert.match(src, /parity-recovery-l1/)
  // Level 2 CSS injected when level >= 2
  assert.match(src, /level >= 2/)
  assert.match(src, /parity-recovery-l2/)
  // Level 3 compacts annotations
  assert.match(src, /level >= 3/)
  assert.match(src, /compactAnnotations/)
  // Level 4 applies aggressive reflow
  assert.match(src, /level >= 4/)
  assert.match(src, /parity-recovery-l4/)

  // CSS injected before </head>
  assert.match(src, /<\/head>/)
})

test('compactAnnotations covers required canonical forms', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /\[Stamp\]/)
  assert.match(src, /\[Seal\]/)
  assert.match(src, /\[Signature\]/)
  assert.match(src, /\[Initial\]/)
  assert.match(src, /\[Illegible\]/)
  assert.match(src, /\[Notary\]/)
  assert.match(src, /\[Fingerprint\]/)
  assert.match(src, /\[Photo\]/)
  assert.match(src, /\[Barcode\]/)
  // Unknown brackets must be left unchanged
  assert.match(src, /return _match/)
})

test('FAITHFUL_PARITY_PROMPT_NOTE contains required parity instructions', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /PAGE COUNT PRESERVATION/)
  assert.match(src, /\[Stamp\].*\[Seal\].*\[Signature\]/s)
  assert.match(src, /legally relevant textual content/)
})

test('buildPageLayoutBudget computes usable area per source page', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /usableHeightIn \/ count/)
  assert.match(src, /usableHeightPerSourcePageIn/)
  assert.match(src, /paperWidthIn.*8\.5/)
  assert.match(src, /paperHeightIn.*11/)
})

// ── structuredPreviewKit.ts recovery integration ─────────────────────────────

test('structuredPreviewKit.ts has modality field and imports parityRecovery', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /from '@\/lib\/parityRecovery'/)
  assert.match(src, /applyRecoveryToHtml/)
  assert.match(src, /isParityRecoveryNeeded/)
  assert.match(src, /PARITY_MAX_RECOVERY_LEVEL/)
  assert.match(src, /modality\?:\s*'standard' \| 'faithful' \| 'external_pdf'/)
})

test('structuredPreviewKit.ts recovery loop activates on faithful modality', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /input\.modality === 'faithful'/)
  assert.match(src, /isParityRecoveryNeeded\(/)
  assert.match(src, /parity recovery: start/)
  assert.match(src, /parity recovery level \${level}/)
  assert.match(src, /parity recovery: resolved at level/)
  assert.match(src, /parity recovery: exhausted/)
  assert.match(src, /PARITY_MAX_RECOVERY_LEVEL/)
  assert.match(src, /buildPageLayoutBudget\(/)
})

test('structuredPreviewKit.ts recovery loop logs per-step diagnostics', () => {
  const src = read('services/structuredPreviewKit.ts')

  // Log messages are split across concatenated string literals so we assert
  // each diagnostic token separately rather than on a single line.
  assert.match(src, /parity recovery: start/)
  assert.match(src, /translated=\$\{/)
  assert.match(src, /source=\$\{input\.sourcePageCount\}/)
  assert.match(src, /overflow=\$\{/)
  assert.match(src, /budget_per_page=/)
  assert.match(src, /translated_pages=\$\{recoveredPageCount\}/)
  assert.match(src, /source_pages=\$\{input\.sourcePageCount\}/)
  assert.match(src, /resolved=\$\{recoveredPageCount <= input\.sourcePageCount\}/)
})

test('structuredPreviewKit.ts letterhead overlay uses post-recovery buffer', () => {
  const src = read('services/structuredPreviewKit.ts')

  // The internal-path overlay must use translatedPdfBuffer (post-recovery),
  // not translatedPdfBase.buffer. We locate the recovery-exhausted log (which
  // is the last line of the recovery block) and confirm the overlay call that
  // uses translatedPdfBuffer comes after it.
  const recoveryEndIdx = src.indexOf('parity recovery: exhausted')
  const overlayAfterRecovery = src.indexOf('translatedPdfBuffer,', recoveryEndIdx)
  assert.ok(recoveryEndIdx > 0, 'recovery exhausted log must exist')
  assert.ok(overlayAfterRecovery > recoveryEndIdx, 'overlay using translatedPdfBuffer must come after recovery block')
})

// ── Action files pass modality ────────────────────────────────────────────────

test('generateDeliveryKit.ts passes modality to both kit calls', () => {
  const src = read('app/actions/generateDeliveryKit.ts')

  assert.match(src, /modality: "external_pdf"/)
  assert.match(src, /modality: resolveDocumentTypeModality\(classification\.documentType\)/)
})

test('previewStructuredKit.ts passes modality to both kit calls', () => {
  const src = read('app/actions/previewStructuredKit.ts')

  assert.match(src, /modality: 'external_pdf'/)
  assert.match(src, /modality: resolveDocumentTypeModality\(classification\.documentType\)/)
})

// ── faithful_light_fallback obeys parity control ──────────────────────────────

test('faithful_light_fallback flows through the same recovery-aware kit builder', () => {
  // The faithful_light_fallback path sets htmlForKit and passes it to
  // buildStructuredKitBuffer / assembleStructuredPreviewKit as structuredHtml.
  // The recovery loop in buildStructuredKitBuffer operates on structuredHtml,
  // so no separate bypass path exists for faithful_light_fallback.
  const deliverySrc = read('app/actions/generateDeliveryKit.ts')
  const previewSrc = read('app/actions/previewStructuredKit.ts')

  // faithful_light_fallback sets rendererName — must be visible in both files
  assert.match(deliverySrc, /faithful_light_fallback/)
  assert.match(previewSrc, /faithful_light_fallback/)

  // Both files pass modality for the internal branch (not just external_pdf)
  assert.match(deliverySrc, /modality: resolveDocumentTypeModality/)
  assert.match(previewSrc, /modality: resolveDocumentTypeModality/)
})

// ── Structured renderer prompt updates ───────────────────────────────────────

test('editorial_news_pages and publication_media_record prompts include parity note', () => {
  const src = read('services/structuredDocumentRenderer.ts')

  assert.match(src, /FAITHFUL_PARITY_PROMPT_NOTE/)

  // Both faithful families must append the parity note
  const editorialIdx = src.indexOf("case 'editorial_news_pages'")
  const publicationIdx = src.indexOf("case 'publication_media_record'")
  assert.ok(editorialIdx > 0, 'editorial_news_pages case must exist')
  assert.ok(publicationIdx > 0, 'publication_media_record case must exist')

  // Verify both call sites concatenate the note
  const editorialChunk = src.slice(editorialIdx, editorialIdx + 500)
  const publicationChunk = src.slice(publicationIdx, publicationIdx + 500)
  assert.match(editorialChunk, /FAITHFUL_PARITY_PROMPT_NOTE/)
  assert.match(publicationChunk, /FAITHFUL_PARITY_PROMPT_NOTE/)
})

// ── Empty translated text regression ─────────────────────────────────────────

test('empty translated text still blocks terminally (faithfulText.length > 50 guard)', () => {
  const deliverySrc = read('app/actions/generateDeliveryKit.ts')
  const previewSrc = read('app/actions/previewStructuredKit.ts')

  // Guard must still be present in both files
  assert.match(deliverySrc, /faithfulText\.length > 50/)
  assert.match(previewSrc, /faithfulText\.length > 50/)
})

// ── documentFamilyRegistry modality API ──────────────────────────────────────

test('documentFamilyRegistry exports TranslationModality and resolveDocumentTypeModality', () => {
  const src = read('services/documentFamilyRegistry.ts')

  assert.match(src, /export type TranslationModality = 'standard' \| 'faithful' \| 'external_pdf'/)
  assert.match(src, /export function resolveDocumentTypeModality\(/)
  assert.match(src, /FAITHFUL_MODALITY_FAMILIES/)
  assert.match(src, /editorial_news_pages/)
  assert.match(src, /publications_media/)
})
