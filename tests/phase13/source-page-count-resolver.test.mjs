import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('shared source page count resolver supports PDF, single-image, grouped-image and hybrid strategies', () => {
  const resolver = read('lib/sourcePageCountResolver.ts')

  assert.match(resolver, /export type SourceArtifactType =/)
  assert.match(resolver, /'pdf'/)
  assert.match(resolver, /'single_image'/)
  assert.match(resolver, /'grouped_images'/)
  assert.match(resolver, /'hybrid'/)
  assert.match(resolver, /'pdf_page_count'/)
  assert.match(resolver, /'single_image_file_assumed_one'/)
  assert.match(resolver, /'grouped_source_images_count'/)
  assert.match(resolver, /'hybrid_single_page_evidence'/)
  assert.match(resolver, /'provided_source_page_count_hint'/)
  assert.match(resolver, /resolveGroupedSourceImageCountHintFromOrderMetadata/)
})

test('preview and delivery actions resolve source page count through shared resolver with diagnostics', () => {
  const previewAction = read('app/actions/previewStructuredKit.ts')
  const deliveryAction = read('app/actions/generateDeliveryKit.ts')

  assert.match(previewAction, /resolveSourcePageCount\(/)
  assert.match(previewAction, /source page count resolution:/)
  assert.match(previewAction, /sourceArtifactType/)
  assert.match(previewAction, /sourcePageCountStrategy/)
  assert.match(previewAction, /resolveGroupedSourceImageCountHintFromOrderMetadata/)

  assert.match(deliveryAction, /resolveSourcePageCount\(/)
  assert.match(deliveryAction, /source page count resolution:/)
  assert.match(deliveryAction, /sourceArtifactType/)
  assert.match(deliveryAction, /sourcePageCountStrategy/)
  assert.match(deliveryAction, /resolveGroupedSourceImageCountHintFromOrderMetadata/)
})

test('structured kit builder diagnostics include source artifact type and strategy during parity checks', () => {
  const kit = read('services/structuredPreviewKit.ts')

  assert.match(kit, /resolveSourcePageCount\(/)
  assert.match(kit, /source_artifact_type:/)
  assert.match(kit, /source_page_count_strategy:/)
  assert.match(kit, /resolved_source_page_count:/)
  assert.match(kit, /blocking_reason: 'page_parity_unverifiable_source_page_count'/)
})

test('release guard resolves source page count for non-PDFs and logs resolver strategy', () => {
  const workbench = read('app/actions/workbench.ts')

  assert.match(workbench, /resolveSourcePageCountFromUrl/)
  assert.match(workbench, /resolveSourcePageCount\(/)
  assert.match(workbench, /resolveGroupedSourceImageCountHintFromOrderMetadata/)
  assert.match(workbench, /source_artifact_type:/)
  assert.match(workbench, /source_page_count_strategy:/)
  assert.match(workbench, /resolved_source_page_count:/)
})
