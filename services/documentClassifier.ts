/**
 * services/documentClassifier.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Document type classifier — identifies the type of a document being translated.
 *
 * Strategy: heuristic-only, zero new dependencies, never throws.
 * Signal priority (highest → lowest reliability):
 *   1. Translated English text   — canonical markers produced by OUTPUT_RULES in translationPrompt.ts
 *   2. Source file URL/filename  — fallback when translation is unavailable
 *
 * Current supported types:
 *   - marriage_certificate_brazil  (certidão de casamento)
 *   - birth_certificate_brazil     (certidão de nascimento)
 *   - unknown                      (anything else, or insufficient signals)
 *
 * Integration note:
 *   This classifier is AUXILIARY — it never modifies translation behavior.
 *   Results are logged and kept as local metadata for future use.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type DocumentType =
  | 'marriage_certificate_brazil'    // Certidão de Casamento
  | 'birth_certificate_brazil'       // Certidão de Nascimento
  | 'course_certificate_landscape'   // Course/training/participation/completion certificates
  | 'unknown';

export type ClassificationConfidence =
  | 'heuristic-high'  // ≥3 distinct signal matches
  | 'heuristic-low';  // 1–2 signal matches, or only filename hint

export interface ClassificationResult {
  documentType: DocumentType;
  confidence: ClassificationConfidence;
}

export interface ClassifierInput {
  /** Storage URL — filename may hint at document type. */
  fileUrl?: string;
  /** English translation output from Claude — the most reliable signal. */
  translatedText?: string;
  /** Source language code, e.g. 'PT_BR' | 'pt' | 'ES' | 'es'. */
  sourceLanguage?: string;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Classifies the document type using available heuristic signals.
 *
 * - Never throws. Returns 'unknown' on any ambiguity or error.
 * - Classification does NOT affect translation output.
 */
export function classifyDocument(input: ClassifierInput): ClassificationResult {
  try {
    // Signal 1: translated English text (most reliable — canonical OUTPUT_RULES markers)
    if (input.translatedText) {
      const result = classifyFromTranslatedText(input.translatedText);
      if (result.documentType !== 'unknown') return result;
    }

    // Signal 2: filename / URL hint
    if (input.fileUrl) {
      const result = classifyFromUrl(input.fileUrl);
      if (result.documentType !== 'unknown') return result;
    }
  } catch {
    // Classification must NEVER break the translation pipeline
  }

  return { documentType: 'unknown', confidence: 'heuristic-low' };
}

// ── Signal: English translated text ──────────────────────────────────────────
// Uses canonical OUTPUT_RULES markers from translationPrompt.ts.
// Each regex matches a label that only appears in one specific document type.

