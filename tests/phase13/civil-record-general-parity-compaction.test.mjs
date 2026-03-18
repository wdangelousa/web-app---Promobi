import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('civil_record_general prompt includes anti-duplication and one-page compaction guidance', () => {
  const prompt = read('lib/civilRecordGeneralPrompt.ts')

  assert.match(prompt, /DEDUPLICATION AND CONTENT PLACEMENT:/)
  assert.match(prompt, /duplicate cross-field text/i)
  assert.match(prompt, /Source page count: 1\. Preserve full content integrity, but keep extraction compact/i)
})

test('civil_record_general renderer applies one-page compact mode and allows section splitting', () => {
  const renderer = read('lib/civilRecordGeneralRenderer.ts')

  assert.match(renderer, /compactOnePage = typeof options\.targetPageCount === 'number' && options\.targetPageCount === 1/)
  assert.match(renderer, /class=\"document \$\{compactOnePage \? 'compact-one-page' : 'standard-mode'\}\"/)
  assert.match(renderer, /page-break-inside: auto;/)
  assert.match(renderer, /break-inside: auto;/)
  assert.match(renderer, /compact-kv-grid/)
  assert.match(renderer, /renderCompactNotesSection/)
})

test('civil_record_general renderer preparation deduplicates repeated rows and narrative blocks', () => {
  const renderer = read('lib/civilRecordGeneralRenderer.ts')

  assert.match(renderer, /export function prepareCivilRecordGeneralForRender\(/)
  assert.match(renderer, /duplicateEntryRowsRemoved/)
  assert.match(renderer, /duplicateNarrativeBlocksRemoved/)
  assert.match(renderer, /keepUniqueNarrative/)
  assert.match(renderer, /compactionRecommended/)
})

test('structured dispatcher passes page count hint and emits civil layout diagnostics', () => {
  const dispatcher = read('services/structuredDocumentRenderer.ts')

  assert.match(dispatcher, /buildCivilRecordGeneralUserMessage\(\{\s*sourcePageCount: input\.sourcePageCount \?\? null,\s*\}\)/s)
  assert.match(dispatcher, /prepareCivilRecordGeneralForRender\(parsed, \{\s*targetPageCount: input\.sourcePageCount,\s*\}\)/s)
  assert.match(dispatcher, /\[civil-record-general\] layout diagnostics/)
})
