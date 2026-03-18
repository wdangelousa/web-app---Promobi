import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('structured kit builder trusts upstream language integrity and classifies leakage diagnostics without literal whitelisting', () => {
  const kit = read('services/structuredPreviewKit.ts')

  assert.match(kit, /function classifySourceLanguageMarkers\(/)
  assert.doesNotMatch(kit, /ALLOWED_INSTITUTIONAL_LITERAL_MARKERS/)
  assert.match(kit, /true_source_content_leakage: string\[\];/)
  assert.match(kit, /allowed_literal_content: string\[\];/)
  assert.match(kit, /false_positive_source_language_marker: string\[\];/)
  assert.match(kit, /missing_translated_zone_content: string\[\];/)
})

test('HTML source-language scan runs only as fallback when upstream integrity evidence is missing', () => {
  const kit = read('services/structuredPreviewKit.ts')

  assert.match(kit, /function hasUpstreamLanguageIntegrityEvidence\(/)
  assert.match(kit, /!hasUpstreamLanguageIntegrityEvidence\(languageIntegrity\)/)
  assert.match(kit, /languageGateSource = 'fallback_html_scan'/)
  assert.match(kit, /languageGateSource: 'upstream_language_integrity'/)
  assert.match(kit, /shouldBlockForLanguageIntegrity[\s\S]*languageIntegrity\.languageIssueType !== 'none'/)
})
