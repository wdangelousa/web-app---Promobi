import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('workbench exposes IA Promobi modality modal with human-readable options and actions', () => {
  const workbench = read('app/admin/orders/[id]/components/Workbench.tsx')

  assert.match(workbench, /How do you want to generate this translation\?/)
  assert.match(workbench, /label: 'Standard'/)
  assert.match(workbench, /label: 'Faithful to the original document'/)
  assert.match(workbench, /label: 'Use external PDF'/)
  assert.match(workbench, /Save modality/)
  assert.match(workbench, /Save and generate translation/)
  assert.match(workbench, /const handleOpenIAPromobiModal = \(\) => \{/)
  assert.match(workbench, /const handleSaveTranslationModeOnly = async \(\) => \{/)
  assert.match(workbench, /const handleSaveAndGenerateByMode = async \(\) => \{/)
})

test('translation mode registry persists per-document modality and pipeline fields in order metadata', () => {
  const source = read('lib/translationArtifactSource.ts')

  assert.match(source, /const TRANSLATION_MODE_REGISTRY_KEY = 'translationModeRegistryV1'/)
  assert.match(source, /export type TranslationModeSelected/)
  assert.match(source, /translationModeSelected: TranslationModeSelected/)
  assert.match(source, /translationPipeline: TranslationPipelineKey/)
  assert.match(source, /translationSelectionSource: TranslationSelectionSource/)
  assert.match(source, /translationStatus: string/)
  assert.match(source, /translationTriggeredBy: string \| null/)
  assert.match(source, /translationStartedAt: string \| null/)
  assert.match(source, /translationCompletedAt: string \| null/)
  assert.match(source, /translationError: string \| null/)
  assert.match(source, /export function resolveTranslationPipelineForMode\(/)
  assert.match(source, /export function upsertTranslationModeRegistryRecord\(/)
  assert.match(source, /export function getTranslationModeRegistryRecord\(/)
})

test('workbench actions save modality, trigger selected pipeline, and guard duplicate generation', () => {
  const action = read('app/actions/workbench.ts')

  assert.match(action, /export async function saveIAPromobiTranslationModality\(/)
  assert.match(action, /export async function saveAndGenerateIAPromobiTranslation\(/)
  assert.match(action, /selectionSource: IA_PROMOBI_SELECTION_SOURCE/)
  assert.match(action, /triggerImmediately: false/)
  assert.match(action, /triggerImmediately: true/)
  assert.match(action, /translationStatus: 'generation_started'/)
  assert.match(action, /translationStatus: 'generation_completed'/)
  assert.match(action, /translationStatus: 'generation_error'/)
  assert.match(action, /translationStatus: 'blocked_external_pdf_missing'/)
  assert.match(action, /NOT: \{ translation_status: 'processing' \}/)
  assert.match(action, /__TRANSLATION_ALREADY_IN_PROGRESS__/)
})

test('claude translation route supports faithful blueprint forcing and external-pdf guardrails', () => {
  const route = read('app/api/translate/claude/route.ts')

  assert.match(route, /translationMode/)
  assert.match(route, /translationPipeline/)
  assert.match(route, /normalizeTranslationMode/)
  assert.match(route, /normalizeTranslationPipeline/)
  assert.match(route, /forceBlueprintPipeline/)
  assert.match(route, /externalPdfPipelineRequested/)
  assert.match(route, /Use external PDF mode should not call Anthropic translation/)
  assert.match(route, /Faithful to the original document is not available/)
  assert.match(route, /structuredPipelineForced: forceBlueprintPipeline/)
})
