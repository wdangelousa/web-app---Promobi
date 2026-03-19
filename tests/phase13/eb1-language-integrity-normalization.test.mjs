import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('eb1 payload normalizer accepts translated zone schema variants and root-level fallback', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')

  assert.match(renderer, /function normalizeEb1EvidenceTranslatedZones\(/)
  assert.match(renderer, /entry\.text/)
  assert.match(renderer, /entry\.translated_content/)
  assert.match(renderer, /entry\.translatedText/)
  assert.match(renderer, /entry\.value/)
  assert.match(renderer, /pages\.length === 1 && pages\[0\]\.TRANSLATED_CONTENT_BY_ZONE\.length === 0 && rootTranslatedZones\.length > 0/)
})

test('eb1 language integrity excludes decorative non-text zones from required translated bindings', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')

  assert.match(renderer, /function isEb1EvidenceTextBearingZone\(/)
  assert.match(renderer, /'logo'/)
  assert.match(renderer, /'border'/)
  assert.match(renderer, /'watermark'/)
  assert.match(renderer, /'decorative'/)
  assert.match(renderer, /'insignia'/)
})

