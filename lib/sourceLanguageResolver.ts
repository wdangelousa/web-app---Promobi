import { normalizeLanguageCode } from './translatedLanguageIntegrity';

export interface StructuredSourceLanguageContext {
  sourceLanguage?: string | null;
  documentType?: string | null;
  originalFileUrl?: string | null;
  documentLabel?: string | null;
}

const PT_DEFAULT_DOCUMENT_TYPES = new Set([
  'birth_certificate_brazil',
  'marriage_certificate_brazil',
  'civil_record_general',
]);

function normalizeAsciiLower(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function likelyPortugueseCivilHint(value: string): boolean {
  const normalized = normalizeAsciiLower(value);
  return (
    /\bcertidao\b/.test(normalized) ||
    /\bnascimento\b/.test(normalized) ||
    /\bcasamento\b/.test(normalized) ||
    /\bcartorio\b/.test(normalized) ||
    /\baverbacao\b/.test(normalized) ||
    /\bregistro civil\b/.test(normalized) ||
    /\binteiro teor\b/.test(normalized)
  );
}

export function resolveSourceLanguageForStructuredContext(
  context: StructuredSourceLanguageContext,
): string {
  const normalized = normalizeLanguageCode(context.sourceLanguage);
  if (normalized === 'PT') return 'PT';
  if (normalized === 'ES') return 'ES';

  if (
    context.documentType &&
    PT_DEFAULT_DOCUMENT_TYPES.has(context.documentType)
  ) {
    return 'PT';
  }

  const hints = [context.originalFileUrl, context.documentLabel]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (hints.some((hint) => likelyPortugueseCivilHint(hint))) {
    return 'PT';
  }

  return (context.sourceLanguage ?? 'unknown').toUpperCase();
}
