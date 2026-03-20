import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const rendererPath = path.join(repoRoot, 'services/structuredDocumentRenderer.ts')
const renderer = fs.readFileSync(rendererPath, 'utf8')

test('editorial language integrity has safe carryover mapping for missing body continuation columns', () => {
  assert.match(renderer, /function isEditorialBodyContinuationZoneCandidate\(/)
  assert.match(renderer, /payload\.model_key === 'print_news_clipping'/)
  assert.match(renderer, /payload\.model_key === 'web_news_printview'/)
  assert.match(renderer, /unresolvedBodyContinuationZones\.length <= 1/)
  assert.match(renderer, /body_continuation_carryover:/)
})

test('editorial blocking invariant remains strict when integrity issues still exist', () => {
  assert.match(
    renderer,
    /Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface\./,
  )
})
