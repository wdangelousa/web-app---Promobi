import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function runStripTypesAndParseJson(code) {
  const result = spawnSync(
    'node',
    ['--experimental-strip-types', '-e', code],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  )

  assert.equal(
    result.status,
    0,
    `strip-types execution failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  )

  const lines = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  assert.ok(lines.length > 0, 'expected JSON output from strip-types execution')
  return JSON.parse(lines.at(-1))
}

test('folio in translated birth certification block does not trigger leakage by itself', () => {
  const segment =
    'I CERTIFY that, under number fifty-five thousand six hundred and ninety-nine, folio two hundred and eighty-nine of Book A-ninety-four, in Telêmaco Borba, State of PR, this entry was faithfully extracted.'
  const output = runStripTypesAndParseJson(`
    import { detectSourceLanguageLeakageFromSegments } from './lib/translatedLanguageIntegrity.ts';
    const result = detectSourceLanguageLeakageFromSegments(
      [${JSON.stringify(segment)}],
      { sourceLanguage: 'UNKNOWN', targetLanguage: 'EN' },
    );
    console.log(JSON.stringify(result));
  `)

  assert.equal(output.detected, false)
  assert.deepEqual(output.matchedMarkers, [])
})

test('diacritics in names and places inside translated English text do not trigger leakage', () => {
  const segment =
    'The child was born in São José dos Pinhais and later registered in Telêmaco Borba, Paraná, according to the certificate.'
  const output = runStripTypesAndParseJson(`
    import { detectSourceLanguageLeakageFromSegments } from './lib/translatedLanguageIntegrity.ts';
    const result = detectSourceLanguageLeakageFromSegments(
      [${JSON.stringify(segment)}],
      { sourceLanguage: 'UNKNOWN', targetLanguage: 'EN' },
    );
    console.log(JSON.stringify(result));
  `)

  assert.equal(output.detected, false)
  assert.deepEqual(output.matchedMarkers, [])
})

test('null sourceLanguage path defaults to PT for Brazilian civil record families', () => {
  const resolver = fs.readFileSync(
    path.join(process.cwd(), 'lib/sourceLanguageResolver.ts'),
    'utf8',
  )

  assert.match(resolver, /const PT_DEFAULT_DOCUMENT_TYPES = new Set\(\[/)
  assert.match(resolver, /'birth_certificate_brazil'/)
  assert.match(resolver, /'marriage_certificate_brazil'/)
  assert.match(resolver, /'civil_record_general'/)
  assert.match(
    resolver,
    /if \(\s*context\.documentType[\s\S]*PT_DEFAULT_DOCUMENT_TYPES\.has\(context\.documentType\)[\s\S]*return 'PT';/,
  )
})

test('real untranslated Portuguese contamination is still detected and blockable', () => {
  const segment =
    'Certidão de nascimento lavrada no livro A, folha 289, termo 55699, no cartório de registro civil das pessoas naturais.'
  const output = runStripTypesAndParseJson(`
    import { detectSourceLanguageLeakageFromSegments } from './lib/translatedLanguageIntegrity.ts';
    const result = detectSourceLanguageLeakageFromSegments(
      [${JSON.stringify(segment)}],
      { sourceLanguage: 'PT_BR', targetLanguage: 'EN' },
    );
    console.log(JSON.stringify(result));
  `)

  assert.equal(output.detected, true)
  assert.ok(
    output.matchedMarkers.includes('certidao') ||
      output.matchedMarkers.includes('registro civil'),
  )
})
