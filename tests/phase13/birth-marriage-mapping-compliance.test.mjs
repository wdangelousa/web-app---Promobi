import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('birth and marriage document types are strictly mapped to their own renderers', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')

  assert.match(renderer, /marriage_certificate_brazil:\s*'marriageCertRenderer'/)
  assert.match(renderer, /birth_certificate_brazil:\s*'birthCertificateRenderer'/)

  assert.match(renderer, /case 'marriage_certificate_brazil':[\s\S]*renderMarriageCertificateHtml\(/)
  assert.match(renderer, /case 'birth_certificate_brazil':[\s\S]*renderBirthCertificateHtml\(/)
})

test('birth payload compliance guard forbids marriage-only fields before rendering', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')

  assert.match(renderer, /const BIRTH_FORBIDDEN_MARRIAGE_KEYS = new Set\(\[/)
  assert.match(renderer, /'spouse_1'/)
  assert.match(renderer, /'spouse_2'/)
  assert.match(renderer, /'property_regime'/)
  assert.match(renderer, /'celebration_date'/)
  assert.match(renderer, /function assertBirthPayloadCompliance\(/)
  assert.match(renderer, /assertBirthPayloadCompliance\(parsed\)/)
  assert.match(renderer, /function assertMarriagePayloadCompliance\(/)
  assert.match(renderer, /assertMarriagePayloadCompliance\(parsed\)/)
})

test('classifier disambiguates marriage vs birth and does not classify marriage on weak shared signals', () => {
  const classifier = read('services/documentClassifier.ts')

  assert.match(classifier, /const marriageStrictSignals: RegExp\[\]/)
  assert.match(classifier, /const marriageContextSignals: RegExp\[\]/)
  assert.match(classifier, /if \(marriageStrictHits >= 1 && marriageHits >= 2\)/)
  assert.doesNotMatch(classifier, /if \(marriageHits >= 1\) \{\s*return \{ documentType: 'marriage_certificate_brazil'/)
})

test('label and URL hints support plain-space birth\/marriage certificate names', () => {
  const classifier = read('services/documentClassifier.ts')

  assert.match(classifier, /marriage\(\?:\[-_\\s\]\+cert\(\?:ificate\)\?\)\?/)
  assert.match(classifier, /birth\(\?:\[-_\\s\]\+cert\(\?:ificate\)\?\)\?/)
})

test('birth renderer enforces semantic translated-zone binding diagnostics', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')

  assert.match(renderer, /const BIRTH_RENDERER_ZONE_DEFINITIONS: BirthRendererZoneDefinition\[\] = \[/)
  assert.match(renderer, /function mapBirthGenericZoneIdToSemanticZone\(/)
  assert.match(renderer, /function buildBirthLanguageIntegrity\(/)
  assert.match(renderer, /requiredZones: languageIntegrity\.requiredZones/)
  assert.match(renderer, /translatedZonesFound: languageIntegrity\.translatedZonesFound/)
  assert.match(renderer, /sourceLanguageContaminatedZones:/)
  assert.match(renderer, /issueType: languageIntegrity\.languageIssueType/)
})

test('birth structured prompt enforces English translated body text policy', () => {
  const prompt = read('lib/birthCertificatePrompt.ts')

  assert.match(prompt, /Do NOT keep Portuguese or Spanish body text in translated client-facing fields\./)
  assert.match(prompt, /Preserve source literals only when appropriate:/)
})
