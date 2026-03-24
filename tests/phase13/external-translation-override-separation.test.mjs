import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('Plano B action replaces originalFileUrl without touching translation payloads', () => {
  const action = read('app/actions/replaceOriginalDocument.ts')

  assert.match(action, /export async function replaceOriginalDocument\(/)
  assert.match(action, /data:\s*\{\s*originalFileUrl: data\.publicUrl,/)
  assert.doesNotMatch(action, /externalTranslationUrl:/)
  assert.doesNotMatch(action, /translatedText:/)
})

test('workbench routes Plano B to replaceOriginalDocument and PDF Externo to uploadExternalTranslation', () => {
  const workbench = read('app/admin/orders/[id]/components/Workbench.tsx')

  assert.match(workbench, /const handleAttachPlanBFile = async \(file: File\)/)
  assert.match(workbench, /await import\('\.\.\/\.\.\/\.\.\/\.\.\/actions\/replaceOriginalDocument'\)/)
  assert.match(workbench, /const handleExternalUpload = async/)
  assert.match(workbench, /await import\('\.\.\/\.\.\/\.\.\/\.\.\/actions\/uploadExternal'\)/)
  assert.match(workbench, /onAttachPlanBPdf=\{handleAttachPlanBFile\}/)
})

test('editor is disabled only when externalTranslationUrl exists and shows override banner', () => {
  const editor = read('components/Workbench/Editor.tsx')

  assert.match(editor, /externalTranslationUrl\?: string \| null/)
  assert.match(editor, /External PDF active — structured translation is bypassed/)
  assert.match(editor, /\{externalTranslationUrl \? \(/)
  assert.match(editor, /!externalTranslationUrl && onAttachPlanBPdf/)
})

test('preview and delivery actions short-circuit to external translation override paths', () => {
  const previewAction = read('app/actions/previewStructuredKit.ts')
  const deliveryAction = read('app/actions/generateDeliveryKit.ts')
  const kitService = read('services/structuredPreviewKit.ts')

  assert.match(previewAction, /resolveTranslationArtifactSelection/)
  assert.match(previewAction, /artifactSelection\.source === 'external_pdf'/)
  assert.match(previewAction, /generatePreviewFromExternalPdf\(/)

  assert.match(deliveryAction, /resolveTranslationArtifactSelection/)
  assert.match(deliveryAction, /artifactSelection\.source === "external_pdf"/)
  assert.match(deliveryAction, /externalTranslatedPdfBuffer/)
  assert.match(deliveryAction, /external translation override applied for/)
  assert.match(deliveryAction, /approvedPreviewArtifactMatchesSelection/)
  assert.match(deliveryAction, /approvedPreviewUrlMatchesDocument/)
  assert.match(deliveryAction, /delivery artifact persisted from approved preview/)

  assert.match(kitService, /externalTranslatedPdfBuffer\?: ArrayBuffer;/)
  assert.match(kitService, /translated section source: external PDF override/)
})
