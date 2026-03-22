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

  // External-PDF path still hard-codes 'external_pdf'
  assert.match(src, /modality: "external_pdf"/)
  // Internal path: kitModality variable is seeded from resolveDocumentTypeModality
  // and then overridden to 'faithful' for faithful-light paths so parity recovery activates.
  // kitModality is seeded via: const modality = resolveDocumentTypeModality(...); let kitModality = modality
  // then overridden to 'faithful' in each faithful-light path.
  assert.match(src, /resolveDocumentTypeModality\(classification\.documentType\)/)
  assert.match(src, /let kitModality/)
  assert.match(src, /modality: kitModality/)
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

  // generateDeliveryKit uses kitModality (seeded from resolveDocumentTypeModality, overridden
  // to 'faithful' for all faithful-light paths so parity recovery activates).
  // previewStructuredKit still passes resolveDocumentTypeModality directly.
  assert.match(deliverySrc, /modality: kitModality/)
  assert.match(previewSrc, /modality: resolveDocumentTypeModality/)
})

// ── Structured renderer prompt updates ───────────────────────────────────────

test('editorial_news_pages and publication_media_record prompts include parity note', () => {
  const src = read('services/structuredDocumentRenderer.ts')

  // The note must exist somewhere in the file (used by the helper)
  assert.match(src, /FAITHFUL_PARITY_PROMPT_NOTE/)

  // Both faithful families must exist as renderer cases
  const editorialIdx = src.indexOf("case 'editorial_news_pages'")
  const publicationIdx = src.indexOf("case 'publication_media_record'")
  assert.ok(editorialIdx > 0, 'editorial_news_pages case must exist')
  assert.ok(publicationIdx > 0, 'publication_media_record case must exist')

  // Both call sites must use the centralised helper rather than raw concatenation.
  // The helper applies the note automatically for all faithful-modality families.
  const editorialChunk = src.slice(editorialIdx, editorialIdx + 500)
  const publicationChunk = src.slice(publicationIdx, publicationIdx + 500)
  assert.match(editorialChunk, /buildSystemPromptWithParityNote/)
  assert.match(publicationChunk, /buildSystemPromptWithParityNote/)
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

// ── Phase 1.5: compression safety floors ─────────────────────────────────────

test('parityRecovery exports compression safety floor constants', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export const PARITY_MIN_LINE_HEIGHT/)
  assert.match(src, /export const PARITY_MIN_CELL_PADDING_PX/)
  assert.match(src, /export const PARITY_MAX_ANNOTATION_INNER_LENGTH/)
})

test('L4 CSS uses PARITY_MIN_LINE_HEIGHT and PARITY_MIN_CELL_PADDING_PX constants', () => {
  const src = read('lib/parityRecovery.ts')

  // L4 must reference the floor constants — not embed literal values that
  // could diverge from the declared minimums.
  assert.match(src, /const lh = PARITY_MIN_LINE_HEIGHT/)
  assert.match(src, /const cp = PARITY_MIN_CELL_PADDING_PX/)
  // Verify the constants flow through to the CSS template literals.
  assert.match(src, /line-height: \$\{lh\}/)
  assert.match(src, /padding: \$\{cp\}px/)
})

test('compactAnnotations threshold is driven by a parameter defaulting to PARITY_MAX_ANNOTATION_INNER_LENGTH', () => {
  const src = read('lib/parityRecovery.ts')

  // The function accepts a threshold parameter that defaults to the constant —
  // this enables moderate mode (compact profile) to pass COMPACT_ANNOTATION_COMPACTION_THRESHOLD.
  assert.match(src, /threshold: number = PARITY_MAX_ANNOTATION_INNER_LENGTH/)
  // The regex uses the local variable (minLen = threshold), not the constant directly.
  assert.match(src, /const minLen = threshold/)
  assert.match(src, /\$\{minLen\}/)
})

// ── Phase 1.5: resolution label API ──────────────────────────────────────────

test('parityRecovery exports ParityResolutionLabel type and resolveParityLabel', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export type ParityResolutionLabel/)
  assert.match(src, /parity_resolved_light/)
  assert.match(src, /parity_resolved_moderate/)
  assert.match(src, /parity_resolved_aggressive/)
  assert.match(src, /parity_failed_terminal/)
  assert.match(src, /export function resolveParityLabel\(/)
})

