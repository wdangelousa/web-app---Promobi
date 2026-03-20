import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('academic transcript prompt enforces strict JSON-only output contract', () => {
  const prompt = read('lib/academicTranscriptPrompt.ts')

  assert.match(prompt, /ABSOLUTE OUTPUT CONTRACT \(mandatory\):/)
  assert.match(prompt, /Return STRICT JSON ONLY\./)
  assert.match(prompt, /Do NOT output any introductory sentence\./)
  assert.match(prompt, /Do NOT use markdown\./)
  assert.match(prompt, /Do NOT wrap the JSON in code fences\./)
  assert.match(prompt, /If you cannot comply with strict JSON output, return exactly:/)
  assert.match(prompt, /\{"error":"invalid_output"\}/)
})

test('academic transcript structured renderer retries once and repairs prose-prefixed JSON output', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')

  assert.match(renderer, /function tryParseStrictJsonObject<[^>]+>\(/)
  assert.match(renderer, /function extractFirstJsonObjectCandidate\(/)
  assert.match(renderer, /function tryRepairStructuredJsonObject<[^>]+>\(/)
  assert.match(renderer, /strict JSON parse failed on first attempt/)
  assert.match(renderer, /\[json-retry\]/)
  assert.match(renderer, /tryRepairStructuredJsonObject<AcademicTranscript>\(rawForRepair\)/)
  assert.match(renderer, /strict JSON contract still violated after retry; repaired JSON object from wrapped output/)
})

test('academic transcript renderer fails hard when sentinel invalid_output is returned', () => {
  const renderer = read('services/structuredDocumentRenderer.ts')

  assert.match(renderer, /function isInvalidOutputSentinel\(/)
  assert.match(renderer, /Claude returned \{"error":"invalid_output"\} for strict JSON contract/)
  assert.match(renderer, /assertExpectedDocumentTypeTag\('academic_transcript', parsed\)/)
})
