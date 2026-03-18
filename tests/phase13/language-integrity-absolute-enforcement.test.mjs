import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('structured renderer enforces translated-zone binding and source-language blocking', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')

  assert.match(renderer, /buildCompactCivilLanguageIntegrity\(/)
  assert.match(renderer, /missingTranslatedZones/)
  assert.match(renderer, /sourceLanguageMarkers/)
  assert.match(renderer, /translated_zone_content_missing_or_source_language_detected/)
  assert.match(renderer, /Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface\./)
  assert.match(renderer, /assertPayloadLanguageIntegrity\(/)
})

test('kit builder logs language diagnostics and blocks client-facing mixed-language risk', () => {
  const kit = read('services/structuredPreviewKit.ts')

  assert.match(kit, /target_language: string/)
  assert.match(kit, /source_language: string/)
  assert.match(kit, /translated_payload_found: boolean/)
  assert.match(kit, /translated_zones_count: number \| null/)
  assert.match(kit, /missing_translated_zones: string\[\]/)
  assert.match(kit, /logLanguageIntegrityDiagnostics\(/)
  assert.match(kit, /detectSourceLanguageLeakageFromHtml\(/)
  assert.match(kit, /translated_zone_content_missing_or_source_language_detected/)
})

test('preview and delivery actions surface the language-integrity blocking message', () => {
  const previewAction = read('app/actions/previewStructuredKit.ts')
  const deliveryAction = read('app/actions/generateDeliveryKit.ts')

  assert.match(previewAction, /kit\.blockingReason === 'translated_zone_content_missing_or_source_language_detected'/)
  assert.match(previewAction, /Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface\./)

  assert.match(deliveryAction, /buildResult\.blockingReason === \"translated_zone_content_missing_or_source_language_detected\"/)
  assert.match(deliveryAction, /Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface\./)
})