function classifyFromTranslatedText(text: string): ClassificationResult {
  // ── Marriage Certificate (Brazil) ──
  // Canonical markers from the marriage certificate OUTPUT_RULES example.
  // These labels are unique to this document type and won't appear in other certs.
  const marriageSignals: RegExp[] = [
    /marriage certificate/i,
    /civil registry of natural persons/i,
    /1st spouse/i,
    /2nd spouse/i,
    /property regime/i,
    /name at the time of marriage/i,
    /annotations\/endorsements/i,
    /voluntary registry annotations/i,
    /date of celebration of marriage/i,
  ];

  const marriageHits = marriageSignals.filter(rx => rx.test(text)).length;

  if (marriageHits >= 3) {
    return { documentType: 'marriage_certificate_brazil', confidence: 'heuristic-high' };
  }
  if (marriageHits >= 1) {
    return { documentType: 'marriage_certificate_brazil', confidence: 'heuristic-low' };
  }

  // ── Birth Certificate (Brazil) ──
  // Must NOT match any marriage-specific markers to avoid false positives
  // (marriage certs also contain dates of birth and parent names).
  const hasMarriageMarker =
    /1st spouse/i.test(text) ||
    /2nd spouse/i.test(text) ||
    /property regime/i.test(text) ||
    /marriage celebration/i.test(text);

  if (!hasMarriageMarker) {
    const birthSignals: RegExp[] = [
      /birth certificate/i,
      /certid[aã]o de nascimento/i,   // sometimes present untranslated
      /name of (?:the )?child/i,
      /date and place of birth/i,
      /father[:\s]/i,
      /mother[:\s]/i,
    ];

    const birthHits = birthSignals.filter(rx => rx.test(text)).length;

    if (birthHits >= 3) {
      return { documentType: 'birth_certificate_brazil', confidence: 'heuristic-high' };
    }
    if (birthHits >= 1) {
      return { documentType: 'birth_certificate_brazil', confidence: 'heuristic-low' };
    }
  }

  // ── Course / Landscape Certificate ──
  // Only reached if NEITHER marriage NOR birth cert matched above.
  // Two independent detection paths — both preserved for safety:
  //
  //   Path 1 (flat count): classic compound phrases, ≥3 → high, ≥2 → low.
  //   Path 2 (combination rules): named semantic groups, AND-combined.
  //     Requires structurally coherent clusters from distinct dimensions.
  //     Immune to a single noisy signal inflating the count.
  //
  // Anti-overlap guards (implicit via early returns above):
  //   - Marriage cert markers: civil registry, spouse, property regime → early-returned above
  //   - Birth cert markers: child name, date and place of birth → early-returned above

  // ── Path 1: flat signal count ──────────────────────────────────────────────
  const certLandscapeSignals: RegExp[] = [
    /certificate of (?:completion|participation|training|attendance|achievement)/i,
    /(?:completion|participation|training|attendance) certificate/i,
    /has (?:successfully )?completed (?:the |this )?(?:course|training|program|module|workshop)/i,
    /in recognition of (?:completing|(?:his|her|their) (?:participation|completion|attendance))/i,
    /participated in (?:the |a |this )?(?:course|training|program|workshop|seminar|symposium|event)/i,
    /\d+\s*hours? of (?:training|course|instruction|study|classes)/i,
    /(?:course|training) (?:workload|duration|load)[:\s]/i,
    /(?:we (?:hereby )?certify|this is to certify) that .{0,120}(?:completed|participated|attended)/i,
    /award(?:ed)? (?:this )?certificate/i,
    /(?:technical|scientific|event|course|training|program) (?:director|coordinator)/i,
  ];

  const certLandscapeHits = certLandscapeSignals.filter(rx => rx.test(text)).length;

  // ── Path 2: combination rules (named semantic groups) ──────────────────────
  // Used as an OR path alongside the flat count.
  // Each group covers one semantic dimension; rules require multiple dimensions.
  // "certificate" alone (hasCertTitle) never classifies — always AND-combined.

  // Dimension A: standalone certificate word
  const hasCertTitle   = /\bcertificate\b/i.test(text);
  // Dimension B: certify/attest language ("we certify", "we hereby certify", "this is to certify")
  const hasCertifyLang = /(?:we (?:hereby )?certify|this is to certify)/i.test(text);
  // Dimension C: participation or completion language
  const hasParticipation =
    /participated in (?:the |a |this )?(?:course|training|program|workshop|seminar|symposium|event)/i.test(text) ||
    /has (?:successfully )?completed (?:the |this )?(?:course|training|program|module|workshop)/i.test(text) ||
    /in recognition of (?:completing|(?:his|her|their) (?:participation|completion|attendance))/i.test(text);
  // Dimension D: course load / workload / hours
  const hasCourseLoad  =
    /(?:course|training) (?:workload|duration|load)[:\s]/i.test(text) ||
    /\d+\s*hours? of (?:training|course|instruction|study|classes)/i.test(text);
  // Dimension E: institutional certificate signatory roles
  const hasSignatoryRole =
    /(?:technical|scientific|event|course|training|program) (?:director|coordinator)/i.test(text);

  // Rule 1: certify language + participation → issuing-body attestation of training
  const comboRule1 = hasCertifyLang && hasParticipation;
  // Rule 2: cert title + certify language + course load → structured institutional cert
  const comboRule2 = hasCertTitle && hasCertifyLang && hasCourseLoad;
  // Rule 3: cert title + course load + institutional signatory role
  const comboRule3 = hasCertTitle && hasCourseLoad && hasSignatoryRole;

  const matchesCombinationRule = comboRule1 || comboRule2 || comboRule3;

  // ── Logging ─────────────────────────────────────────────────────────────────
  if (certLandscapeHits > 0 || matchesCombinationRule) {
    const activeRules = [
      comboRule1 && 'certify+participation',
      comboRule2 && 'title+certify+load',
      comboRule3 && 'title+load+role',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] certificate landscape signals matched: ${certLandscapeHits}` +
      (matchesCombinationRule ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  // ── Decision ─────────────────────────────────────────────────────────────────
  if (certLandscapeHits >= 3 || matchesCombinationRule) {
    return { documentType: 'course_certificate_landscape', confidence: 'heuristic-high' };
  }
  if (certLandscapeHits >= 2) {
    return { documentType: 'course_certificate_landscape', confidence: 'heuristic-low' };
  }

  return { documentType: 'unknown', confidence: 'heuristic-low' };
}

// ── Signal: filename / storage URL ───────────────────────────────────────────

function classifyFromUrl(fileUrl: string): ClassificationResult {
  if (/casamento|marriage[-_]cert/i.test(fileUrl)) {
    return { documentType: 'marriage_certificate_brazil', confidence: 'heuristic-low' };
  }
  if (/nascimento|birth[-_]cert/i.test(fileUrl)) {
    return { documentType: 'birth_certificate_brazil', confidence: 'heuristic-low' };
  }
  return { documentType: 'unknown', confidence: 'heuristic-low' };
}
