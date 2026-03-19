import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

function classify(input) {
  const script = `
    import { classifyDocument } from './services/documentClassifier.ts';
    const input = ${JSON.stringify(input)};
    const originalLog = console.log;
    console.log = () => {};
    const result = classifyDocument(input);
    console.log = originalLog;
    process.stdout.write(JSON.stringify(result));
  `

  const stdout = execFileSync(
    'node',
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    { cwd: process.cwd(), encoding: 'utf8' },
  )

  return JSON.parse(stdout.trim())
}

test('document classifier enforces low-confidence EB1 negative guards for academic/declaration/certificate overlap', () => {
  const classifier = read('services/documentClassifier.ts')

  assert.match(classifier, /shouldBlockEb1LowConfidence/)
  assert.match(classifier, /enrollment certificate/i)
  assert.match(classifier, /declaration of enrollment/i)
  assert.match(classifier, /article acceptance/i)
  assert.match(classifier, /recommendation letter/i)
  assert.match(classifier, /reference letter/i)
  assert.match(classifier, /low-confidence candidate blocked by academic\/declaration\/certificate negatives/i)
})

test('low-confidence EB1 candidate with enrollment-certificate context reroutes to academic_record_general', () => {
  const result = classify({
    translatedText: [
      'PAGE_METADATA',
      'LAYOUT_ZONES',
      'TRANSLATED_CONTENT_BY_ZONE',
      'ENROLLMENT CERTIFICATE',
    ].join(' '),
  })

  assert.deepEqual(result, {
    documentType: 'academic_record_general',
    confidence: 'heuristic-low',
  })
})

test('true EB1 evidence photo sheet routing remains intact for photo-evidence layouts', () => {
  const result = classify({
    translatedText: [
      'EVIDENCE 12',
      'PAGE_METADATA',
      'LAYOUT_ZONES',
      'TRANSLATED_CONTENT_BY_ZONE',
      'Z_EVIDENCE_TITLE',
      'Z_PHOTO_GALLERY',
    ].join(' '),
  })

  assert.deepEqual(result, {
    documentType: 'eb1_evidence_photo_sheet',
    confidence: 'heuristic-high',
  })
})
