import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('document classifier recognizes flexible editorial/news signals without rigid subtype blocking', () => {
  const classifier = read('services/documentClassifier.ts')

  assert.match(classifier, /\| 'editorial_news_pages'/)
  assert.match(classifier, /editorial\/news signals matched/i)
  assert.match(classifier, /editorial_news_generic_structured/)
  assert.match(classifier, /return \{ documentType: 'editorial_news_pages', confidence: 'heuristic-high' \}/)
  assert.match(classifier, /return \{ documentType: 'editorial_news_pages', confidence: 'heuristic-low' \}/)
})

test('document family registry maps editorial news pages to implemented editorial family', () => {
  const registry = read('services/documentFamilyRegistry.ts')

  assert.match(registry, /'editorial_news_pages'/)
  assert.match(registry, /editorial_news_pages:\s*'editorial_news_pages'/)
  assert.match(registry, /editorial_news_pages:\s*\{/)
  assert.match(registry, /previewRendererImplemented:\s*true/)
  assert.match(registry, /finalDeliveryRendererImplemented:\s*true/)
  assert.match(registry, /editorial_news_pages:\s*\['editorial_news_pages'\]/)
})

test('structured renderer and pipeline include generic editorial news structured path', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')
  const pipeline = read('services/structuredPipeline.ts')

  assert.match(renderer, /editorial_news_pages:\s*'editorialNewsPagesRenderer'/)
  assert.match(renderer, /case 'editorial_news_pages':/)
  assert.match(renderer, /buildEditorialNewsPagesSystemPrompt\(/)
  assert.match(renderer, /normalizeEditorialNewsPagesPayload\(/)
  assert.match(renderer, /buildEditorialNewsLanguageIntegrity\(/)
  assert.match(renderer, /renderEditorialNewsPagesHtml\(/)
  assert.match(renderer, /editorial_news_generic_structured/)

  assert.match(pipeline, /editorial_news_pages:\s*'Editorial \/ News Pages'/)
  assert.match(pipeline, /\| 'editorial_news_pages'/)
  assert.match(pipeline, /familyDetection\.family !== 'editorial_news_pages'/)
})

