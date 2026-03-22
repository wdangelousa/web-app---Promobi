/**
 * lib/singlePageSafeguard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single-page routing safeguard.
 *
 * For sourcePageCount === 1, the default rendering path is faithful-light
 * (plain HTML wrap of the translated text), because structured AI extraction
 * frequently expands single-page source documents to 2+ translated pages,
 * forcing parity conflicts onto the operator.
 *
 * Document types on the whitelist are exempted because they either:
 *   (a) have dedicated 1-page renderers unlikely to produce expansion, or
 *   (b) have field-heavy layouts where structured template fidelity is critical.
 *
 * If a whitelisted type still expands 1 → 2+ pages after structured AI
 * rendering, the caller MUST retry with faithful-light before surfacing
 * the parity decision modal (which is a last resort only).
 *
 * Routing outcomes:
 *   'not_single_page'       — sourcePageCount is not 1; safeguard does not apply
 *   'structured_ai_allowed' — 1-page doc, whitelisted; structured AI proceeds
 *   'safeguard_blocked'     — 1-page doc, not whitelisted; use faithful-light
 */

export type SinglePageRoutingOutcome =
  | 'structured_ai_allowed'
  | 'safeguard_blocked'
  | 'not_single_page';

/**
 * Document types whose visual genre is certificate / diploma / award.
 *
 * When any of these types falls back to the faithful-light HTML renderer
 * (safeguard blocked, structured rendering failed, or expansion retry),
 * the renderer applies a centered certificate-style layout instead of the
 * default left-aligned prose transcription layout.
 *
 * This set is intentionally separate from SINGLE_PAGE_STRUCTURED_AI_WHITELIST:
 * whitelisting controls whether structured AI runs; genre detection controls
 * how the faithful-light HTML looks if structured AI is bypassed or fails.
 */
export const CERTIFICATE_GENRE_DOCUMENT_TYPES = new Set<string>([
  'course_certificate_landscape',
  'academic_diploma_certificate',
  'marriage_certificate_brazil',
  'birth_certificate_brazil',
  'publication_acceptance_certificate',
]);

/**
 * Returns true if the document type belongs to the certificate / diploma / award
 * visual genre and should use a certificate-style layout in the faithful-light renderer.
 */
export function isCertificateGenreDocumentType(documentType: string): boolean {
  return CERTIFICATE_GENRE_DOCUMENT_TYPES.has(documentType);
}

/**
 * Document types that are allowed to use structured AI for single-page sources.
 *
 * Criteria:
 *   - Dedicated 1-page certificate/diploma renderers (purpose-built; rarely expand)
 *   - Field-heavy forms where structured template fidelity is essential
 *   - Complex photo / editorial layouts
 *   - Faithful-modality types (parity recovery ladder already runs for these)
 *
 * Everything NOT on this list defaults to faithful-light for 1-page docs.
 */
export const SINGLE_PAGE_STRUCTURED_AI_WHITELIST = new Set<string>([
  // Dedicated certificate and diploma renderers — purpose-built for 1-page output
  'marriage_certificate_brazil',
  'birth_certificate_brazil',
  'course_certificate_landscape',
  'academic_diploma_certificate',

  // Field-heavy forms where structured template fidelity is critical
  'civil_record_general',
  'identity_travel_record',
  'academic_transcript',

  // Complex photo / editorial layouts
  'eb1_evidence_photo_sheet',

  // Faithful-modality types — parity recovery ladder runs; safeguard is redundant
  'editorial_news_pages',
  'publication_media_record',
]);

/**
 * Resolves the single-page routing outcome for a document.
 *
 * Returns:
 *   'not_single_page'       — sourcePageCount is not 1; caller proceeds normally
 *   'structured_ai_allowed' — 1-page doc, type is whitelisted; structured AI allowed
 *   'safeguard_blocked'     — 1-page doc, type is not whitelisted; use faithful-light
 */
export function resolveSinglePageRouting(
  documentType: string,
  sourcePageCount: number | null | undefined,
): SinglePageRoutingOutcome {
  if (typeof sourcePageCount !== 'number' || sourcePageCount !== 1) {
    return 'not_single_page';
  }

  if (SINGLE_PAGE_STRUCTURED_AI_WHITELIST.has(documentType)) {
    return 'structured_ai_allowed';
  }

  return 'safeguard_blocked';
}
