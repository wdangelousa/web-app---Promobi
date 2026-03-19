import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('document classifier recognizes flexible letters/declarations signals without rigid subtype blocking', () => {
  const classifier = read('services/documentClassifier.ts')

  assert.match(classifier, /\| 'letters_and_statements'/)
  assert.match(classifier, /letters\/statements signals matched/i)
  assert.match(classifier, /letters_and_statements_generic_structured/)
  assert.match(classifier, /return \{ documentType: 'letters_and_statements', confidence: 'heuristic-high' \}/)
  assert.match(classifier, /return \{ documentType: 'letters_and_statements', confidence: 'heuristic-low' \}/)
})

test('document family registry maps letters_and_statements to implemented family', () => {
  const registry = read('services/documentFamilyRegistry.ts')

  assert.match(registry, /'letters_and_statements'/)
  assert.match(registry, /letters_and_statements:\s*'letters_and_statements'/)
  assert.match(registry, /letters_and_statements:\s*\{/)
  assert.match(registry, /previewRendererImplemented:\s*true/)
  assert.match(registry, /finalDeliveryRendererImplemented:\s*true/)
  assert.match(registry, /letters_and_statements:\s*\['letters_and_statements'\]/)
})

test('structured renderer and pipeline include generic letters_and_statements structured path', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')
  const pipeline = read('services/structuredPipeline.ts')

  assert.match(renderer, /letters_and_statements:\s*'lettersAndStatementsRenderer'/)
  assert.match(renderer, /case 'letters_and_statements':/)
  assert.match(renderer, /buildLettersAndStatementsSystemPrompt\(/)
  assert.match(renderer, /normalizeLettersAndStatementsPayload\(/)
  assert.match(renderer, /buildLettersStatementsLanguageIntegrity\(/)
  assert.match(renderer, /renderLettersAndStatementsHtml\(/)
  assert.match(renderer, /letters_and_statements_generic_structured/)

  assert.match(pipeline, /letters_and_statements:\s*'Letters \/ Statements'/)
  assert.match(pipeline, /\| 'letters_and_statements'/)
  assert.match(pipeline, /familyDetection\.family !== 'letters_and_statements'/)
})

