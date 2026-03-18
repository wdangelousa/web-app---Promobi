import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('release path enforces structured delivery artifacts (not delivery_pdf_url alone)', () => {
  const workbenchAction = read('app/actions/workbench.ts')

  assert.match(workbenchAction, /function isStructuredDeliveryArtifactUrl/)
  assert.match(workbenchAction, /hasCompletedPath/)
  assert.match(workbenchAction, /hasTranslationsBucket/)
  assert.match(workbenchAction, /promobidocs-order-\$\{orderId\}-doc-\$\{docId\}\.pdf/)
  assert.match(workbenchAction, /!isStructuredDeliveryArtifactUrl\(d\.delivery_pdf_url,\s*orderId,\s*d\.id\)/)
  assert.match(workbenchAction, /PDF estruturado são obrigatórios/i)
  assert.match(workbenchAction, /structuredOnly:\s*true/)
})

test('structured guard blocks by surface, orientation, dense-table, and signature/seal capability', () => {
  const guard = read('services/structuredDocumentRenderer.ts')

  assert.match(guard, /resolveSurfaceRequirement/)
  assert.match(guard, /isSurfaceCapabilitySatisfied/)
  assert.match(guard, /isOrientationSupportedByMatrix/)
  assert.match(guard, /likelyTableDensity === 'high'/)
  assert.match(guard, /signatureStampPresence === 'common'/)
  assert.match(guard, /signatureStampPresence === 'very-common'/)
  assert.match(guard, /assertStructuredClientFacingRender/)
})

test('civil_records matrix orientation truth is explicitly landscape-disabled', () => {
  const matrix = read('services/documentFamilyRegistry.ts')
  const matrixStart = matrix.indexOf('DOCUMENT_FAMILY_IMPLEMENTATION_MATRIX')
  assert.notEqual(matrixStart, -1)
  const matrixBody = matrix.slice(matrixStart)
  const rowStart = matrixBody.indexOf("civil_records: {")
  const identityStart = matrixBody.indexOf("identity_travel: {")
  assert.notEqual(rowStart, -1)
  assert.notEqual(identityStart, -1)
  const civilRow = matrixBody.slice(rowStart, identityStart)

  assert.match(civilRow, /landscapeSupported:\s*false/)
  assert.match(civilRow, /orientationCapability:\s*'basic'/)
  assert.match(civilRow, /Landscape is intentionally blocked/)
})
