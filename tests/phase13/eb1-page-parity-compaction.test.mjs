import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('eb1 evidence renderer enables compact one-page mode when source page count is 1', () => {
  const renderer = read('lib/eb1EvidencePhotoSheetRenderer.ts')

  assert.match(renderer, /const compactOnePage =/)
  assert.match(renderer, /options\.pageCount === 1/)
  assert.match(renderer, /pages\.length === 1/)
  assert.match(renderer, /pageOrientation === 'portrait'/)
  assert.match(renderer, /one-page-compact/)
})

test('eb1 evidence renderer avoids fixed oversized page min-height and uses compact-safe min-height vars', () => {
  const renderer = read('lib/eb1EvidencePhotoSheetRenderer.ts')

  assert.match(renderer, /--evidence-page-min-height:\$\{mode\.compactOnePage \? '7\.86in' : '8\.02in'\}/)
  assert.match(renderer, /min-height: var\(--evidence-page-min-height, 8\.02in\);/)
  assert.doesNotMatch(renderer, /min-height:\s*10\.25in/)
})

test('eb1 evidence renderer keeps photo layout modes and compact constraints with marker anchoring', () => {
  const renderer = read('lib/eb1EvidencePhotoSheetRenderer.ts')

  assert.match(renderer, /type PhotoLayoutMode = 'single' \| 'two' \| 'two_plus_one'/)
  assert.match(renderer, /layout-two_plus_one/)
  assert.match(renderer, /layout-two/)
  assert.match(renderer, /layout-single/)
  assert.match(renderer, /\.photo-placeholder \{[\s\S]*aspect-ratio: 4 \/ 3;/)
  assert.match(renderer, /\.evidence-page\.one-page-compact\.layout-two_plus_one/)
  assert.match(renderer, /\.highlight-marker \{[\s\S]*position: absolute;/)
  assert.match(renderer, /\.evidence-page\.one-page-compact \.highlight-marker/)
})
