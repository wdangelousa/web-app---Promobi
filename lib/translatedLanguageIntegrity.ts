/**
 * lib/translatedLanguageIntegrity.ts
 * ---------------------------------------------------------------------------
 * Language-integrity heuristics for client-facing translated artifacts.
 *
 * Goal: detect likely source-language leakage in body text when target language
 * is English, while avoiding false positives on names, IDs, codes, and URLs.
 * ---------------------------------------------------------------------------
 */

export type NormalizedLanguageCode = 'EN' | 'PT' | 'ES' | 'OTHER';

export interface SourceLanguageLeakageOptions {
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
}

export interface SourceLanguageLeakageResult {
  detected: boolean;
  sourceLanguage: NormalizedLanguageCode;
  targetLanguage: NormalizedLanguageCode;
  scannedSegments: number;
  suspiciousSegments: string[];
  matchedMarkers: string[];
}

const PT_MARKERS = [
  'certidao',
  'nascimento',
  'casamento',
  'registro civil',
  'cartorio',
  'livro',
  'folha',
  'termo',
  'averbacao',
  'declarante',
  'naturalidade',
  'filiacao',
  'republica federativa do brasil',
  'assento',
  'emitida em',
  'oficial de registro',
  'registrado sob',
  'nome do registrado',
];

const ES_MARKERS = [
  'certificado',
  'nacimiento',
  'matrimonio',
  'registro civil',
  'acta',
  'folio',
  'tomo',
  'inscrito',
  'nacionalidad',
  'natural de',
  'declarante',
  'oficial del registro',
  'emitida en',
  'numero de acta',
  'expedida',
];

const PT_STRONG_PHRASES = [
  'certidao de nascimento',
  'registro civil das pessoas naturais',
  'republica federativa do brasil',
  'oficial de registro civil',
];

const ES_STRONG_PHRASES = [
  'acta de nacimiento',
  'registro civil',
  'oficial del registro',
  'certificado de nacimiento',
];

function normalizeAsciiLower(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function normalizeLanguageCode(
  value: string | null | undefined,
): NormalizedLanguageCode {
  const normalized = (value ?? '').trim().toUpperCase().replace('-', '_');
  if (
    normalized === 'EN' ||
    normalized === 'EN_US' ||
    normalized === 'ENGLISH'
  ) {
    return 'EN';
  }
  if (
    normalized === 'PT' ||
    normalized === 'PT_BR' ||
    normalized === 'PT_PT' ||
    normalized === 'PORTUGUESE'
  ) {
    return 'PT';
  }
  if (
    normalized === 'ES' ||
    normalized === 'ES_ES' ||
    normalized === 'ES_MX' ||
    normalized === 'SPANISH'
  ) {
    return 'ES';
  }
  return 'OTHER';
}

function isLikelyBodySegment(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 28) return false;
  if (/https?:\/\//i.test(trimmed)) return false;
  if (/^www\./i.test(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;

  // Ignore very code-like lines.
  if (/^[A-Z0-9 .,:;()\-_/]+$/.test(trimmed)) return false;

  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  const digits = (trimmed.match(/[0-9]/g) ?? []).length;
  if (letters === 0) return false;
  if (digits > letters) return false;

  return true;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function markerSetForSourceLanguage(
  sourceLanguage: NormalizedLanguageCode,
): { markers: string[]; strong: string[] } {
  if (sourceLanguage === 'PT') {
    return { markers: PT_MARKERS, strong: PT_STRONG_PHRASES };
  }
  if (sourceLanguage === 'ES') {
    return { markers: ES_MARKERS, strong: ES_STRONG_PHRASES };
  }
  return {
    markers: [...PT_MARKERS, ...ES_MARKERS],
    strong: [...PT_STRONG_PHRASES, ...ES_STRONG_PHRASES],
  };
}

export function detectSourceLanguageLeakageFromSegments(
  segments: string[],
  options: SourceLanguageLeakageOptions = {},
): SourceLanguageLeakageResult {
  const sourceLanguage = normalizeLanguageCode(options.sourceLanguage);
  const targetLanguage = normalizeLanguageCode(options.targetLanguage ?? 'EN');

  if (targetLanguage !== 'EN') {
    return {
      detected: false,
      sourceLanguage,
      targetLanguage,
      scannedSegments: 0,
      suspiciousSegments: [],
      matchedMarkers: [],
    };
  }

  const { markers, strong } = markerSetForSourceLanguage(sourceLanguage);
  const suspiciousSegments: string[] = [];
  const matchedMarkers = new Set<string>();
  let scannedSegments = 0;

  for (const raw of segments ?? []) {
    const segment = compactWhitespace(raw ?? '');
    if (!segment) continue;
    if (!isLikelyBodySegment(segment)) continue;

    scannedSegments += 1;
    const normalized = normalizeAsciiLower(segment);

    const strongHits = strong.filter((phrase) => normalized.includes(phrase));
    const markerHits = markers.filter((marker) => normalized.includes(marker));
    const diacriticHints = (segment.match(/[áàâãéêíóôõúçñ]/gi) ?? []).length;

    const suspiciousByStrongPhrase = strongHits.length > 0;
    const suspiciousByMarkerDensity = markerHits.length >= 2;
    const suspiciousByMarkerAndDiacritics =
      markerHits.length >= 1 && diacriticHints >= 2;

    if (suspiciousByStrongPhrase || suspiciousByMarkerDensity || suspiciousByMarkerAndDiacritics) {
      markerHits.forEach((marker) => matchedMarkers.add(marker));
      strongHits.forEach((phrase) => matchedMarkers.add(phrase));
      suspiciousSegments.push(segment);
    }
  }

  return {
    detected: suspiciousSegments.length > 0,
    sourceLanguage,
    targetLanguage,
    scannedSegments,
    suspiciousSegments: suspiciousSegments.slice(0, 5),
    matchedMarkers: Array.from(matchedMarkers).slice(0, 20),
  };
}

export function extractVisibleTextFromHtml(html: string): string {
  return (html ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectSourceLanguageLeakageFromHtml(
  html: string,
  options: SourceLanguageLeakageOptions = {},
): SourceLanguageLeakageResult {
  const text = extractVisibleTextFromHtml(html);
  const segments = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return detectSourceLanguageLeakageFromSegments(segments, options);
}
