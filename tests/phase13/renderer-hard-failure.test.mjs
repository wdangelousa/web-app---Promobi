import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('critical structured renderers throw on failure instead of returning fallback error HTML', () => {
  const diploma = read('lib/academicDiplomaRenderer.ts')
  const transcript = read('lib/academicTranscriptRenderer.ts')
  const birth = read('lib/birthCertificateRenderer.ts')

  assert.match(diploma, /catch\s*\(err\)\s*\{[\s\S]*throw new Error\(/)
  assert.match(transcript, /catch\s*\(err\)\s*\{[\s\S]*throw new Error\(/)
  assert.match(birth, /catch\s*\(err\)\s*\{[\s\S]*throw new Error\(/)

  assert.doesNotMatch(diploma, /Erro ao processar/)
  assert.doesNotMatch(transcript, /Erro ao processar/)
  assert.doesNotMatch(birth, /Erro ao processar/)
})

test('manual completion bypasses are blocked in both admin status actions', () => {
  const adminOrdersAction = read('app/actions/adminOrders.ts')
  const adminAction = read('app/admin/actions.ts')

  assert.match(adminOrdersAction, /if \(status === 'COMPLETED'\)/)
  assert.match(adminOrdersAction, /Manual completion is disabled/i)
  assert.match(adminAction, /if \(newStatus === 'COMPLETED'\)/)
  assert.match(adminAction, /Manual completion is disabled/i)
})
