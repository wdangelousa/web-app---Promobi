import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('translation artifact selector prefers external PDF when URL exists', () => {
  const source = read('lib/translationArtifactSource.ts')

  assert.match(source, /export type TranslationArtifactSource/)
  assert.match(source, /if \(externalTranslationUrl\) \{/)
  assert.match(source, /source: 'external_pdf'/)
  assert.match(source, /reason: 'external_translation_url_present'/)
})

test('preview action uses shared translation artifact selector and logs selected source', () => {
  const previewAction = read('app/actions/previewStructuredKit.ts')

  assert.match(previewAction, /resolveTranslationArtifactSelection/)
  assert.match(previewAction, /selectedTranslationArtifactSource/)
  assert.match(previewAction, /previewUsedExternalPdf/)
  assert.match(previewAction, /artifactSelection\.source === 'external_pdf'/)
})

test('delivery action persists source-of-truth record for generated artifact', () => {
  const deliveryAction = read('app/actions/generateDeliveryKit.ts')

  assert.match(deliveryAction, /resolveTranslationArtifactSelection/)
  assert.match(deliveryAction, /upsertDeliveryArtifactRegistryRecord/)
  assert.match(deliveryAction, /selectedTranslationArtifactSource/)
  assert.match(deliveryAction, /deliveryUsedExternalPdf/)
})

test('release action blocks stale delivery artifacts when source-of-truth mismatches', () => {
  const releaseAction = read('app/actions/workbench.ts')

  assert.match(releaseAction, /getDeliveryArtifactRegistryRecord/)
  assert.match(releaseAction, /resolveTranslationArtifactSelection/)
  assert.match(releaseAction, /Release blocked by translation artifact source-of-truth rule/)
  assert.match(releaseAction, /sendToClientUsedExternalPdf/)
})