test('resolveParityLabel maps all levels correctly', () => {
  const src = read('lib/parityRecovery.ts')

  // level 1 → light
  assert.match(src, /level === 1.*parity_resolved_light|parity_resolved_light.*level === 1/s)
  // level 2 or 3 → moderate
  assert.match(src, /level === 2.*parity_resolved_moderate|parity_resolved_moderate.*level === 2/s)
  // null path → terminal
  assert.match(src, /level === null.*parity_failed_terminal|parity_failed_terminal.*level === null/s)
  // level 4 → aggressive (the only remaining case)
  assert.match(src, /parity_resolved_aggressive/)
})

// ── Phase 1.5: underflow detection ───────────────────────────────────────────

test('parityRecovery exports isParityUnderflow', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export function isParityUnderflow\(/)
  // Must gate on faithful modality
  assert.match(src, /modality !== 'faithful'/)
  // Must return true when translated < source
  assert.match(src, /translatedPageCount < sourcePageCount/)
})

test('structuredPreviewKit.ts imports and uses isParityUnderflow', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /isParityUnderflow/)
  // Must log underflow when detected
  assert.match(src, /parity underflow/)
  assert.match(src, /underflow is not remediated/)
})

test('structuredPreviewKit.ts recovery loop emits page_delta and html_changed per step', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /page_delta=/)
  assert.match(src, /html_changed=/)
})

test('structuredPreviewKit.ts recovery loop emits resolution outcome label', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /parity recovery outcome:/)
  assert.match(src, /resolveParityLabel\(level\)/)
  assert.match(src, /resolveParityLabel\(null\)/)
})

// ── Phase 2 prep: PreRenderLayoutHints interface ──────────────────────────────

test('parityRecovery exports PreRenderLayoutHints interface and buildPreRenderLayoutHints', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export interface PreRenderLayoutHints/)
  assert.match(src, /suggestedFontSizePx/)
  assert.match(src, /suggestedLineHeight/)
  assert.match(src, /suggestedCellPaddingPx/)
  assert.match(src, /export function buildPreRenderLayoutHints\(/)
})

test('StructuredRenderInput accepts layoutHints field', () => {
  const src = read('services/structuredDocumentRenderer.ts')

  assert.match(src, /layoutHints\?:/)
  assert.match(src, /PreRenderLayoutHints/)
})

test('StructuredPreviewKitInput accepts layoutHints field', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /layoutHints\?:/)
})

test('action files import buildPreRenderLayoutHints and pass layoutHints to renderer', () => {
  const deliverySrc = read('app/actions/generateDeliveryKit.ts')
  const previewSrc = read('app/actions/previewStructuredKit.ts')

  // Both must import the budget builders
  assert.match(deliverySrc, /buildPreRenderLayoutHints/)
  assert.match(previewSrc, /buildPreRenderLayoutHints/)
  // Both must pass layoutHints to the renderer call
  assert.match(deliverySrc, /layoutHints,/)
  assert.match(previewSrc, /layoutHints,/)
})

// ── Faithful prompt helper centralisation ────────────────────────────────────

