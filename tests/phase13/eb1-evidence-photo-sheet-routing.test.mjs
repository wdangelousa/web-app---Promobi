import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('document classifier recognizes eb1 evidence photo sheets from zone-layout signals and filenames', () => {
  const classifier = read('services/documentClassifier.ts')

  assert.match(classifier, /\| 'eb1_evidence_photo_sheet'/)
  assert.match(classifier, /eb1 evidence-photo signals matched/i)
  assert.match(classifier, /page_metadata/)
  assert.match(classifier, /translated_content_by_zone/)
  assert.match(classifier, /z_evidence_title/)
  assert.match(classifier, /return \{ documentType: 'eb1_evidence_photo_sheet', confidence: 'heuristic-high' \}/)
  assert.match(classifier, /evidence\[-_ \]\?\\d\+/)
})

test('document family registry maps eb1 evidence photo sheets to implemented relationship evidence family', () => {
  const registry = read('services/documentFamilyRegistry.ts')

  assert.match(registry, /eb1_evidence_photo_sheet:\s*'relationship_evidence'/)
  assert.match(registry, /relationship_evidence:\s*\{/)
  assert.match(registry, /previewRendererImplemented:\s*true/)
  assert.match(registry, /finalDeliveryRendererImplemented:\s*true/)
  assert.match(registry, /relationship_evidence:\s*\['eb1_evidence_photo_sheet'\]/)
})

test('structured renderer and pipeline include eb1 evidence generic structured route', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')
  const pipeline = read('services/structuredPipeline.ts')

  assert.match(renderer, /eb1_evidence_photo_sheet:\s*'eb1EvidencePhotoSheetRenderer'/)
  assert.match(renderer, /case 'eb1_evidence_photo_sheet':/)
  assert.match(renderer, /buildEb1EvidencePhotoSheetSystemPrompt\(/)
  assert.match(renderer, /renderEb1EvidencePhotoSheetHtml\(/)
  assert.match(renderer, /normalizeEb1EvidencePhotoSheetPayload\(/)
  assert.match(renderer, /buildEb1EvidenceLanguageIntegrity\(/)

  assert.match(pipeline, /eb1_evidence_photo_sheet:\s*'EB1 Evidence Photo Sheet'/)
  assert.match(pipeline, /\| 'relationship_evidence'/)
  assert.match(pipeline, /familyDetection\.family !== 'relationship_evidence'/)
})
