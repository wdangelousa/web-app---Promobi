import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('gotenberg client classifies transport and HTTP failures with actionable categories', () => {
  const client = read('lib/gotenbergClient.ts')

  assert.match(client, /export type GotenbergFailureType =/)
  assert.match(client, /'connection_refused'/)
  assert.match(client, /'timeout'/)
  assert.match(client, /'dns_resolution_failed'/)
  assert.match(client, /'service_unreachable'/)
  assert.match(client, /'network_restricted'/)
  assert.match(client, /'http_error'/)
  assert.match(client, /'malformed_request'/)
  assert.match(client, /resolveGotenbergEndpointCandidates\(/)
  assert.match(client, /GOTENBERG_TIMEOUT_MS/)
})

test('structured kit translated-section and cover failures include gotenberg diagnostics', () => {
  const kit = read('services/structuredPreviewKit.ts')

  assert.match(kit, /renderHtmlWithGotenberg\(/)
  assert.match(kit, /gotenberg_endpoint_used: string \| null;/)
  assert.match(kit, /gotenberg_failure_type: string \| null;/)
  assert.match(kit, /gotenberg_failure_detail: string \| null;/)
  assert.match(kit, /gotenberg_status_code: number \| null;/)
  assert.match(kit, /blocking_reason: 'translated_section_generation_failed'/)
  assert.match(kit, /blocking_reason: 'certification_cover_generation_failed'/)
})

test('structured preview service uses shared gotenberg client path', () => {
  const preview = read('services/structuredPreview.ts')

  assert.match(preview, /renderHtmlWithGotenberg\(/)
  assert.match(preview, /Gotenberg PDF generation failed:/)
})
