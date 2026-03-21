/**
 * tests/phase13/certificate-faithful-layout.test.mjs
 *
 * Verifies the certificate-style faithful-light layout mechanism:
 *   - CERTIFICATE_GENRE_DOCUMENT_TYPES contents
 *   - isCertificateGenreDocumentType return values
 *   - translatedPageTemplate.ts layoutHint option and CSS generation
 *   - previewStructuredKit.ts and generateDeliveryKit.ts pass layoutHint
 *
 * All tests run on source text only (no runtime imports, no DB, no Gotenberg).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

// ── CERTIFICATE_GENRE_DOCUMENT_TYPES ──────────────────────────────────────────

test('singlePageSafeguard exports CERTIFICATE_GENRE_DOCUMENT_TYPES', () => {
  const src = read('lib/singlePageSafeguard.ts')
  assert.match(src, /export const CERTIFICATE_GENRE_DOCUMENT_TYPES/)
})

test('CERTIFICATE_GENRE_DOCUMENT_TYPES includes course_certificate_landscape', () => {
  const src = read('lib/singlePageSafeguard.ts')
  assert.match(src, /'course_certificate_landscape'/)
})

test('CERTIFICATE_GENRE_DOCUMENT_TYPES includes academic_diploma_certificate', () => {
  const src = read('lib/singlePageSafeguard.ts')
  assert.match(src, /'academic_diploma_certificate'/)
})

test('CERTIFICATE_GENRE_DOCUMENT_TYPES includes marriage_certificate_brazil', () => {
  const src = read('lib/singlePageSafeguard.ts')
  assert.match(src, /'marriage_certificate_brazil'/)
})

test('CERTIFICATE_GENRE_DOCUMENT_TYPES includes birth_certificate_brazil', () => {
  const src = read('lib/singlePageSafeguard.ts')
  assert.match(src, /'birth_certificate_brazil'/)
})

// ── isCertificateGenreDocumentType ────────────────────────────────────────────

test('singlePageSafeguard exports isCertificateGenreDocumentType function', () => {
  const src = read('lib/singlePageSafeguard.ts')
  assert.match(src, /export function isCertificateGenreDocumentType\(/)
})

test('isCertificateGenreDocumentType uses CERTIFICATE_GENRE_DOCUMENT_TYPES.has', () => {
  const src = read('lib/singlePageSafeguard.ts')
  assert.match(src, /CERTIFICATE_GENRE_DOCUMENT_TYPES\.has\(documentType\)/)
})

// ── translatedPageTemplate.ts: layoutHint option ──────────────────────────────

test('translatedPageTemplate.ts TranslatedPageTemplateOptions includes layoutHint', () => {
  const src = read('services/translatedPageTemplate.ts')
  assert.match(src, /layoutHint\?.*'standard'.*'certificate'/)
})

test('translatedPageTemplate.ts defines buildCertificateLayoutCss function', () => {
  const src = read('services/translatedPageTemplate.ts')
  assert.match(src, /function buildCertificateLayoutCss\(/)
})

test('buildCertificateLayoutCss produces centered layout for .conteudo-principal', () => {
  const src = read('services/translatedPageTemplate.ts')
  assert.match(src, /\.cert-layout .conteudo-principal/)
  assert.match(src, /text-align: center/)
})

test('buildCertificateLayoutCss targets heading paragraphs with :has', () => {
  const src = read('services/translatedPageTemplate.ts')
  assert.match(src, /p:has\(> strong:only-child\)/)
})

test('buildCertificateLayoutCss applies landscape-specific font sizes', () => {
  const src = read('services/translatedPageTemplate.ts')
  // Both landscape and portrait sizes must be present
  assert.match(src, /isLandscape \? '11pt'/)
  assert.match(src, /isLandscape \? '9.5pt'/)
  assert.match(src, /isLandscape \? '8.5pt'/)
})

test('buildTranslatedPageHtml accepts layoutHint option', () => {
  const src = read('services/translatedPageTemplate.ts')
  assert.match(src, /layoutHint,/)
  assert.match(src, /isCertLayout = layoutHint === 'certificate'/)
})

test('buildTranslatedPageHtml injects cert-layout class on body when layoutHint is certificate', () => {
  const src = read('services/translatedPageTemplate.ts')
  assert.match(src, /isCertLayout \? ' class="cert-layout"' : ''/)
})

test('buildTranslatedPageHtml injects certificate CSS into style block when layoutHint is certificate', () => {
  const src = read('services/translatedPageTemplate.ts')
  assert.match(src, /isCertLayout \? buildCertificateLayoutCss\(isLandscape\) : ''/)
})

// ── previewStructuredKit.ts: layoutHint propagation ───────────────────────────

test('previewStructuredKit.ts imports isCertificateGenreDocumentType', () => {
  const src = read('app/actions/previewStructuredKit.ts')
  assert.match(src, /isCertificateGenreDocumentType/)
  assert.match(src, /singlePageSafeguard/)
})

test('previewStructuredKit.ts passes layoutHint to buildTranslatedPageHtml in safeguard path', () => {
  const src = read('app/actions/previewStructuredKit.ts')
  const safeguardIdx = src.indexOf("resolvedRendererForKit = 'faithful_light_safeguard'")
  assert.ok(safeguardIdx > 0, 'safeguard renderer assignment must exist')
  // layoutHint must appear before the safeguard renderer assignment
  const layoutHintIdx = src.lastIndexOf('layoutHint:', safeguardIdx)
  assert.ok(layoutHintIdx > 0, 'layoutHint must appear before safeguard renderer assignment')
})

test('previewStructuredKit.ts passes layoutHint to buildTranslatedPageHtml in fallback path', () => {
  const src = read('app/actions/previewStructuredKit.ts')
  const fallbackIdx = src.indexOf("resolvedRendererForKit = 'faithful_light_fallback'")
  assert.ok(fallbackIdx > 0, 'fallback renderer assignment must exist')
  const layoutHintIdx = src.lastIndexOf('layoutHint:', fallbackIdx)
  assert.ok(layoutHintIdx > 0, 'layoutHint must appear before fallback renderer assignment')
})

test('previewStructuredKit.ts passes layoutHint to buildTranslatedPageHtml in expansion retry', () => {
  const src = read('app/actions/previewStructuredKit.ts')
  // The retry HTML is built before assembleStructuredPreviewKit is called
  const retryIdx = src.indexOf("rendererName: 'faithful_light_expansion_retry'")
  assert.ok(retryIdx > 0, 'expansion retry renderer name must exist')
  const layoutHintIdx = src.lastIndexOf('layoutHint:', retryIdx)
  assert.ok(layoutHintIdx > 0, 'layoutHint must appear before expansion retry renderer name')
})

test('previewStructuredKit.ts uses isCertificateGenreDocumentType to set layoutHint', () => {
  const src = read('app/actions/previewStructuredKit.ts')
  assert.match(src, /isCertificateGenreDocumentType\(classification\.documentType\).*'certificate'/)
})

// ── generateDeliveryKit.ts: layoutHint propagation ────────────────────────────

test('generateDeliveryKit.ts imports isCertificateGenreDocumentType', () => {
  const src = read('app/actions/generateDeliveryKit.ts')
  assert.match(src, /isCertificateGenreDocumentType/)
  assert.match(src, /singlePageSafeguard/)
})

test('generateDeliveryKit.ts passes layoutHint to buildTranslatedPageHtml in safeguard path', () => {
  const src = read('app/actions/generateDeliveryKit.ts')
  const safeguardIdx = src.indexOf("rendererNameForKit = 'faithful_light_safeguard'")
  assert.ok(safeguardIdx > 0, 'safeguard renderer assignment must exist')
  const layoutHintIdx = src.lastIndexOf('layoutHint:', safeguardIdx)
  assert.ok(layoutHintIdx > 0, 'layoutHint must appear before safeguard renderer assignment')
})

test('generateDeliveryKit.ts passes layoutHint to buildTranslatedPageHtml in fallback path', () => {
  const src = read('app/actions/generateDeliveryKit.ts')
  const fallbackIdx = src.indexOf("rendererNameForKit = 'faithful_light_fallback'")
  assert.ok(fallbackIdx > 0, 'fallback renderer assignment must exist')
  const layoutHintIdx = src.lastIndexOf('layoutHint:', fallbackIdx)
  assert.ok(layoutHintIdx > 0, 'layoutHint must appear before fallback renderer assignment')
})

test('generateDeliveryKit.ts passes layoutHint to buildTranslatedPageHtml in expansion retry', () => {
  const src = read('app/actions/generateDeliveryKit.ts')
  const retryIdx = src.indexOf("rendererName: 'faithful_light_expansion_retry'")
  assert.ok(retryIdx > 0, 'expansion retry renderer name must exist')
  const layoutHintIdx = src.lastIndexOf('layoutHint:', retryIdx)
  assert.ok(layoutHintIdx > 0, 'layoutHint must appear before expansion retry renderer name')
})

test('generateDeliveryKit.ts uses isCertificateGenreDocumentType to set layoutHint', () => {
  const src = read('app/actions/generateDeliveryKit.ts')
  assert.match(src, /isCertificateGenreDocumentType\(classification\.documentType\).*'certificate'/)
})