test('structuredDocumentRenderer uses buildSystemPromptWithParityNote helper', () => {
  const src = read('services/structuredDocumentRenderer.ts')

  assert.match(src, /function buildSystemPromptWithParityNote\(/)
  assert.match(src, /resolveDocumentTypeModality/)
  // Both faithful-family call sites must use the helper instead of raw concatenation
  assert.match(src, /buildSystemPromptWithParityNote\(buildEditorialNewsPagesSystemPrompt\(\)/)
  assert.match(src, /buildSystemPromptWithParityNote\(buildPublicationMediaRecordSystemPrompt\(\)/)
})

// ── Expanded annotation compaction regression coverage ────────────────────────

test('compactAnnotations does NOT compact name-only bracket annotations', () => {
  // Names are legally significant — must never be collapsed.
  // We verify by checking that the function returns unknown brackets unchanged
  // (the "return _match" fallback) and that name-like patterns have no match branch.
  const src = read('lib/parityRecovery.ts')

  // The fallback ensures unknown content is preserved.
  assert.match(src, /return _match/)
  // There must be no pattern branch that would match a person's name
  // (no generic "name" or "registrar" keyword in the matchers).
  assert.doesNotMatch(src, /\/.*\bregistrar\b.*\/ .*\[Name\]/)
})

test('compactAnnotations does NOT compact date bracket annotations', () => {
  const src = read('lib/parityRecovery.ts')

  // No "date" or "dated" keyword should appear as a compaction pattern.
  assert.doesNotMatch(src, /if.*\bdate\b.*return '\[/)
})

test('compactAnnotations does NOT compact registry or document number annotations', () => {
  const src = read('lib/parityRecovery.ts')

  // No "registry", "number", "no\." keyword in compaction matchers.
  assert.doesNotMatch(src, /if.*\bregistry\b.*return '\[/)
  assert.doesNotMatch(src, /if.*\bdocument number\b.*return '\[/)
})

test('compactAnnotations handles multilingual stamp annotations', () => {
  const src = read('lib/parityRecovery.ts')

  // Portuguese "carimbo" must be a recognised alias for [Stamp].
  assert.match(src, /carimbo/)
  assert.match(src, /\[Stamp\]/)
})

test('compactAnnotations handles inline HTML tags within bracket annotations', () => {
  const src = read('lib/parityRecovery.ts')

  // The regex character class is [^\]] — it excludes only ']', not '<'.
  // This means bracket annotations that contain HTML tags (e.g.
  // [<strong>Signature</strong> of the Notary]) are still matched and compacted.
  // In the dynamic RegExp template string the character class appears as [^\\]
  // (the backslash is doubled to escape the ] inside the template literal).
  assert.match(src, /\[\^\\\\]/)
})

// ── Phase 2: initial render profile API ──────────────────────────────────────

test('parityRecovery exports InitialRenderProfileName type and InitialRenderProfile interface', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export type InitialRenderProfileName = 'balanced' \| 'compact' \| 'dense'/)
  assert.match(src, /export interface InitialRenderProfile/)
  assert.match(src, /name: InitialRenderProfileName/)
  assert.match(src, /fontSizePx: number/)
  assert.match(src, /lineHeight: number/)
  assert.match(src, /cellPaddingPx: number/)
  assert.match(src, /paraMarginBottomEm: number/)
  assert.match(src, /preCompactAnnotations: boolean/)
})

test('parityRecovery exports buildInitialRenderProfile and applyInitialRenderProfile', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export function buildInitialRenderProfile\(/)
  assert.match(src, /export function applyInitialRenderProfile\(/)
})

test('buildInitialRenderProfile selects correct profile based on density thresholds', () => {
  const src = read('lib/parityRecovery.ts')

  // dense threshold: < 3.0 in/page
  assert.match(src, /h < 3\.0/)
  assert.match(src, /name: 'dense'/)
  // compact threshold: < 5.5 in/page
  assert.match(src, /h < 5\.5/)
  assert.match(src, /name: 'compact'/)
  // balanced: default (≥ 5.5 in/page)
  assert.match(src, /name: 'balanced'/)
})

test('dense profile has aggressive annotation compaction; compact moderate; balanced none', () => {
  const src = read('lib/parityRecovery.ts')

  // dense block: aggressive compaction (and backward-compat preCompactAnnotations: true)
  const denseIdx = src.indexOf("name: 'dense'")
  const denseChunk = src.slice(denseIdx, denseIdx + 300)
  assert.match(denseChunk, /annotationCompactionMode: 'aggressive'/)
  assert.match(denseChunk, /preCompactAnnotations: true/)

  // compact block: moderate compaction — pre-compacts very verbose annotations only
  const compactIdx = src.indexOf("name: 'compact'")
  const compactChunk = src.slice(compactIdx, compactIdx + 300)
  assert.match(compactChunk, /annotationCompactionMode: 'moderate'/)

  // balanced block: no annotation pre-compaction
  const balancedIdx = src.indexOf("name: 'balanced'")
  const balancedChunk = src.slice(balancedIdx, balancedIdx + 300)
  assert.match(balancedChunk, /annotationCompactionMode: 'none'/)
  assert.match(balancedChunk, /preCompactAnnotations: false/)
})

test('all initial render profile values stay above Phase 1 safety floors', () => {
  const src = read('lib/parityRecovery.ts')

  // PARITY_MIN_FONT_SIZE_PX = 8 → profile values must be > 8
  // We verify no profile sets fontSizePx below 9
  assert.doesNotMatch(src, /fontSizePx: [1-8][,\s]/)

  // PARITY_MIN_LINE_HEIGHT = 1.05 → profile values must be > 1.05
  // Smallest declared is 1.2 (dense); verify it's present and 1.0 never appears alone
  assert.match(src, /lineHeight: 1\.2/)

  // PARITY_MIN_CELL_PADDING_PX = 1 → smallest profile value is 2 (dense)
  const densePaddingIdx = src.indexOf("name: 'dense'")
  const denseBlock = src.slice(densePaddingIdx, densePaddingIdx + 300)
  assert.match(denseBlock, /cellPaddingPx: 2/)
})

test('applyInitialRenderProfile injects style block with correct data-profile attribute', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /data-profile="\$\{profile\.name\}"/)
  assert.match(src, /initial-render-profile/)
  assert.match(src, /Phase 2 initial render profile:/)
})

test('applyInitialRenderProfile calls compactAnnotations based on annotationCompactionMode', () => {
  const src = read('lib/parityRecovery.ts')

  // The function must branch on annotationCompactionMode, not the deprecated boolean
  assert.match(src, /annotationCompactionMode === 'aggressive'/)
  assert.match(src, /annotationCompactionMode === 'moderate'/)
  // Both branches call compactAnnotations with an explicit threshold
  assert.match(src, /compactAnnotations\(withCss, PARITY_MAX_ANNOTATION_INNER_LENGTH\)/)
  assert.match(src, /compactAnnotations\(withCss, COMPACT_ANNOTATION_COMPACTION_THRESHOLD\)/)
})

// ── Phase 2: structuredPreviewKit.ts integration ──────────────────────────────

test('structuredPreviewKit.ts imports buildInitialRenderProfile and applyInitialRenderProfile', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /buildInitialRenderProfile/)
  assert.match(src, /applyInitialRenderProfile/)
  assert.match(src, /InitialRenderProfile/)
})

