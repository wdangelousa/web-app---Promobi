/**
 * tests/phase13/phase2-profile-selection.test.mjs
 *
 * Verifies Phase 2 initial render profile selection, block-aware pre-render
 * shaping, annotation compaction modes, render quality tier computation, and
 * density metric semantics.
 *
 * All tests operate on source text (no runtime imports) so they run without
 * a Gotenberg instance or database.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

// ── Density metric semantics ──────────────────────────────────────────────────

test('density metric: usableHeightPerSourcePageIn decreases as page count increases', () => {
  // Portrait paper: usable height = 11 - 1.85 - 0.75 = 8.4 in
  // 1 page  → 8.4 in/page  (balanced)
  // 2 pages → 4.2 in/page  (compact)
  // 3 pages → 2.8 in/page  (dense)
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /usableHeightIn \/ count/)
  assert.match(src, /usableHeightPerSourcePageIn/)

  // Verify paper dimensions used in the budget
  assert.match(src, /paperHeightIn.*11/)
  assert.match(src, /marginTopIn.*1\.85/)
  assert.match(src, /marginBottomIn.*0\.75/)
})

test('density metric: portrait 1-page document maps to balanced profile', () => {
  // usable height = 11 - 1.85 - 0.75 = 8.4 in for 1 page → ≥ 5.5 → balanced
  const src = read('lib/parityRecovery.ts')

  // Threshold 5.5 selects balanced for 1-page portrait (8.4 in/page)
  assert.match(src, /h < 5\.5/)
  assert.match(src, /name: 'balanced'/)
})

test('density metric: portrait 2-page document maps to compact profile', () => {
  // usable height = 8.4 in / 2 pages = 4.2 in/page → 3.0 ≤ 4.2 < 5.5 → compact
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /h < 5\.5/)
  assert.match(src, /name: 'compact'/)
  // 4.2 is between 3.0 and 5.5 thresholds
  assert.match(src, /h < 3\.0/)
})

test('density metric: portrait 3-page document maps to dense profile', () => {
  // usable height = 8.4 in / 3 pages = 2.8 in/page → < 3.0 → dense
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /h < 3\.0/)
  assert.match(src, /name: 'dense'/)
})

test('buildPreRenderLayoutHints is 3-tier and aligned with buildInitialRenderProfile thresholds', () => {
  const src = read('lib/parityRecovery.ts')

  // Must use same < 3.0 and < 5.5 thresholds as buildInitialRenderProfile
  // (not the old binary < 3.0 threshold)
  const hintsIdx = src.indexOf('export function buildPreRenderLayoutHints(')
  assert.ok(hintsIdx > 0, 'buildPreRenderLayoutHints must exist')
  const hintsChunk = src.slice(hintsIdx, hintsIdx + 600)

  assert.match(hintsChunk, /h < 3\.0/)
  assert.match(hintsChunk, /h < 5\.5/)
  // Dense tier: suggestedLineHeight 1.2
  assert.match(hintsChunk, /suggestedLineHeight: 1\.2/)
  // Compact tier: suggestedLineHeight 1.3
  assert.match(hintsChunk, /suggestedLineHeight: 1\.3/)
  // Balanced tier: suggestedLineHeight 1.4
  assert.match(hintsChunk, /suggestedLineHeight: 1\.4/)
})

// ── Annotation compaction mode ────────────────────────────────────────────────

test('parityRecovery exports AnnotationCompactionMode type', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export type AnnotationCompactionMode = 'none' \| 'moderate' \| 'aggressive'/)
})

test('parityRecovery exports COMPACT_ANNOTATION_COMPACTION_THRESHOLD constant', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export const COMPACT_ANNOTATION_COMPACTION_THRESHOLD = 35/)
})

test('dense profile uses aggressive annotation compaction', () => {
  const src = read('lib/parityRecovery.ts')

  const denseIdx = src.indexOf("name: 'dense'")
  assert.ok(denseIdx > 0)
  const denseChunk = src.slice(denseIdx, denseIdx + 300)
  assert.match(denseChunk, /annotationCompactionMode: 'aggressive'/)
})

test('compact profile uses moderate annotation compaction', () => {
  const src = read('lib/parityRecovery.ts')

  const compactIdx = src.indexOf("name: 'compact'")
  assert.ok(compactIdx > 0)
  const compactChunk = src.slice(compactIdx, compactIdx + 300)
  assert.match(compactChunk, /annotationCompactionMode: 'moderate'/)
})

test('balanced profile uses no annotation compaction', () => {
  const src = read('lib/parityRecovery.ts')

  const balancedIdx = src.indexOf("name: 'balanced'")
  assert.ok(balancedIdx > 0)
  const balancedChunk = src.slice(balancedIdx, balancedIdx + 300)
  assert.match(balancedChunk, /annotationCompactionMode: 'none'/)
})

test('compactAnnotations accepts an optional threshold parameter', () => {
  const src = read('lib/parityRecovery.ts')

  // Function signature must accept a threshold argument (with default)
  assert.match(src, /export function compactAnnotations\(\s*html: string,\s*threshold/)
  assert.match(src, /PARITY_MAX_ANNOTATION_INNER_LENGTH,?\s*\)/)
})

test('applyInitialRenderProfile routes aggressive mode to PARITY_MAX_ANNOTATION_INNER_LENGTH threshold', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /annotationCompactionMode === 'aggressive'/)
  assert.match(src, /compactAnnotations\(withCss, PARITY_MAX_ANNOTATION_INNER_LENGTH\)/)
})

test('applyInitialRenderProfile routes moderate mode to COMPACT_ANNOTATION_COMPACTION_THRESHOLD', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /annotationCompactionMode === 'moderate'/)
  assert.match(src, /compactAnnotations\(withCss, COMPACT_ANNOTATION_COMPACTION_THRESHOLD\)/)
})

test('applyInitialRenderProfile returns unchanged HTML for none mode', () => {
  const src = read('lib/parityRecovery.ts')

  // The function must have a return path that skips compactAnnotations entirely
  // for the none case (i.e. falls through to plain return withCss)
  const fnIdx = src.indexOf('export function applyInitialRenderProfile(')
  assert.ok(fnIdx > 0)
  const fnChunk = src.slice(fnIdx, fnIdx + 800)
  assert.match(fnChunk, /return withCss/)
  // Must not call compactAnnotations unconditionally
  assert.doesNotMatch(fnChunk, /^  return compactAnnotations/m)
})

// ── Block-aware pre-render CSS ────────────────────────────────────────────────

test('buildInitialRenderProfileCss emits table margin shaping', () => {
  const src = read('lib/parityRecovery.ts')

  // Table margin must be a profile-driven value, not a hardcoded constant
  assert.match(src, /table \{ margin-top: \$\{profile\.tableMarginPx\}px/)
  assert.match(src, /margin-bottom: \$\{profile\.tableMarginPx\}px/)
})

test('buildInitialRenderProfileCss emits annotation block shaping', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /\.annotation, \[data-block="annotation"\]/)
  assert.match(src, /\$\{profile\.annotationFontSizePx\}px/)
})

test('buildInitialRenderProfileCss emits caption and label shaping', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /caption, figcaption, \.caption, \.label, \.field-label/)
  assert.match(src, /\$\{profile\.captionFontSizePx\}px/)
})

test('InitialRenderProfile includes all block-aware fields', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /tableMarginPx: number/)
  assert.match(src, /annotationFontSizePx: number/)
  assert.match(src, /captionFontSizePx: number/)
  assert.match(src, /annotationCompactionMode: AnnotationCompactionMode/)
})

test('dense profile has tightest block-aware values', () => {
  const src = read('lib/parityRecovery.ts')

  const denseIdx = src.indexOf("name: 'dense'")
  const denseChunk = src.slice(denseIdx, denseIdx + 400)
  assert.match(denseChunk, /tableMarginPx: 1/)
  assert.match(denseChunk, /annotationFontSizePx: 9/)
  assert.match(denseChunk, /captionFontSizePx: 9/)
})

test('compact profile has intermediate block-aware values', () => {
  const src = read('lib/parityRecovery.ts')

  const compactIdx = src.indexOf("name: 'compact'")
  const compactChunk = src.slice(compactIdx, compactIdx + 400)
  assert.match(compactChunk, /tableMarginPx: 2/)
  assert.match(compactChunk, /annotationFontSizePx: 9/)
  assert.match(compactChunk, /captionFontSizePx: 10/)
})

test('balanced profile has most relaxed block-aware values', () => {
  const src = read('lib/parityRecovery.ts')

  const balancedIdx = src.indexOf("name: 'balanced'")
  const balancedChunk = src.slice(balancedIdx, balancedIdx + 400)
  assert.match(balancedChunk, /tableMarginPx: 4/)
  assert.match(balancedChunk, /annotationFontSizePx: 11/)
  assert.match(balancedChunk, /captionFontSizePx: 11/)
})

test('block-aware CSS comment documents the shaping order', () => {
  const src = read('lib/parityRecovery.ts')

  // CSS comment must document the block priority order
  assert.match(src, /Block shaping order/)
  assert.match(src, /Annotations.*secondary content/)
  assert.match(src, /Table.*padding.*margin/)
  assert.match(src, /Core body text.*protected/)
})

// ── Render quality tier ───────────────────────────────────────────────────────

test('parityRecovery exports RenderQualityTier type', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export type RenderQualityTier = 'high' \| 'acceptable' \| 'review_recommended'/)
})

test('parityRecovery exports computeRenderQualityTier function', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export function computeRenderQualityTier\(/)
})

test('computeRenderQualityTier returns review_recommended for terminal failure', () => {
  const src = read('lib/parityRecovery.ts')

  const fnIdx = src.indexOf('export function computeRenderQualityTier(')
  assert.ok(fnIdx > 0)
  const fnChunk = src.slice(fnIdx, fnIdx + 1000)
  assert.match(fnChunk, /!parityResolved.*review_recommended|review_recommended.*!parityResolved/s)
})

test('computeRenderQualityTier returns review_recommended for dense + L3/L4 recovery', () => {
  const src = read('lib/parityRecovery.ts')

  const fnIdx = src.indexOf('export function computeRenderQualityTier(')
  const fnChunk = src.slice(fnIdx, fnIdx + 1000)
  // Must check for dense profile combined with recovery level >= 3
  assert.match(fnChunk, /profile\?\.name === 'dense'/)
  assert.match(fnChunk, /recoveryLevel.*>= 3/)
})

test('computeRenderQualityTier returns review_recommended for fallback renderer + L4', () => {
  const src = read('lib/parityRecovery.ts')

  const fnIdx = src.indexOf('export function computeRenderQualityTier(')
  const fnChunk = src.slice(fnIdx, fnIdx + 1000)
  assert.match(fnChunk, /isFallbackRenderer/)
  assert.match(fnChunk, /recoveryLevel.*>= 4/)
})

test('computeRenderQualityTier returns review_recommended for sensitive family + L3/L4', () => {
  const src = read('lib/parityRecovery.ts')

  const fnIdx = src.indexOf('export function computeRenderQualityTier(')
  const fnChunk = src.slice(fnIdx, fnIdx + 1000)
  assert.match(fnChunk, /isSensitive/)
  assert.match(fnChunk, /SENSITIVE_DOCUMENT_FAMILIES/)
})

test('computeRenderQualityTier returns high for no recovery needed', () => {
  const src = read('lib/parityRecovery.ts')

  const fnIdx = src.indexOf('export function computeRenderQualityTier(')
  const fnChunk = src.slice(fnIdx, fnIdx + 1800)
  // recoveryLevel === null → high
  assert.match(fnChunk, /recoveryLevel === null.*high|high.*recoveryLevel === null/s)
})

test('computeRenderQualityTier returns high for L1-only recovery', () => {
  const src = read('lib/parityRecovery.ts')

  const fnIdx = src.indexOf('export function computeRenderQualityTier(')
  const fnChunk = src.slice(fnIdx, fnIdx + 1800)
  // level 1 → high
  assert.match(fnChunk, /recoveryLevel === 1.*high|high.*recoveryLevel === 1/s)
})

test('parityRecovery exports SENSITIVE_DOCUMENT_FAMILIES', () => {
  const src = read('lib/parityRecovery.ts')

  assert.match(src, /export const SENSITIVE_DOCUMENT_FAMILIES/)
  // Must include civil records and immigration forms as high-sensitivity families
  assert.match(src, /civil_records/)
  assert.match(src, /uscis_dos_forms_notices/)
})

// ── structuredPreviewKit.ts telemetry integration ─────────────────────────────

test('structuredPreviewKit.ts imports computeRenderQualityTier and RenderQualityTier', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /computeRenderQualityTier/)
  assert.match(src, /RenderQualityTier/)
})

test('structuredPreviewKit.ts logs profile_telemetry line after recovery', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /profile_telemetry:/)
  assert.match(src, /first_render_resolved_parity=/)
  assert.match(src, /recovery_was_needed=/)
  assert.match(src, /scale_recovery_needed=/)
  assert.match(src, /resolved_at_level=/)
  assert.match(src, /resolved_at_scale=/)
  assert.match(src, /render_quality_tier=/)
})

test('structuredPreviewKit.ts telemetry includes document context fields', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /document_type=/)
  assert.match(src, /document_family=/)
  assert.match(src, /modality=/)
  assert.match(src, /orientation=/)
  assert.match(src, /is_fallback_renderer=/)
})

test('structuredPreviewKit.ts derives isFallbackRenderer from rendererName', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /isFallbackRenderer.*rendererName.*fallback|rendererName.*fallback.*isFallbackRenderer/s)
})

test('structuredPreviewKit.ts annotationCompaction log uses annotationCompactionMode not deprecated preCompactAnnotations', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /annotationCompaction=\$\{firstRenderProfile\.annotationCompactionMode\}/)
  assert.doesNotMatch(src, /preCompactAnnotations=\$\{firstRenderProfile\.preCompactAnnotations\}/)
})

test('structuredPreviewKit.ts tracks resolvedAtLevel from recovery loop', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /resolvedAtLevel = level/)
  assert.match(src, /resolvedAtLevel: ParityRecoveryLevel \| null/)
})

test('structuredPreviewKit.ts passes recoveryResolutionStep and parityResolved to computeRenderQualityTier', () => {
  const src = read('services/structuredPreviewKit.ts')

  assert.match(src, /computeRenderQualityTier\(/)
  assert.match(src, /const recoveryResolutionStep =/)
  assert.match(src, /resolvedAtScale !== null \? 'scale_down' : resolvedAtLevel/)
  assert.match(src, /recoveryResolutionStep,/)
  assert.match(src, /parityResolved,/)
})
