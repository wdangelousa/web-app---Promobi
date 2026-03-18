import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('compact civil prompt requires Anthropic zone blueprint sections', () => {
  const prompt = read('lib/civilRecordGeneralCompactZonePrompt.ts')

  assert.match(prompt, /"PAGE_METADATA"/)
  assert.match(prompt, /"LAYOUT_ZONES"/)
  assert.match(prompt, /"TRANSLATED_CONTENT_BY_ZONE"/)
  assert.match(prompt, /"RENDERING_HINTS"/)
  assert.match(prompt, /"QUALITY_FLAGS"/)
  assert.match(prompt, /birth_certificate_full_content_compact/)
  assert.match(prompt, /civil_registry_full_text_single_page/)
  assert.match(prompt, /TRANSLATION LANGUAGE RULE:/)
  assert.match(prompt, /Translate all translatable labels and body content into English\./)
})

test('structured dispatcher enforces zone-model rendering for one-page civil records', () => {
  const dispatcher = read('services/structuredDocumentRenderer.ts')

  assert.match(dispatcher, /const requiresCompactZoneModel = input\.sourcePageCount === 1/)
  assert.match(dispatcher, /buildCivilRecordGeneralCompactZoneSystemPrompt\(\)/)
  assert.match(dispatcher, /buildCivilRecordGeneralCompactZoneUserMessage\(/)
  assert.match(dispatcher, /renderCivilRecordCompactZoneHtml\(/)
  assert.match(dispatcher, /resolveCompactCivilZoneBindings\(/)
  assert.match(dispatcher, /normalizeZoneBindingId\(/)
  assert.match(dispatcher, /mappedGenericZones/)
  assert.match(dispatcher, /requires Anthropic zone blueprint fields/)
  assert.match(dispatcher, /Compact civil zone blueprint page mismatch/)
  assert.match(dispatcher, /zoneModelUsed=yes/)
})

test('compact civil zone renderer preserves margin notes and compact zone blocks', () => {
  const renderer = read('lib/civilRecordCompactZoneRenderer.ts')

  assert.match(renderer, /PAGE_METADATA/)
  assert.match(renderer, /LAYOUT_ZONES/)
  assert.match(renderer, /TRANSLATED_CONTENT_BY_ZONE/)
  assert.match(renderer, /renderMarginNotes/)
  assert.match(renderer, /leftMargin/)
  assert.match(renderer, /rightMargin/)
  assert.match(renderer, /metadata-grid/)
  assert.match(renderer, /Certified Transcription/)
  assert.match(renderer, /Truth \/ Seal \/ Charges/)
  assert.doesNotMatch(renderer, /pages\.slice\(/)
})