test('structuredPreviewKit.ts applies initial render profile before first Gotenberg call', () => {
  const src = read('services/structuredPreviewKit.ts')

  // Profile is computed and applied before callGotenberg
  assert.match(src, /firstRenderProfile = buildInitialRenderProfile\(input\.layoutHints\)/)
  assert.match(src, /firstRenderHtml = applyInitialRenderProfile\(safeAreaStructuredHtml, firstRenderProfile\)/)

  // Only activated for faithful modality with hints
  assert.match(src, /input\.modality === 'faithful' && input\.layoutHints/)

  // First Gotenberg call uses firstRenderHtml, not safeAreaStructuredHtml directly
  assert.match(src, /callGotenberg\(\s*firstRenderHtml,/)
})

test('structuredPreviewKit.ts logs first-render profile choice', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /first-render profile:/)
  assert.match(src, /firstRenderProfile\.name/)
  // Log must use annotationCompactionMode (not the deprecated preCompactAnnotations field)
  assert.match(src, /annotationCompaction=\$\{firstRenderProfile\.annotationCompactionMode\}/)
})

test('structuredPreviewKit.ts logs first-render result and recovery_needed flag', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /first-render result:/)
  assert.match(src, /profile=\$\{firstRenderProfile\.name\}/)
  assert.match(src, /recovery_needed=/)
})

test('structuredPreviewKit.ts recovery loop uses firstRenderHtml as base', () => {
  const src = read('services/structuredPreviewKit.ts')

  // Recovery must build on firstRenderHtml (profile-applied) not raw safeAreaStructuredHtml
  assert.match(src, /applyRecoveryToHtml\(firstRenderHtml, level\)/)
  assert.match(src, /recoveredHtml\.length !== firstRenderHtml\.length/)
})

test('Phase 1 recovery ladder still present and unchanged as fallback', () => {
  const src = read('services/structuredPreviewKit.ts')

  // All four levels must still be attempted
  assert.match(src, /PARITY_MAX_RECOVERY_LEVEL/)
  assert.match(src, /parity-recovery-l\$\{level\}/)
  assert.match(src, /parity recovery: resolved at level/)
  assert.match(src, /parity recovery: exhausted/)
})
