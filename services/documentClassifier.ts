/**
 * services/documentClassifier.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Document type classifier — identifies the type of a document being translated.
 *
 * Strategy: heuristic-only, zero new dependencies, never throws.
 * Signal priority (highest → lowest reliability):
 *   1. Translated English text   — canonical markers produced by OUTPUT_RULES in translationPrompt.ts
 *   2. Original document label   — operator-visible filename/title when available
 *   3. Source file URL/filename  — fallback when translation is unavailable
 *
 * Current supported types:
 *   - marriage_certificate_brazil    (certidão de casamento)
 *   - birth_certificate_brazil       (certidão de nascimento)
 *   - civil_record_general           (divorce/death/adoption/name-change/registry civil records)
 *   - identity_travel_record         (passport/ID/visa/travel evidence pages)
 *   - academic_diploma_certificate   (diplomas, degree certificates from universities)
 *   - academic_transcript            (grade records, school histories, histórico escolar)
 *   - academic_record_general        (enrollment/declaration/completion/syllabus records)
 *   - corporate_business_record      (corporate registrations, bylaws, resolutions, extracts)
 *   - publication_acceptance_certificate (journal article acceptance certificates, Declaração de Aceite Artigo)
 *   - editorial_news_pages           (news/editorial pages: print clipping, web article, printview, metadata)
 *   - publication_media_record       (articles, media clippings, publication metadata pages)
 *   - letters_and_statements         (recommendation letters, declarations, letter+resume bundles)
 *   - recommendation_letter          (recommendation, expert opinion, support/reference letters)
 *   - employment_record              (employment letters, HR attestations, salary confirmations)
 *   - course_certificate_landscape   (course/training/participation/completion certificates)
 *   - eb1_evidence_photo_sheet       (EB1 evidence sheets with title/paragraph/photo zones)
 *   - unknown                        (anything else, or insufficient signals)
 *
 * Classification order matters — more-specific families are checked first:
 *   marriage → birth → civil_record_general → identity_travel → academic_diploma → academic_transcript → academic_record_general → corporate_business_record → publication_acceptance_certificate → editorial_news_pages → publication_media_record → letters_and_statements → recommendation_letter → employment_record → course_certificate → eb1_evidence_photo_sheet → unknown
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
  | 'civil_record_general'           // Divorce/death/adoption/name-change/civil-registry records
  | 'identity_travel_record'         // Passport/ID/visa/travel evidence
  | 'academic_diploma_certificate'   // University diplomas, degree certificates
  | 'academic_transcript'            // Grade transcripts, school records, histórico escolar
  | 'academic_record_general'        // Enrollment/declaration/completion/syllabus records
  | 'corporate_business_record'      // Corporate registries, resolutions, bylaws, business licenses
  | 'publication_acceptance_certificate' // Journal/publication acceptance certificates (Declaração de Aceite Artigo)
  | 'editorial_news_pages'           // Flexible editorial/news pages (print/web/metadata/printview)
  | 'publication_media_record'       // Publication/media evidence: article pages, covers, clippings
  | 'letters_and_statements'         // Flexible recommendations/declarations (including letter+resume bundles)
  | 'recommendation_letter'          // Recommendation/expert opinion/support/reference letters
  | 'employment_record'              // Employment letters/contracts/attestations
  | 'course_certificate_landscape'   // Course/training/participation/completion certificates
  | 'eb1_evidence_photo_sheet'       // EB1 evidence photo sheets with zone-structured pages
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
  /** Original filename or operator-facing document label, if available. */
  documentLabel?: string;
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

    // Signal 2: original filename / visible label hint
    if (input.documentLabel) {
      const result = classifyFromUrl(input.documentLabel);
      if (result.documentType !== 'unknown') return result;
    }

    // Signal 3: filename / storage URL hint
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

function classifyFromTranslatedText(rawText: string): ClassificationResult {
  // Strip HTML tags so paragraph-split phrases resolve to contiguous text.
  // e.g. "<p>participated</p><p>in the II FÓRUM</p>" → "participated in the II FÓRUM"
  // This has no effect on plain-text input.
  const text = rawText
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // ── Marriage Certificate (Brazil) ──
  // Canonical markers from the marriage certificate OUTPUT_RULES example.
  // Split into strict markers (marriage-specific) and contextual markers.
  // Contextual markers can appear in birth records too, so they cannot classify
  // a document as marriage on their own.
  const marriageStrictSignals: RegExp[] = [
    /marriage certificate/i,
    /1st spouse/i,
    /2nd spouse/i,
    /property regime/i,
    /name at the time of marriage/i,
    /date of celebration of marriage/i,
  ];
  const marriageContextSignals: RegExp[] = [
    /civil registry of natural persons/i,
    /annotations\/endorsements/i,
    /voluntary registry annotations/i,
  ];

  const marriageStrictHits = marriageStrictSignals.filter(rx => rx.test(text)).length;
  const marriageContextHits = marriageContextSignals.filter(rx => rx.test(text)).length;
  const marriageHits = marriageStrictHits + marriageContextHits;

  if (marriageStrictHits >= 2 && marriageHits >= 3) {
    return { documentType: 'marriage_certificate_brazil', confidence: 'heuristic-high' };
  }
  if (marriageStrictHits >= 1 && marriageHits >= 2) {
    return { documentType: 'marriage_certificate_brazil', confidence: 'heuristic-low' };
  }

  // ── Birth Certificate (Brazil) ──
  // Must NOT match any marriage-specific markers to avoid false positives
  // (marriage certs also contain dates of birth and parent names).
  const hasMarriageMarker =
    /1st spouse/i.test(text) ||
    /2nd spouse/i.test(text) ||
    /property regime/i.test(text) ||
    /marriage celebration/i.test(text) ||
    /celebration of marriage/i.test(text);

  if (!hasMarriageMarker) {
    const birthSignals: RegExp[] = [
      /birth certificate/i,
      /certid[aã]o de nascimento/i,   // sometimes present untranslated
      /name of (?:the )?child/i,
      /date and place of birth/i,
      /place of birth[:\s]/i,         // more specific than generic "father:"
      /declarant[:\s]/i,              // person who registered the birth — birth-cert-specific
      /birth registration/i,
      /child'?s? name[:\s]/i,
      /father[:\s]/i,
      /mother[:\s]/i,
    ];

    const birthHits = birthSignals.filter(rx => rx.test(text)).length;

    // Combination rules for birth cert — stronger confidence from semantic clusters
    const hasBirthCertTitle = /birth certificate/i.test(text) || /certid[aã]o de nascimento/i.test(text);
    const hasChildInfo = /name of (?:the )?child/i.test(text) || /child'?s? name[:\s]/i.test(text);
    const hasBirthDate = /date (?:and (?:place )?)?of birth/i.test(text);
    const hasBothParents = /father[:\s]/i.test(text) && /mother[:\s]/i.test(text);

    // Rule 1: explicit birth cert title + child information
    const birthCombo1 = hasBirthCertTitle && hasChildInfo;
    // Rule 2: explicit birth cert title + birth date
    const birthCombo2 = hasBirthCertTitle && hasBirthDate;
    // Rule 3: both parents listed + birth date (without marriage markers already excluded above)
    const birthCombo3 = hasBothParents && hasBirthDate;

    const matchesBirthCombo = birthCombo1 || birthCombo2 || birthCombo3;

    if (birthHits >= 4 || matchesBirthCombo) {
      return { documentType: 'birth_certificate_brazil', confidence: 'heuristic-high' };
    }
    if (birthHits >= 2) {
      return { documentType: 'birth_certificate_brazil', confidence: 'heuristic-low' };
    }
  }

  // ── General Civil Records ────────────────────────────────────────────────
  // Covers:
  //   - divorce certificates / judgments / decrees
  //   - death certificates
  //   - adoption records / orders
  //   - name change records / orders
  //   - civil registry extracts for natural persons
  //
  // Checked AFTER marriage and birth certs to preserve dedicated renderers,
  // and BEFORE identity/corporate families so civil-registry language is not
  // downgraded into generic categories.
  //
  // Distinguishes:
  //   - certificate style
  //   - registry extract style
  //   - judgment/order-derived civil records

  const civilGeneralSignals: RegExp[] = [
    /\bdeath certificate\b/i,
    /\bcertificate of death\b/i,
    /\bdate of death\b/i,
    /\bcause of death\b/i,
    /\bdeceased\b/i,
    /\bdivorce (?:certificate|decree|judgment)\b/i,
    /\bdecree of divorce\b/i,
    /\badoption (?:record|order|judgment|decree|certificate)\b/i,
    /\bname change (?:record|order|judgment|decree|certificate)\b/i,
    /\bcivil registry extract\b/i,
    /\bextract from (?:the )?civil registry\b/i,
    /\bregistry of natural persons\b/i,
    /\bregistro civil\b/i,
    /\bcertid[aã]o de [oó]bito\b/i,
    /\bcertid[aã]o de div[oó]rcio\b/i,
    /\bcertid[aã]o de ado[cç][aã]o\b/i,
    /\baverba[cç][aã]o\b/i,
    /\bmarginal note(?:s)?\b/i,
    /\bannotation(?:s)?\/endorsement(?:s)?\b/i,
    /\bwitness(?:es)?\b/i,
    /\bspouse\b/i,
    /\bcourt order\b/i,
    /\bcivil court\b/i,
    /\bjudge\b/i,
    /\bcase number\b/i,
    /\bdocket number\b/i,
    /\bbook\b.{0,20}\bpage\b/i,
    /\bterm\b.{0,20}\bbook\b/i,
    /\bregistry book\b/i,
  ];

  const civilGeneralHits = civilGeneralSignals.filter((rx) => rx.test(text)).length;

  const hasCivilRegistryContext =
    /\bcivil registry\b/i.test(text) ||
    /\bregistry of natural persons\b/i.test(text) ||
    /\bregistro civil\b/i.test(text) ||
    /\bregistry office\b/i.test(text);

  const hasCivilEventMarker =
    /\bdeath\b/i.test(text) ||
    /\bdeceased\b/i.test(text) ||
    /\bdivorce\b/i.test(text) ||
    /\badoption\b/i.test(text) ||
    /\bname change\b/i.test(text);

  const hasCertificateStyleMarker =
    /\bcertificate\b/i.test(text) &&
    (/\bregistry\b/i.test(text) || hasCivilEventMarker);

  const hasRegistryExtractStyleMarker =
    /\bcivil registry extract\b/i.test(text) ||
    /\bextract from (?:the )?civil registry\b/i.test(text) ||
    /\bregistry extract\b/i.test(text) ||
    /\bbook\b.{0,20}\bpage\b/i.test(text) ||
    /\bregistry book\b/i.test(text);

  const hasJudgmentOrderStyleMarker =
    /\bcourt order\b/i.test(text) ||
    /\bjudgment\b/i.test(text) ||
    /\bdecree\b/i.test(text) ||
    /\bjudge\b/i.test(text) ||
    /\bcase number\b/i.test(text) ||
    /\bdocket number\b/i.test(text);

  const hasCivilPersonRoleBlock =
    /\bfather[:\s]/i.test(text) ||
    /\bmother[:\s]/i.test(text) ||
    /\bspouse[:\s]/i.test(text) ||
    /\bwitness(?:es)?[:\s]/i.test(text) ||
    /\bparents?[:\s]/i.test(text);

  const hasCivilAnnotationsMarker =
    /\bannotation(?:s)?\/endorsement(?:s)?\b/i.test(text) ||
    /\bmarginal note(?:s)?\b/i.test(text) ||
    /\baverba[cç][aã]o\b/i.test(text);

  const hasCorporateOverlapMarker =
    /\barticles of (?:incorporation|organization)\b/i.test(text) ||
    /\boperating agreement\b/i.test(text) ||
    /\bbylaws?\b/i.test(text) ||
    /\bsecretary of state\b/i.test(text) ||
    /\bregistered agent\b/i.test(text) ||
    /\bcorporate resolution\b/i.test(text) ||
    /\bshareholder(?:s)?\b/i.test(text) ||
    /\bcnpj\b/i.test(text);

  const civilGeneralCombo1 = hasCivilRegistryContext && hasCivilEventMarker;
  const civilGeneralCombo2 = hasCertificateStyleMarker && hasCivilPersonRoleBlock;
  const civilGeneralCombo3 =
    hasRegistryExtractStyleMarker && (hasCivilPersonRoleBlock || hasCivilAnnotationsMarker);
  const civilGeneralCombo4 = hasJudgmentOrderStyleMarker && hasCivilEventMarker;
  const civilGeneralCombo5 =
    hasCivilRegistryContext && hasJudgmentOrderStyleMarker && hasCivilAnnotationsMarker;

  const matchesCivilGeneralCombo =
    civilGeneralCombo1 ||
    civilGeneralCombo2 ||
    civilGeneralCombo3 ||
    civilGeneralCombo4 ||
    civilGeneralCombo5;

  if (civilGeneralHits > 0 || matchesCivilGeneralCombo) {
    const activeRules = [
      civilGeneralCombo1 && 'registry+event',
      civilGeneralCombo2 && 'certificate+person-roles',
      civilGeneralCombo3 && 'extract+annotations/roles',
      civilGeneralCombo4 && 'judgment-order+event',
      civilGeneralCombo5 && 'registry+judgment+annotations',
      hasCorporateOverlapMarker && 'corporate-overlap-guard',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] civil general record signals matched: ${civilGeneralHits}` +
      (activeRules.length > 0 ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  if (!hasCorporateOverlapMarker && (civilGeneralHits >= 4 || matchesCivilGeneralCombo)) {
    return { documentType: 'civil_record_general', confidence: 'heuristic-high' };
  }
  if (!hasCorporateOverlapMarker && civilGeneralHits >= 2) {
    return { documentType: 'civil_record_general', confidence: 'heuristic-low' };
  }
  if (
    hasCorporateOverlapMarker &&
    (civilGeneralCombo1 || civilGeneralCombo4) &&
    civilGeneralHits >= 4
  ) {
    return { documentType: 'civil_record_general', confidence: 'heuristic-low' };
  }

  // ── Identity / Travel Records ─────────────────────────────────────────────
  // Covers:
  //   - passport biographic pages
  //   - identity cards
  //   - driver licenses
  //   - visa pages
  //   - entry/exit pages
  //   - I-94 style travel summaries
  //   - travel document excerpts

  const identityTravelSignals: RegExp[] = [
    /\bpassport\b/i,
    /\btravel document\b/i,
    /\bidentity card\b/i,
    /\bnational identity\b/i,
    /\bdriver'?s? license\b/i,
    /\bvisa\b/i,
    /\bentry\b/i,
    /\bexit\b/i,
    /\bi-94\b/i,
    /\bclass of admission\b/i,
    /\badmit until(?: date)?\b/i,
    /\bport of entry\b/i,
    /\bdocument number\b/i,
    /\bnationality\b/i,
    /\bplace of birth\b/i,
    /\bdate of birth\b/i,
    /\bdate of issue\b/i,
    /\bdate of expiry\b/i,
    /\bexpiration date\b/i,
    /\bissuing authority\b/i,
    /\bmachine readable zone\b/i,
    /\bmrz\b/i,
    /p<[a-z0-9<]{4,}/i,
    /\b(?:surname|given names)\b/i,
  ];

  const identityTravelHits = identityTravelSignals.filter((rx) => rx.test(text)).length;

  const hasIdentityDocTitle =
    /\bpassport\b/i.test(text) ||
    /\btravel document\b/i.test(text) ||
    /\bidentity card\b/i.test(text) ||
    /\bnational identity\b/i.test(text) ||
    /\bdriver'?s? license\b/i.test(text) ||
    /\bvisa\b/i.test(text) ||
    /\bi-94\b/i.test(text);

  const hasIdentityBiographicCore =
    /\bdocument number\b/i.test(text) &&
    /\bnationality\b/i.test(text) &&
    /\bdate of birth\b/i.test(text) &&
    /\bplace of birth\b/i.test(text);

  const hasTravelAdmissionCore =
    /\bi-94\b/i.test(text) ||
    (/class of admission/i.test(text) && /admit until(?: date)?/i.test(text)) ||
    (/port of entry/i.test(text) && /(entry|arrival|departure|exit)/i.test(text));

  const hasMrzOrCodeRegion =
    /\bmachine readable zone\b/i.test(text) ||
    /\bmrz\b/i.test(text) ||
    /p<[a-z0-9<]{4,}/i.test(text);

  const identityTravelCombo1 = hasIdentityDocTitle && hasIdentityBiographicCore;
  const identityTravelCombo2 = hasIdentityDocTitle && hasTravelAdmissionCore;
  const identityTravelCombo3 = hasIdentityDocTitle && hasMrzOrCodeRegion;
  const identityTravelCombo4 = hasIdentityBiographicCore && hasMrzOrCodeRegion;

  const matchesIdentityTravelCombo =
    identityTravelCombo1 ||
    identityTravelCombo2 ||
    identityTravelCombo3 ||
    identityTravelCombo4;

  if (identityTravelHits > 0 || matchesIdentityTravelCombo) {
    const activeRules = [
      identityTravelCombo1 && 'title+biographic-core',
      identityTravelCombo2 && 'title+admission-core',
      identityTravelCombo3 && 'title+mrz',
      identityTravelCombo4 && 'biographic-core+mrz',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] identity/travel signals matched: ${identityTravelHits}` +
      (matchesIdentityTravelCombo ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  if (identityTravelHits >= 4 || matchesIdentityTravelCombo) {
    return { documentType: 'identity_travel_record', confidence: 'heuristic-high' };
  }
  if (identityTravelHits >= 2) {
    return { documentType: 'identity_travel_record', confidence: 'heuristic-low' };
  }

  // ── Academic Diploma / Degree Certificate ─────────────────────────────────
  // Checked BEFORE academic_transcript and course_certificate_landscape because
  // academic diplomas have the most specific language (conferral, rector, degree).
  //
  // Anti-overlap:
  //   Marriage cert markers (spouse, property regime) → already returned above.
  //   Birth cert markers (child name, date/place of birth) → already returned above.
  //   Guard against transcript overlap: diploma has "confers" + "rector" + "degree of".
  //     Transcripts never have conferral-verb language, so the diploma signals are
  //     cleanly distinct.
  //
  // Two detection paths — combined with OR:
  //   Path 1 (flat count): canonical degree-conferral phrases, ≥3 → high, ≥2 → low.
  //   Path 2 (combination rules): semantic clusters, AND-combined.

  // ── Path 1: flat signal count for academic diplomas ──────────────────────
  const diplomaSignals: RegExp[] = [
    // Degree-conferral language (most distinctive)
    /confers? (?:upon|to|on) .{0,60}(?:degree|diploma)/i,
    /hereby confer[rs]? (?:upon|to|on)/i,
    /confer[rs]? the (?:academic )?degree/i,
    /awarded? the degree of/i,
    // Specific academic degrees
    /\b(?:bachelor(?:'s)?|bacharel) (?:of|in|degree)/i,
    /\bdegree of bachelor/i,
    /\bmaster(?:'s)? (?:of|in|degree)/i,
    /\bdegree of master/i,
    /\bdocto(?:r(?:ate)?|ral) (?:degree|of|in)/i,
    /\bdegree of docto(?:r|ral)/i,
    /\blicentiate (?:degree|of|in)/i,
    /\btechnologist in\b/i,
    /\b(?:undergraduate|graduate|postgraduate) degree\b/i,
    // Institutional officers specific to academic degree granting
    /\brector\b/i,
    /\bvice[-\s]rector\b/i,
    /\bpro[-\s]rector\b/i,
    /\bpró[-\s]reitor\b/i,                // sometimes left untranslated
    // Academic registration/authentication numbers (diploma-specific)
    /diploma (?:number|no\.?|register|book|folio)/i,
    /register(?:ed)? (?:in )?(?:book|diploma|volume)/i,
    /diploma (?:book|register|record)/i,
    // Graduation/degree-conferral context
    /graduation diploma/i,
    /academic diploma/i,
    /graduation (?:ceremony|class|date)/i,
    /having (?:taken|fulfilled|completed) (?:the )?(?:required )?(?:oath|commitment|pledge)/i,
  ];

  const diplomaHits = diplomaSignals.filter(rx => rx.test(text)).length;

  // ── Path 2: combination rules for academic diplomas ───────────────────────
  // Each dimension covers a distinct aspect of the academic conferral context.

  // Dimension A: degree-conferral verb
  const hasDiplomaConferral =
    /confers? (?:upon|to|on)/i.test(text) ||
    /hereby confer[rs]?/i.test(text) ||
    /awarded? the degree/i.test(text);

  // Dimension B: named academic degree (bachelor, master, doctorate, etc.)
  const hasDegreeName =
    /\b(?:bachelor(?:'s)?|bacharel)\b/i.test(text) ||
    /\bmaster(?:'s)?\b/i.test(text) ||
    /\bdoctorate?\b/i.test(text) ||
    /\bdoctor of\b/i.test(text) ||
    /\blicentiate\b/i.test(text) ||
    /\btechnologist in\b/i.test(text) ||
    /\bdegree of\b/i.test(text) ||
    /\bacademic degree\b/i.test(text);

  // Dimension C: academic institutional officer (rector/dean level)
  const hasAcademicOfficer =
    /\brector\b/i.test(text) ||
    /\bvice[-\s]rector\b/i.test(text) ||
    /\bpro[-\s]rector\b/i.test(text) ||
    /\bdean of\b/i.test(text);

  // Dimension D: diploma registration identifier
  const hasDiplomaRegistration =
    /diploma (?:number|no\.?|register|book)/i.test(text) ||
    /register(?:ed)? in book/i.test(text) ||
    /diploma book/i.test(text);

  // Dimension E: the word "diploma" used as main document title
  const hasDiplomaTitle =
    /\bdiploma\b/i.test(text) &&
    !/participation diploma/i.test(text) &&   // anti-overlap: participation diplomas → course cert
    !/training diploma/i.test(text);           // anti-overlap: training diplomas → course cert

  // Rule 1: conferral + degree name → core academic degree-granting language
  const diplomaComboRule1 = hasDiplomaConferral && hasDegreeName;
  // Rule 2: academic officer + degree name → institutional degree document
  const diplomaComboRule2 = hasAcademicOfficer && hasDegreeName;
  // Rule 3: diploma title + registration → official registered diploma
  const diplomaComboRule3 = hasDiplomaTitle && hasDiplomaRegistration;
  // Rule 4: diploma title + conferral → diploma with granting language
  const diplomaComboRule4 = hasDiplomaTitle && hasDiplomaConferral;

  const matchesDiplomaCombo = diplomaComboRule1 || diplomaComboRule2 || diplomaComboRule3 || diplomaComboRule4;

  // ── Logging ─────────────────────────────────────────────────────────────────
  if (diplomaHits > 0 || matchesDiplomaCombo) {
    const activeRules = [
      diplomaComboRule1 && 'conferral+degree',
      diplomaComboRule2 && 'officer+degree',
      diplomaComboRule3 && 'diploma+registration',
      diplomaComboRule4 && 'diploma+conferral',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] academic diploma signals matched: ${diplomaHits}` +
      (matchesDiplomaCombo ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  // ── Decision ─────────────────────────────────────────────────────────────────
  if (diplomaHits >= 3 || matchesDiplomaCombo) {
    return { documentType: 'academic_diploma_certificate', confidence: 'heuristic-high' };
  }
  if (diplomaHits >= 2) {
    return { documentType: 'academic_diploma_certificate', confidence: 'heuristic-low' };
  }

  // ── Academic Transcript / School Record ───────────────────────────────────
  // Checked BEFORE course_certificate_landscape.
  // Transcripts record subjects + grades for a student across an academic career.
  // Key distinguishing features:
  //   - document title: "academic transcript", "school record", "grade report"
  //   - grade data: GPA, approved/failed status, grade values
  //   - student identity: registration/enrollment number
  //   - subject table header: "subjects and grades", "course code ... subject name"
  //
  // Anti-overlap guards:
  //   - Diploma signals (conferral, rector, degree) → already returned above.
  //   - Course cert signals (participated in, this is to certify) → not in transcripts.
  //
  // Two detection paths — combined with OR:
  //   Path 1 (flat count): distinctive transcript phrases, ≥3 → high, ≥2 → low.
  //   Path 2 (combination rules): semantic dimensions, AND-combined.

  // ── Path 1: flat signal count for transcripts ─────────────────────────────
  const transcriptSignals: RegExp[] = [
    /academic transcript/i,
    /transcript of records?/i,
    /school record/i,
    /grade (?:report|record|history)/i,
    /histórico escolar/i,               // sometimes left untranslated
    /student (?:registration|id|number)[:\s]/i,
    /grade point average/i,
    /\bgpa[:\s]/i,
    /weighted (?:average|mean)/i,
    /total (?:course )?workload[:\s]/i, // differs from cert: no "of training"
    /academic (?:record|history|register)/i,
    /enrollment (?:date|period|number)[:\s]/i,
    /subject(?:s)? and grades?/i,       // common column header
    /transcript of academic/i,
    /\bsemester\b.*\b(?:grade|approved|failed)/i,
    /course code.*subject name/i,       // table header pattern
    /academic (?:period|calendar)[:\s]/i,
  ];

  const transcriptHits = transcriptSignals.filter(rx => rx.test(text)).length;

  // ── Path 2: combination rules for transcripts ─────────────────────────────
  // Dimension A: document title explicitly says "transcript" or "record"
  const hasTranscriptTitle =
    /academic transcript/i.test(text) ||
    /transcript of records?/i.test(text) ||
    /school record/i.test(text) ||
    /grade report/i.test(text) ||
    /histórico escolar/i.test(text);

  // Dimension B: grade performance data (approved/failed, GPA, average)
  const hasGradeData =
    /\b(?:approved|failed|exempt|reprovado|aprovado)\b/i.test(text) ||
    /grade point average/i.test(text) ||
    /\bgpa[:\s]/i.test(text) ||
    /weighted (?:average|mean)/i.test(text);

  // Dimension C: student identity info (registration number, enrollment)
  const hasStudentIdentity =
    /student (?:registration|id|number|name)[:\s]/i.test(text) ||
    /enrollment (?:date|period|number)[:\s]/i.test(text) ||
    /registration (?:number|no\.?)[:\s]/i.test(text);

  // Dimension D: subject/grade table header structure
  const hasSubjectTable =
    /subject(?:s)? and grades?/i.test(text) ||
    /course code.*subject/i.test(text) ||
    /\bsubject(?:s)?[:\s].{0,40}(?:grade|credit|hour)/i.test(text);

  // Rule 1: transcript title + grade data → clear transcript
  const transcriptCombo1 = hasTranscriptTitle && hasGradeData;
  // Rule 2: student identity + grade data → student academic record
  const transcriptCombo2 = hasStudentIdentity && hasGradeData;
  // Rule 3: subject table header + grade data → subject-grade table
  const transcriptCombo3 = hasSubjectTable && hasGradeData;

  const matchesTranscriptCombo = transcriptCombo1 || transcriptCombo2 || transcriptCombo3;

  // ── Logging ─────────────────────────────────────────────────────────────────
  if (transcriptHits > 0 || matchesTranscriptCombo) {
    const activeRules = [
      transcriptCombo1 && 'title+grade',
      transcriptCombo2 && 'student-id+grade',
      transcriptCombo3 && 'subject-table+grade',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] academic transcript signals matched: ${transcriptHits}` +
      (matchesTranscriptCombo ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  // ── Decision ─────────────────────────────────────────────────────────────────
  if (transcriptHits >= 3 || matchesTranscriptCombo) {
    return { documentType: 'academic_transcript', confidence: 'heuristic-high' };
  }
  if (transcriptHits >= 2) {
    return { documentType: 'academic_transcript', confidence: 'heuristic-low' };
  }

  // ── General Academic Records ─────────────────────────────────────────────
  // Covers:
  //   - enrollment certificates
  //   - declarations from educational institutions
  //   - course completion statements
  //   - academic letters
  //   - syllabi / ementa excerpts
  //   - academic records with subject/grade tables (non-canonical transcript forms)
  //
  // Checked AFTER academic_transcript to preserve transcript-specialized parsing,
  // and BEFORE non-academic families to avoid downgrading academic declarations.

  const academicGeneralSignals: RegExp[] = [
    /\bcertificate of enrollment\b/i,
    /\benrollment certificate\b/i,
    /\bproof of enrollment\b/i,
    /\bdeclaration of enrollment\b/i,
    /\bacademic declaration\b/i,
    /\bdeclaration from (?:the )?(?:school|university|college|institution)\b/i,
    /\bcourse completion statement\b/i,
    /\bcompletion declaration\b/i,
    /\bregistrar(?:'s)? office\b/i,
    /\bacademic office\b/i,
    /\bacademic affairs\b/i,
    /\bsecretaria acad[êe]mica\b/i,
    /\bsecretaria escolar\b/i,
    /\bsyllabus\b/i,
    /\bcourse outline\b/i,
    /\bementa\b/i,
    /\bcurricular component\b/i,
    /\blearning objectives\b/i,
    /\bevaluation criteria\b/i,
    /\bbibliography\b/i,
    /\bstudent name[:\s]/i,
    /\bstudent id[:\s]/i,
    /\bregistration number[:\s]/i,
    /\benrollment number[:\s]/i,
    /\bprogram[:\s]/i,
    /\bcourse[:\s]/i,
    /\bsemester\b/i,
    /\bterm\b/i,
    /\bacademic year\b/i,
    /\bperiod[:\s]/i,
    /\bregistrar\b/i,
    /\bacademic secretary\b/i,
  ];

  const academicGeneralHits = academicGeneralSignals.filter((rx) => rx.test(text)).length;

  const hasAcademicGeneralTitle =
    /\bcertificate of enrollment\b/i.test(text) ||
    /\benrollment certificate\b/i.test(text) ||
    /\bproof of enrollment\b/i.test(text) ||
    /\bdeclaration of enrollment\b/i.test(text) ||
    /\bacademic declaration\b/i.test(text) ||
    /\bcourse completion statement\b/i.test(text) ||
    /\bcompletion declaration\b/i.test(text) ||
    /\bsyllabus\b/i.test(text) ||
    /\bcourse outline\b/i.test(text) ||
    /\bementa\b/i.test(text);

  const hasStudentProgramIdentity =
    (/\bstudent name[:\s]/i.test(text) || /\bstudent id[:\s]/i.test(text) || /\bregistration number[:\s]/i.test(text)) &&
    (/\bprogram[:\s]/i.test(text) || /\bcourse[:\s]/i.test(text) || /\bdegree\b/i.test(text));

  const hasAcademicIssuanceContext =
    /\bregistrar(?:'s)? office\b/i.test(text) ||
    /\bacademic office\b/i.test(text) ||
    /\bacademic affairs\b/i.test(text) ||
    /\bregistrar\b/i.test(text) ||
    /\bacademic secretary\b/i.test(text) ||
    /\buniversity\b/i.test(text) ||
    /\bcollege\b/i.test(text) ||
    /\bschool\b/i.test(text);

  const hasSyllabusStructure =
    /\bsyllabus\b/i.test(text) ||
    /\bementa\b/i.test(text) ||
    /\bcurricular component\b/i.test(text) ||
    /\blearning objectives\b/i.test(text) ||
    /\bevaluation criteria\b/i.test(text) ||
    /\bbibliography\b/i.test(text);

  const hasPeriodOrTermLayout =
    /\bsemester\b/i.test(text) ||
    /\bterm\b/i.test(text) ||
    /\bacademic year\b/i.test(text) ||
    /\bperiod[:\s]/i.test(text) ||
    /\bstart date[:\s]/i.test(text) ||
    /\bend date[:\s]/i.test(text);

  const academicGeneralCombo1 = hasAcademicGeneralTitle && hasStudentProgramIdentity;
  const academicGeneralCombo2 = hasAcademicIssuanceContext && hasStudentProgramIdentity && hasPeriodOrTermLayout;
  const academicGeneralCombo3 = hasSyllabusStructure && (hasAcademicGeneralTitle || hasAcademicIssuanceContext);

  const matchesAcademicGeneralCombo =
    academicGeneralCombo1 || academicGeneralCombo2 || academicGeneralCombo3;

  if (academicGeneralHits > 0 || matchesAcademicGeneralCombo) {
    const activeRules = [
      academicGeneralCombo1 && 'title+student-program',
      academicGeneralCombo2 && 'issuance+student-program+period',
      academicGeneralCombo3 && 'syllabus-structure+institutional-context',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] academic general record signals matched: ${academicGeneralHits}` +
      (matchesAcademicGeneralCombo ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  if (academicGeneralHits >= 4 || matchesAcademicGeneralCombo) {
    return { documentType: 'academic_record_general', confidence: 'heuristic-high' };
  }
  if (academicGeneralHits >= 2) {
    return { documentType: 'academic_record_general', confidence: 'heuristic-low' };
  }

  // ── Corporate / Business Records ─────────────────────────────────────────
  // Covers:
  //   - articles of incorporation / organization
  //   - operating agreement excerpts
  //   - bylaws excerpts
  //   - annual reports
  //   - certificates of good standing
  //   - business licenses
  //   - corporate resolutions
  //   - business registration docs and official registry extracts
  //
  // Checked BEFORE employment records because both can contain company metadata,
  // but corporate records include stronger legal/registry/filer semantics.

  const corporateSignals: RegExp[] = [
    /articles of (?:incorporation|organization)/i,
    /operating agreement/i,
    /\bbylaws?\b/i,
    /\bannual report\b/i,
    /certificate of good standing/i,
    /business license/i,
    /corporate resolution/i,
    /board resolution/i,
    /\bminutes of (?:meeting|board|member)\b/i,
    /business registration/i,
    /official registry extract/i,
    /commercial registry/i,
    /registry authority/i,
    /secretary of state/i,
    /junta comercial/i,
    /department of state/i,
    /\bentity (?:name|type|status)\b/i,
    /\bregistration (?:number|no\.?)\b/i,
    /\bfiled on\b/i,
    /\bfiling date\b/i,
    /\beffective date\b/i,
    /\bregistered agent\b/i,
    /\bmanager(?:s)?\b/i,
    /\bmember(?:s)?\b/i,
    /\bofficer(?:s)?\b/i,
    /\bshareholder(?:s)?\b/i,
    /\barticle\s+\d+\b/i,
    /\bsection\s+\d+\b/i,
    /\bclause\s+\d+\b/i,
    /\bbe it resolved\b/i,
    /\bresolved that\b/i,
    /\bcnpj\b/i,
  ];

  const corporateHits = corporateSignals.filter((rx) => rx.test(text)).length;

  const hasCorporateDocTitle =
    /articles of (?:incorporation|organization)/i.test(text) ||
    /operating agreement/i.test(text) ||
    /\bbylaws?\b/i.test(text) ||
    /\bannual report\b/i.test(text) ||
    /certificate of good standing/i.test(text) ||
    /business license/i.test(text) ||
    /corporate resolution/i.test(text) ||
    /business registration/i.test(text) ||
    /official registry extract/i.test(text);

  const hasRegistryAuthority =
    /secretary of state/i.test(text) ||
    /commercial registry/i.test(text) ||
    /registry authority/i.test(text) ||
    /department of state/i.test(text) ||
    /junta comercial/i.test(text);

  const hasEntityMetadata =
    /\bentity (?:name|type|status)\b/i.test(text) ||
    /\bregistration (?:number|no\.?)\b/i.test(text) ||
    /\bjurisdiction\b/i.test(text) ||
    /\bregistered (?:office|address|agent)\b/i.test(text) ||
    /\bprincipal (?:office|address)\b/i.test(text) ||
    /\bcnpj\b/i.test(text);

  const hasFilingInfo =
    /\bfiled on\b/i.test(text) ||
    /\bfiling date\b/i.test(text) ||
    /\beffective date\b/i.test(text) ||
    /\bcertificate number\b/i.test(text) ||
    /\bdocument number\b/i.test(text);

  const hasNumberedGovernanceSections =
    /\barticle\s+\d+\b/i.test(text) ||
    /\bsection\s+\d+\b/i.test(text) ||
    /\bclause\s+\d+\b/i.test(text) ||
    /\bbe it resolved\b/i.test(text) ||
    /\bresolved that\b/i.test(text);

  const hasOfficerMemberBlock =
    /\bofficer(?:s)?\b/i.test(text) ||
    /\bmanager(?:s)?\b/i.test(text) ||
    /\bmember(?:s)?\b/i.test(text) ||
    /\bdirector(?:s)?\b/i.test(text) ||
    /\bshareholder(?:s)?\b/i.test(text);

  const corporateCombo1 = hasCorporateDocTitle && hasEntityMetadata;
  const corporateCombo2 = hasRegistryAuthority && hasFilingInfo;
  const corporateCombo3 = hasNumberedGovernanceSections && hasOfficerMemberBlock;
  const corporateCombo4 = hasCorporateDocTitle && hasNumberedGovernanceSections;

  const matchesCorporateCombo =
    corporateCombo1 || corporateCombo2 || corporateCombo3 || corporateCombo4;

  if (corporateHits > 0 || matchesCorporateCombo) {
    const activeRules = [
      corporateCombo1 && 'title+entity-metadata',
      corporateCombo2 && 'registry-authority+filing-info',
      corporateCombo3 && 'numbered-governance+officer-block',
      corporateCombo4 && 'title+numbered-governance',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] corporate/business record signals matched: ${corporateHits}` +
      (matchesCorporateCombo ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  if (corporateHits >= 4 || matchesCorporateCombo) {
    return { documentType: 'corporate_business_record', confidence: 'heuristic-high' };
  }
  if (corporateHits >= 2) {
    return { documentType: 'corporate_business_record', confidence: 'heuristic-low' };
  }

  // ── Publication Acceptance Certificates ──────────────────────────────────
  // Covers journal/publication article acceptance/publication certificates:
  //   - "Declaração de Aceite Artigo" from Brazilian journals
  //   - "We certify that the article [TITLE] was published in [Journal]"
  //   - Single-page centered ceremonial certificates from academic publishers
  //
  // Must be checked BEFORE editorial_news_pages because acceptance certificates
  // contain ISSN, DOI, and volume/issue metadata that would otherwise trigger
  // the editorial_news classifier (heuristic-low match on volume \d+).
  const publicationAcceptanceSignals: RegExp[] = [
    /\bwe certify that the article\b/i,
    /\bwe certify that the work\b/i,
    /\bwe certify that this article\b/i,
    /\bcertify that the article\b/i,
    /\bcertify that the study\b/i,
    /\bcertify that the paper\b/i,
    /\barticle acceptance certificate\b/i,
    /\bpublication acceptance certificate\b/i,
    /\bdeclaracao de aceite\b/i,
    /\bdeclara[çc][aã]o de aceite\b/i,
    /\baceite do artigo\b/i,
    /\bcertificamos que o artigo\b/i,
    /\bcertificamos que a obra\b/i,
    /\bwas published in\b.*\bissn\b/i,
    /\bpublication_acceptance_certificate\b/i,
  ];

  const publicationAcceptanceHits = publicationAcceptanceSignals.filter((rx) => rx.test(text)).length;
  if (publicationAcceptanceHits >= 1) {
    return {
      documentType: 'publication_acceptance_certificate',
      confidence: publicationAcceptanceHits >= 2 ? 'heuristic-high' : 'heuristic-low',
    };
  }

  // ── Editorial / News Pages (Flexible Structured Family) ─────────────────
  // Covers:
  //   - scanned newspaper clippings
  //   - web news articles
  //   - web print views (with menus/cookies/related links)
  //   - editorial metadata / cover / landing pages
  //
  // This family is intentionally flexible and should capture editorial/news-like
  // evidence early so client-facing structured rendering is not blocked by overly
  // strict subtype requirements.
  const editorialNewsSignals: RegExp[] = [
    /\bheadline\b/i,
    /\bsubheadline\b/i,
    /\bbyline\b/i,
    /\barticle body\b/i,
    /\bnewspaper clipping\b/i,
    /\bpress clipping\b/i,
    /\bmedia clipping\b/i,
    /\bjournalist\b/i,
    /\breporter\b/i,
    /\bpublished (?:on|in)\b/i,
    /\bpublication date\b/i,
    /\bsource[:\s]/i,
    /\bweb news\b/i,
    /\bprint view\b/i,
    /\bcookie(?: notice| banner)?\b/i,
    /\brelated (?:stories|content|articles)\b/i,
    /\bsite navigation\b/i,
    /\bfooter links\b/i,
    /\burl(?:\/timestamp| timestamp)?\b/i,
    /\bdoi[:\s]/i,
    /\babstract\b/i,
    /\bvolume\s+\d+/i,
    /\bissue(?:\s+no\.?|\s+number)?\s+\d+/i,
    /\bmetadata block\b/i,
    /\bz_headline\b/i,
    /\bz_subheadline\b/i,
    /\bz_byline\b/i,
    /\bz_location_date\b/i,
    /\bz_article_body\b/i,
    /\bz_metadata_block\b/i,
    /\bz_doi_block\b/i,
    /\bz_abstract_block\b/i,
    /\bz_cookie_notice\b/i,
    /\bz_site_navigation\b/i,
    /\bz_footer_links\b/i,
    /\bz_url_timestamp\b/i,
    /\beditorial_news_pages\b/i,
    /\bprint_news_clipping\b/i,
    /\bweb_news_article\b/i,
    /\bweb_news_printview\b/i,
    /\beditorial_article_cover_or_metadata\b/i,
    /\beditorial_news_generic_structured\b/i,
  ];

  const editorialNewsHits = editorialNewsSignals.filter((rx) => rx.test(text)).length;

  const hasPrintClippingShape =
    /\bnewspaper clipping\b/i.test(text) ||
    /\bpress clipping\b/i.test(text) ||
    /\bmulti-column\b/i.test(text) ||
    /\bheadline\b/i.test(text);
  const hasWebArticleShape =
    /\bweb news\b/i.test(text) ||
    /\bpublished (?:on|in)\b/i.test(text) ||
    /\burl(?:\/timestamp| timestamp)?\b/i.test(text) ||
    /\bsite navigation\b/i.test(text);
  const hasWebPrintViewShape =
    /\bprint view\b/i.test(text) ||
    /\bcookie(?: notice| banner)?\b/i.test(text) ||
    /\brelated (?:stories|content|articles)\b/i.test(text) ||
    /\bfooter links\b/i.test(text);
  const hasEditorialMetadataShape =
    /\bdoi[:\s]/i.test(text) ||
    /\bmetadata block\b/i.test(text) ||
    /\bvolume\s+\d+/i.test(text) ||
    /\bissue(?:\s+no\.?|\s+number)?\s+\d+/i.test(text) ||
    /\babstract\b/i.test(text);
  const hasEditorialZoneBlueprintCore =
    /\bpage_metadata\b/i.test(text) &&
    /\blayout_zones\b/i.test(text) &&
    /\btranslated_content_by_zone\b/i.test(text);

  const editorialNewsCombo =
    hasEditorialZoneBlueprintCore &&
    (
      hasPrintClippingShape ||
      hasWebArticleShape ||
      hasWebPrintViewShape ||
      hasEditorialMetadataShape
    );

  if (editorialNewsHits > 0 || editorialNewsCombo) {
    const activeRules = [
      hasPrintClippingShape && 'print-news-clipping-shape',
      hasWebArticleShape && 'web-news-article-shape',
      hasWebPrintViewShape && 'web-news-printview-shape',
      hasEditorialMetadataShape && 'editorial-metadata-shape',
      hasEditorialZoneBlueprintCore && 'zone-blueprint-core',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] editorial/news signals matched: ${editorialNewsHits}` +
      (activeRules.length > 0 ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  if (editorialNewsHits >= 3 || editorialNewsCombo) {
    return { documentType: 'editorial_news_pages', confidence: 'heuristic-high' };
  }
  if (editorialNewsHits >= 1) {
    return { documentType: 'editorial_news_pages', confidence: 'heuristic-low' };
  }

  // ── Publications / Media Evidence ────────────────────────────────────────
  // Covers:
  //   - book covers
  //   - article covers / first pages / full articles
  //   - magazine pages / newspaper clippings
  //   - publication metadata pages
  //   - interview pages
  //   - conference paper first pages / abstract pages
  //
  // Checked BEFORE recommendation letters because recommendation letters may
  // mention publications, but true publication/media pages include editorial or
  // scholarly structure markers (source metadata, abstract, citations, etc.).

  const publicationSignals: RegExp[] = [
    /\bjournal\b/i,
    /\bmagazine\b/i,
    /\bnewspaper\b/i,
    /\bpress clipping\b/i,
    /\bmedia clipping\b/i,
    /\bnewspaper clipping\b/i,
    /\bconference paper\b/i,
    /\bproceedings\b/i,
    /\bbook cover\b/i,
    /\barticle cover\b/i,
    /\bfirst page\b/i,
    /\bbyline\b/i,
    /\bheadline\b/i,
    /\binterview with\b/i,
    /\bsource[:\s]/i,
    /\bpublication date[:\s]/i,
    /\bissue date[:\s]/i,
    /\bvolume\s+\d+/i,
    /\bissue(?:\s+no\.?|\s+number)?\s+\d+/i,
    /\bdoi[:\s]/i,
    /\bissn[:\s]/i,
    /\bisbn[:\s]/i,
    /\babstract\b/i,
    /\bkeywords?\b/i,
    /\bcitation(?:s)?\b/i,
    /\breferences\b/i,
    /\bfootnote(?:s)?\b/i,
    /\bphoto caption\b/i,
    /\bfigure\s+\d+/i,
  ];

  const publicationHits = publicationSignals.filter((rx) => rx.test(text)).length;

  const hasPublicationContainer =
    /\bjournal\b/i.test(text) ||
    /\bmagazine\b/i.test(text) ||
    /\bnewspaper\b/i.test(text) ||
    /\bpress clipping\b/i.test(text) ||
    /\bmedia clipping\b/i.test(text) ||
    /\bnewspaper clipping\b/i.test(text) ||
    /\bconference paper\b/i.test(text) ||
    /\bproceedings\b/i.test(text) ||
    /\bbook cover\b/i.test(text) ||
    /\barticle cover\b/i.test(text);

  const hasPublicationMetadata =
    /\bsource[:\s]/i.test(text) ||
    /\bpublication date[:\s]/i.test(text) ||
    /\bissue date[:\s]/i.test(text) ||
    /\bvolume\s+\d+/i.test(text) ||
    /\bissue(?:\s+no\.?|\s+number)?\s+\d+/i.test(text) ||
    /\bdoi[:\s]/i.test(text) ||
    /\bissn[:\s]/i.test(text) ||
    /\bisbn[:\s]/i.test(text);

  const hasEditorialStructure =
    /\bheadline\b/i.test(text) ||
    /\bbyline\b/i.test(text) ||
    /\binterview with\b/i.test(text) ||
    /\bphoto caption\b/i.test(text) ||
    /\bfigure\s+\d+/i.test(text);

  const hasScholarlyStructure =
    /\babstract\b/i.test(text) ||
    /\bkeywords?\b/i.test(text) ||
    /\bintroduction\b/i.test(text) ||
    /\bmethods?\b/i.test(text) ||
    /\bresults?\b/i.test(text) ||
    /\bdiscussion\b/i.test(text) ||
    /\bconclusion\b/i.test(text) ||
    /\breferences\b/i.test(text) ||
    /\bcitation(?:s)?\b/i.test(text);

  const hasAuthorAndDate =
    /\bauthor(?:s)?[:\s]/i.test(text) ||
    /\bbyline\b/i.test(text) ||
    /\bpublished (?:on|in)\b/i.test(text) ||
    /\bdate[:\s]/i.test(text);

  const publicationCombo1 = hasPublicationContainer && hasPublicationMetadata;
  const publicationCombo2 = hasPublicationContainer && hasEditorialStructure && hasAuthorAndDate;
  const publicationCombo3 = hasScholarlyStructure && hasPublicationMetadata;
  const publicationCombo4 = hasScholarlyStructure && hasPublicationContainer;

  const matchesPublicationCombo =
    publicationCombo1 || publicationCombo2 || publicationCombo3 || publicationCombo4;

  if (publicationHits > 0 || matchesPublicationCombo) {
    const activeRules = [
      publicationCombo1 && 'container+metadata',
      publicationCombo2 && 'container+editorial+author/date',
      publicationCombo3 && 'scholarly+metadata',
      publicationCombo4 && 'scholarly+container',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] publication/media signals matched: ${publicationHits}` +
      (matchesPublicationCombo ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  if (publicationHits >= 4 || matchesPublicationCombo) {
    return { documentType: 'publication_media_record', confidence: 'heuristic-high' };
  }
  if (publicationHits >= 2) {
    return { documentType: 'publication_media_record', confidence: 'heuristic-low' };
  }

  // ── Letters / Statements (Flexible Structured Family) ───────────────────
  // Covers:
  //   - recommendation/reference/support letters
  //   - institutional declarations (including HR/accountant/academic statements)
  //   - article acceptance letters
  //   - recommendation letter bundled with attached resume/CV pages
  //
  // This family is intentionally flexible and should absorb letter/declaration
  // evidence with variable structure so client-facing rendering is not blocked
  // by low-confidence subtype signals.
  const lettersStatementsSignals: RegExp[] = [
    /\bdeclaration\b/i,
    /\bstatement\b/i,
    /\bdeclara[cç][aã]o\b/i,
    /\bto whom it may concern\b/i,
    /\bi hereby declare\b/i,
    /\bwe hereby declare\b/i,
    /\bwe certify\b/i,
    /\bthis is to certify\b/i,
    /\brecommendation letter\b/i,
    /\breference letter\b/i,
    /\bsupport letter\b/i,
    /\bcarta de refer[eê]ncia\b/i,
    /\bcarta de recomenda[cç][aã]o\b/i,
    /\bhuman resources\b/i,
    /\bhr department\b/i,
    /\bcontador\b/i,
    /\baccountant\b/i,
    /\benrollment declaration\b/i,
    /\bdeclarac[aã]o de matr[ií]cula\b/i,
    /\barticle acceptance\b/i,
    /\baccepted for publication\b/i,
    /\bcurriculum vitae\b/i,
    /\bresume attached\b/i,
    /\bcv attached\b/i,
    /\bsincerely\b/i,
    /\bregards\b/i,
    /\bsignature\b/i,
    /\bletterhead\b/i,
    /\bz_document_title\b/i,
    /\bz_body_text\b/i,
    /\bz_signature_block\b/i,
    /\bz_signer_identity\b/i,
    /\bz_attached_resume_section\b/i,
    /\bletters_and_statements\b/i,
    /\binstitutional_declaration_single_page\b/i,
    /\brecommendation_letter_single_page\b/i,
    /\brecommendation_letter_multi_page\b/i,
    /\bdeclaration_with_letterhead_footer\b/i,
    /\breference_letter_with_attached_resume\b/i,
    /\bletters_and_statements_generic_structured\b/i,
  ];

  const lettersStatementsHits = lettersStatementsSignals.filter((rx) => rx.test(text)).length;

  const hasDeclarationShape =
    /\bdeclaration\b/i.test(text) ||
    /\bstatement\b/i.test(text) ||
    /\bdeclara[cç][aã]o\b/i.test(text) ||
    /\bthis is to certify\b/i.test(text);
  const hasRecommendationShape =
    /\brecommendation letter\b/i.test(text) ||
    /\breference letter\b/i.test(text) ||
    /\bsupport letter\b/i.test(text) ||
    /\bcarta de refer[eê]ncia\b/i.test(text);
  const hasFormalLetterStructure =
    /\bto whom it may concern\b/i.test(text) ||
    /\bsincerely\b/i.test(text) ||
    /\bregards\b/i.test(text) ||
    /\bsignature\b/i.test(text);
  const hasResumeAttachmentShape =
    /\bcurriculum vitae\b/i.test(text) ||
    /\bresume attached\b/i.test(text) ||
    /\bcv attached\b/i.test(text) ||
    /\battached resume\b/i.test(text);
  const hasStructuredZoneBlueprintCore =
    /\bpage_metadata\b/i.test(text) &&
    /\blayout_zones\b/i.test(text) &&
    /\btranslated_content_by_zone\b/i.test(text);
  const hasLettersZoneSignals =
    /\bz_document_title\b/i.test(text) ||
    /\bz_body_text\b/i.test(text) ||
    /\bz_signature_block\b/i.test(text) ||
    /\bz_signer_identity\b/i.test(text) ||
    /\bz_attached_resume_section\b/i.test(text);

  const lettersStatementsCombo =
    (
      (hasDeclarationShape && hasFormalLetterStructure) ||
      (hasRecommendationShape && hasFormalLetterStructure) ||
      (hasRecommendationShape && hasResumeAttachmentShape) ||
      (hasDeclarationShape && /\baccountant|contador|human resources|hr department|enrollment declaration\b/i.test(text))
    ) ||
    (hasStructuredZoneBlueprintCore && hasLettersZoneSignals);

  if (lettersStatementsHits > 0 || lettersStatementsCombo) {
    const activeRules = [
      hasDeclarationShape && 'declaration-shape',
      hasRecommendationShape && 'recommendation-shape',
      hasFormalLetterStructure && 'formal-letter-structure',
      hasResumeAttachmentShape && 'resume-attachment-shape',
      hasStructuredZoneBlueprintCore && 'zone-blueprint-core',
      hasLettersZoneSignals && 'letters-zone-signals',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] letters/statements signals matched: ${lettersStatementsHits}` +
      (activeRules.length > 0 ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  if (lettersStatementsHits >= 3 || lettersStatementsCombo) {
    return { documentType: 'letters_and_statements', confidence: 'heuristic-high' };
  }
  if (lettersStatementsHits >= 1) {
    return { documentType: 'letters_and_statements', confidence: 'heuristic-low' };
  }

  // ── Recommendation / Expert Letters ──────────────────────────────────────
  // Covers:
  //   - recommendation letters
  //   - expert opinion letters
  //   - support letters
  //   - reference letters
  //   - testimonial letters
  //   - institutional endorsement letters
  //
  // Checked BEFORE employment records because recommendation letters can use
  // business-letter language but are narrative endorsements, not HR contracts.

  const recommendationSignals: RegExp[] = [
    /\bletter of recommendation\b/i,
    /\brecommendation letter\b/i,
    /\bexpert opinion letter\b/i,
    /\bsupport letter\b/i,
    /\breference letter\b/i,
    /\btestimonial letter\b/i,
    /\binstitutional endorsement\b/i,
    /\bto whom it may concern\b/i,
    /\bi am writing (?:this )?(?:letter )?to (?:recommend|support|endorse)\b/i,
    /\bi (?:strongly )?(?:fully )?(?:recommend|support|endorse)\b/i,
    /\bwithout reservation\b/i,
    /\bhighest recommendation\b/i,
    /\boutstanding (?:professional|researcher|scholar|candidate)\b/i,
    /\bextraordinary ability\b/i,
    /\bnational (?:or )?international acclaim\b/i,
    /\bbeneficiary\b/i,
    /\bpetitioner\b/i,
    /\beb-1\b/i,
    /\beb1\b/i,
    /\beb-2\b/i,
    /\beb2\b/i,
    /\bniw\b/i,
    /\bo-1\b/i,
    /\bo1\b/i,
    /\buscis\b/i,
    /\bcurriculum vitae\b/i,
    /\bcv attached\b/i,
    /\bresume attached\b/i,
    /\battached (?:bio|biography|curriculum vitae|resume)\b/i,
    /\bprofessor\b/i,
    /\bph\.?d\.?\b/i,
    /\bmd\b/i,
    /\bchair(?:person)? of\b/i,
    /\bdirector of\b/i,
  ];

  const recommendationHits = recommendationSignals.filter((rx) => rx.test(text)).length;

  const hasRecommendationTitle =
    /\bletter of recommendation\b/i.test(text) ||
    /\brecommendation letter\b/i.test(text) ||
    /\bexpert opinion letter\b/i.test(text) ||
    /\bsupport letter\b/i.test(text) ||
    /\breference letter\b/i.test(text) ||
    /\btestimonial letter\b/i.test(text) ||
    /\binstitutional endorsement\b/i.test(text);

  const hasNarrativeEndorsement =
    /\bi am writing (?:this )?(?:letter )?to (?:recommend|support|endorse)\b/i.test(text) ||
    /\bi (?:strongly )?(?:fully )?(?:recommend|support|endorse)\b/i.test(text) ||
    /\bwithout reservation\b/i.test(text) ||
    /\bhighest recommendation\b/i.test(text);

  const hasRecommenderCredentials =
    /\bprofessor\b/i.test(text) ||
    /\bph\.?d\.?\b/i.test(text) ||
    /\bmd\b/i.test(text) ||
    /\bchair(?:person)? of\b/i.test(text) ||
    /\bdirector of\b/i.test(text) ||
    /\bdepartment of\b/i.test(text) ||
    /\binstitution\b/i.test(text) ||
    /\buniversity\b/i.test(text);

  const hasImmigrationEvaluationContext =
    /\bbeneficiary\b/i.test(text) ||
    /\bpetitioner\b/i.test(text) ||
    /\beb-1\b/i.test(text) ||
    /\beb1\b/i.test(text) ||
    /\beb-2\b/i.test(text) ||
    /\beb2\b/i.test(text) ||
    /\bniw\b/i.test(text) ||
    /\bo-1\b/i.test(text) ||
    /\bo1\b/i.test(text) ||
    /\buscis\b/i.test(text) ||
    /\bextraordinary ability\b/i.test(text) ||
    /\bnational (?:or )?international acclaim\b/i.test(text);

  const hasAttachmentBioMention =
    /\bcurriculum vitae\b/i.test(text) ||
    /\bcv attached\b/i.test(text) ||
    /\bresume attached\b/i.test(text) ||
    /\battached (?:bio|biography|curriculum vitae|resume)\b/i.test(text);

  const recommendationCombo1 = hasRecommendationTitle && hasNarrativeEndorsement;
  const recommendationCombo2 = hasNarrativeEndorsement && hasRecommenderCredentials;
  const recommendationCombo3 = hasNarrativeEndorsement && hasImmigrationEvaluationContext;
  const recommendationCombo4 = hasRecommendationTitle && hasAttachmentBioMention;

  const matchesRecommendationCombo =
    recommendationCombo1 ||
    recommendationCombo2 ||
    recommendationCombo3 ||
    recommendationCombo4;

  if (recommendationHits > 0 || matchesRecommendationCombo) {
    const activeRules = [
      recommendationCombo1 && 'title+endorsement',
      recommendationCombo2 && 'endorsement+credentials',
      recommendationCombo3 && 'endorsement+immigration-context',
      recommendationCombo4 && 'title+bio-attachment',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] recommendation letter signals matched: ${recommendationHits}` +
      (matchesRecommendationCombo ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  if (recommendationHits >= 4 || matchesRecommendationCombo) {
    return { documentType: 'recommendation_letter', confidence: 'heuristic-high' };
  }
  if (recommendationHits >= 2) {
    return { documentType: 'recommendation_letter', confidence: 'heuristic-low' };
  }

  // ── Employment Records ────────────────────────────────────────────────────
  // Covers employment verification/experience letters, employer declarations,
  // salary confirmation letters, work certificates, simple employment contracts,
  // and HR attestations.
  //
  // Checked BEFORE course_certificate_landscape because employment documents may
  // also use certificate-like language ("certificate", "attests", "declares"),
  // but contain distinct employment semantics (employee, role, salary, timeline).

  const employmentSignals: RegExp[] = [
    /employment verification/i,
    /verification of employment/i,
    /experience letter/i,
    /employer declaration/i,
    /salary confirmation/i,
    /work certificate/i,
    /hr attestation/i,
    /to whom it may concern/i,
    /employee(?:\s+name|\s+id|\s+number)?[:\s]/i,
    /job title[:\s]/i,
    /position[:\s]/i,
    /currently employed/i,
    /has been employed/i,
    /employment (?:start|end|period|date)/i,
    /start date[:\s]/i,
    /end date[:\s]/i,
    /duties(?: and responsibilities)?/i,
    /responsibilit(?:y|ies)/i,
    /salary[:\s]/i,
    /compensation[:\s]/i,
    /monthly salary/i,
    /annual salary/i,
    /human resources/i,
    /hr department/i,
    /employment contract/i,
  ];

  const employmentHits = employmentSignals.filter(rx => rx.test(text)).length;

  const hasEmploymentTitle =
    /employment verification/i.test(text) ||
    /verification of employment/i.test(text) ||
    /experience letter/i.test(text) ||
    /employer declaration/i.test(text) ||
    /salary confirmation/i.test(text) ||
    /work certificate/i.test(text) ||
    /employment contract/i.test(text) ||
    /hr attestation/i.test(text);

  const hasEmployeeIdentityBlock =
    /employee(?:\s+name|\s+id|\s+number)?[:\s]/i.test(text) ||
    /national id[:\s]/i.test(text) ||
    /\bcpf[:\s]/i.test(text);

  const hasRoleAndTimeline =
    (/job title[:\s]/i.test(text) || /position[:\s]/i.test(text) || /role[:\s]/i.test(text)) &&
    (/employment (?:start|end|period|date)/i.test(text) || /start date[:\s]/i.test(text) || /end date[:\s]/i.test(text) || /since \w+/i.test(text));

  const hasCompensationLanguage =
    /salary[:\s]/i.test(text) ||
    /compensation[:\s]/i.test(text) ||
    /monthly salary/i.test(text) ||
    /annual salary/i.test(text) ||
    /remuneration/i.test(text);

  const hasCorporateIssuerContext =
    /to whom it may concern/i.test(text) ||
    /human resources/i.test(text) ||
    /hr department/i.test(text) ||
    /employer/i.test(text);

  const employmentCombo1 = hasEmploymentTitle && hasRoleAndTimeline;
  const employmentCombo2 = hasEmployeeIdentityBlock && hasRoleAndTimeline;
  const employmentCombo3 = hasCompensationLanguage && hasRoleAndTimeline;
  const employmentCombo4 = hasCorporateIssuerContext && (hasRoleAndTimeline || hasCompensationLanguage);

  const matchesEmploymentCombo =
    employmentCombo1 || employmentCombo2 || employmentCombo3 || employmentCombo4;

  if (employmentHits > 0 || matchesEmploymentCombo) {
    const activeRules = [
      employmentCombo1 && 'title+role/timeline',
      employmentCombo2 && 'identity+role/timeline',
      employmentCombo3 && 'compensation+role/timeline',
      employmentCombo4 && 'issuer-context+employment',
    ].filter(Boolean);
    console.log(
      `[documentClassifier] employment record signals matched: ${employmentHits}` +
      (matchesEmploymentCombo ? ` | combination rule: ${activeRules.join(', ')}` : ''),
    );
  }

  if (employmentHits >= 4 || matchesEmploymentCombo) {
    return { documentType: 'employment_record', confidence: 'heuristic-high' };
  }
  if (employmentHits >= 2) {
    return { documentType: 'employment_record', confidence: 'heuristic-low' };
  }

  // ── Course / Landscape Certificate ──
  // Only reached if NEITHER marriage NOR birth cert NOR civil general record
  // NOR identity/travel NOR academic diploma NOR transcript NOR academic general record NOR
  // corporate/business record NOR publication/media record NOR recommendation
  // letter NOR employment record matched.
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
  //   - Academic diploma: degree conferral + officer → returned above
  //   - Academic transcript: grade records, student ID, GPA → returned above

  // ── Path 1: flat signal count ──────────────────────────────────────────────
  const certLandscapeSignals: RegExp[] = [
    /certificate of (?:completion|participation|training|attendance|achievement)/i,
    /(?:completion|participation|training|attendance) certificate/i,
    /has (?:successfully )?completed (?:the |this )?(?:course|training|program|module|workshop)/i,
    /in recognition of (?:completing|(?:his|her|their) (?:participation|completion|attendance))/i,
    // Extended event types — Brazilian professional certs often say "forum", "congress", "jornada"
    // instead of "course" or "workshop", so the original list was too narrow.
    // The flexible .{0,60} allows for ordinals/numbers ("II FÓRUM", "3rd Congress") between
    // "participated in" and the event keyword.
    /participated in\b.{0,60}?\b(?:course|training|program|workshop|seminar|symposium|event|forum|fórum|conference|congress|congresso|jornada|encontro|lecture|summit)\b/i,
    /\d+\s*hours? of (?:training|course|instruction|study|classes)/i,
    /(?:course|training) (?:workload|duration|load)[:\s]/i,
    /(?:we (?:hereby )?certify|this is to certify) that .{0,120}(?:completed|participated|attended)/i,
    /award(?:ed)? (?:this )?certificate/i,
    /(?:technical|scientific|event|course|training|program) (?:director|coordinator)/i,
    // Participation-role designation — appears in virtually all Brazilian participation certs:
    //   "in the capacity of PARTICIPANT", "as a participant", etc.
    /in the capacity of (?:participant|speaker|attendee|listener|guest|author|organizer|instructor)/i,
    // Duration expression without "of training/course" — common format: "with a duration of 07 hour(s)"
    /(?:with (?:a )?(?:total )?)?duration of \d+\s*hour/i,
    // "participated in [anything], in the capacity of [role]" — strong combined signal
    // 400-char window: accommodates lengthy event titles + date lines between the two phrases.
    /participated\b.{1,400}\bin the capacity of\b/i,
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
  // Extended: Brazilian professional certs use "forum", "congress", "jornada", "encontro"
  // where the narrower original list only had "course/training/program/workshop/seminar/symposium/event".
  // The flexible .{0,60} allows for numerals/ordinals before the event keyword
  // ("II FÓRUM", "3rd Congress", "Annual Symposium") and survives HTML stripping.
  const hasParticipation =
    /participated in\b.{0,60}?\b(?:course|training|program|workshop|seminar|symposium|event|forum|fórum|conference|congress|congresso|jornada|encontro|lecture|summit)\b/i.test(text) ||
    /has (?:successfully )?completed (?:the |this )?(?:course|training|program|module|workshop)/i.test(text) ||
    /in recognition of (?:completing|(?:his|her|their) (?:participation|completion|attendance))/i.test(text);
  // Dimension D: course load / workload / hours
  // Extended: add "duration of N hour" to capture "with a duration of 07 hour(s)" pattern.
  const hasCourseLoad  =
    /(?:course|training) (?:workload|duration|load)[:\s]/i.test(text) ||
    /\d+\s*hours? of (?:training|course|instruction|study|classes)/i.test(text) ||
    /(?:with (?:a )?(?:total )?)?duration of \d+\s*hour/i.test(text);
  // Dimension E: institutional certificate signatory roles
  const hasSignatoryRole =
    /(?:technical|scientific|event|course|training|program) (?:director|coordinator)/i.test(text);
  // Dimension F: participation role designation
  // "in the capacity of PARTICIPANT/SPEAKER/ATTENDEE" is a near-universal marker in
  // Brazilian institutional participation certificates (fóruns, congressos, jornadas).
  const hasCapacityDesignation =
    /in the capacity of (?:participant|speaker|attendee|listener|guest|author|organizer|instructor)/i.test(text) ||
    /participated\b.{1,400}\bin the capacity of\b/i.test(text);

  // Rule 1: certify language + participation → issuing-body attestation of training
  const comboRule1 = hasCertifyLang && hasParticipation;
  // Rule 2: cert title + certify language + course load → structured institutional cert
  const comboRule2 = hasCertTitle && hasCertifyLang && hasCourseLoad;
  // Rule 3: cert title + course load + institutional signatory role
  const comboRule3 = hasCertTitle && hasCourseLoad && hasSignatoryRole;
  // Rule 4: certify language + capacity designation
  // Handles certs where the event is named without standard keywords (e.g. "II FÓRUM DE...")
  // but the role marker "in the capacity of PARTICIPANT" is present.
  const comboRule4 = hasCertifyLang && hasCapacityDesignation;
  // Rule 5: cert title + completion language (no "we certify" needed)
  // Handles online-learning certificates (LinkedIn Learning, Coursera, Udemy) where the
  // issuing platform says "Certificate of Completion" + "has completed the course" but
  // never uses formal "we certify" attestation language.
  const comboRule5 = hasCertTitle && hasParticipation;

  const matchesCombinationRule = comboRule1 || comboRule2 || comboRule3 || comboRule4 || comboRule5;

  // ── Logging ─────────────────────────────────────────────────────────────────
  if (certLandscapeHits > 0 || matchesCombinationRule) {
    const activeRules = [
      comboRule1 && 'certify+participation',
      comboRule2 && 'title+certify+load',
      comboRule3 && 'title+load+role',
      comboRule4 && 'certify+capacity',
      comboRule5 && 'title+completion',
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

  // ── EB1 Evidence Photo Sheets ──────────────────────────────────────────────
  // Covers visually structured USCIS-oriented EB1 evidence pages with:
  // - evidence title
  // - explanatory paragraph
  // - one or more photos
  // - optional highlight arrows
  // - footer identity
  //
  // Typical extraction signatures:
  // PAGE_METADATA / LAYOUT_ZONES / TRANSLATED_CONTENT_BY_ZONE /
  // NON_TEXTUAL_ELEMENTS / RENDERING_HINTS.
  //
  // Important anti-overlap rule:
  // low-confidence EB1 classification must not steal academic/declaration/
  // certificate-like documents when evidence-photo-specific cues are weak.
  const eb1EvidenceSignals: RegExp[] = [
    /\bevidence\s*\d{1,3}\b/i,
    /\bpage_metadata\b/i,
    /\blayout_zones\b/i,
    /\btranslated_content_by_zone\b/i,
    /\bnon_textual_elements\b/i,
    /\brendering_hints\b/i,
    /\bz_evidence_title\b/i,
    /\bz_explanatory_paragraph\b/i,
    /\bz_single_photo\b/i,
    /\bz_photo_gallery\b/i,
    /\bz_top_photo_gallery\b/i,
    /\bz_bottom_center_photo\b/i,
    /\bz_footer_identity\b/i,
    /\bhighlight marker\b/i,
    /\byellow arrow\b/i,
    /\bphoto (?:gallery|block|arrangement)\b/i,
    /\beb-?1\b/i,
  ];

  const eb1EvidenceHits = eb1EvidenceSignals.filter((rx) => rx.test(text)).length;

  const hasEvidenceTitle =
    /\bevidence\s*\d{1,3}\b/i.test(text) ||
    /\bz_evidence_title\b/i.test(text);
  const hasZoneBlueprintCore =
    /\bpage_metadata\b/i.test(text) &&
    /\blayout_zones\b/i.test(text) &&
    /\btranslated_content_by_zone\b/i.test(text);
  const hasPhotoZoneSignals =
    /\bz_single_photo\b/i.test(text) ||
    /\bz_photo_gallery\b/i.test(text) ||
    /\bz_top_photo_gallery\b/i.test(text) ||
    /\bphoto (?:gallery|block|arrangement)\b/i.test(text);
  const hasHighlightSignals =
    /\bhighlight marker\b/i.test(text) ||
    /\byellow arrow\b/i.test(text);
  const hasEb1ContextMarker = /\beb-?1\b/i.test(text);

  const eb1EvidenceCombo = hasEvidenceTitle && hasZoneBlueprintCore && hasPhotoZoneSignals;
  const eb1SpecificHits = [
    hasEvidenceTitle,
    hasPhotoZoneSignals,
    hasHighlightSignals,
    hasEb1ContextMarker,
  ].filter(Boolean).length;

  // Strong negatives for low-confidence EB1 routing.
  const hasAcademicOrDocumentaryNegative =
    /\bdiploma\b/i.test(text) ||
    /\bdegree certificate\b/i.test(text) ||
    /\bacademic transcript\b/i.test(text) ||
    /\bschool record\b/i.test(text) ||
    /\bacademic record\b/i.test(text) ||
    /\bcertificate of enrollment\b/i.test(text) ||
    /\benrollment certificate\b/i.test(text) ||
    /\bproof of enrollment\b/i.test(text) ||
    /\bdeclaration of enrollment\b/i.test(text) ||
    /\benrollment declaration\b/i.test(text) ||
    /\bacademic declaration\b/i.test(text) ||
    /\bacademic (?:office|affairs|year|secretary)\b/i.test(text) ||
    /\bregistrar(?:'s)? office\b/i.test(text);

  const hasDeclarationOrLetterNegative =
    /\bdeclaration\b/i.test(text) ||
    /\bstatement\b/i.test(text) ||
    /\brecommendation letter\b/i.test(text) ||
    /\breference letter\b/i.test(text) ||
    /\bsupport letter\b/i.test(text) ||
    /\barticle acceptance\b/i.test(text) ||
    /\baccepted for publication\b/i.test(text) ||
    /\bto whom it may concern\b/i.test(text);

  const hasCertificateNegative =
    /\bcertificate\b/i.test(text) ||
    /\bcertification\b/i.test(text) ||
    /\bcourse completion statement\b/i.test(text) ||
    /\bcompletion declaration\b/i.test(text) ||
    /\bcertificate of (?:completion|participation|training|attendance|achievement)\b/i.test(text);

  const hasEb1NegativeContext =
    hasAcademicOrDocumentaryNegative ||
    hasDeclarationOrLetterNegative ||
    hasCertificateNegative;

  const eb1LowConfidenceCandidate = eb1EvidenceHits >= 2 && !eb1EvidenceCombo;
  const eb1SpecificSignalsWeak = eb1SpecificHits < 2;
  const shouldBlockEb1LowConfidence =
    eb1LowConfidenceCandidate &&
    hasEb1NegativeContext &&
    eb1SpecificSignalsWeak;

  if (eb1EvidenceHits > 0 || eb1EvidenceCombo) {
    console.log(
      `[documentClassifier] eb1 evidence-photo signals matched: ${eb1EvidenceHits}` +
      (eb1EvidenceCombo ? ' | combination rule: title+zone-blueprint+photo-zones' : '') +
      (eb1SpecificHits > 0 ? ` | specific-signals: ${eb1SpecificHits}` : ''),
    );
  }

  if (eb1EvidenceCombo || (eb1EvidenceHits >= 4 && eb1SpecificHits >= 2)) {
    return { documentType: 'eb1_evidence_photo_sheet', confidence: 'heuristic-high' };
  }

  if (shouldBlockEb1LowConfidence) {
    console.log(
      '[documentClassifier] eb1 evidence-photo low-confidence candidate blocked by academic/declaration/certificate negatives',
    );

    if (hasAcademicOrDocumentaryNegative) {
      return { documentType: 'academic_record_general', confidence: 'heuristic-low' };
    }
    if (hasDeclarationOrLetterNegative) {
      return { documentType: 'letters_and_statements', confidence: 'heuristic-low' };
    }
    if (hasCertificateNegative) {
      return { documentType: 'course_certificate_landscape', confidence: 'heuristic-low' };
    }
  }

  if (eb1EvidenceHits >= 2 && eb1SpecificHits >= 2) {
    return { documentType: 'eb1_evidence_photo_sheet', confidence: 'heuristic-low' };
  }

  return { documentType: 'unknown', confidence: 'heuristic-low' };
}

// ── Signal: filename / storage URL ───────────────────────────────────────────

function classifyFromUrl(fileUrl: string): ClassificationResult {
  if (/casamento|marriage(?:[-_\s]+cert(?:ificate)?)?/i.test(fileUrl)) {
    return { documentType: 'marriage_certificate_brazil', confidence: 'heuristic-low' };
  }
  if (/nascimento|birth(?:[-_\s]+cert(?:ificate)?)?/i.test(fileUrl)) {
    return { documentType: 'birth_certificate_brazil', confidence: 'heuristic-low' };
  }
  if (/divorce|div[oó]rcio|death[-_ ]cert|certid[aã]o[-_ ]de[-_ ][oó]bito|obito|adoption|ado[cç][aã]o|name[-_ ]change|mudan[cç]a[-_ ]de[-_ ]nome|civil[-_ ]registry[-_ ]extract|registro[-_ ]civil|averba[cç][aã]o|marginal[-_ ]note|civil[-_ ]court[-_ ]order|judgment[-_ ]of[-_ ]divorce|decree[-_ ]of[-_ ]divorce/i.test(fileUrl)) {
    return { documentType: 'civil_record_general', confidence: 'heuristic-low' };
  }
  if (/passport|passaporte|identity[-_ ]card|id[-_ ]card|national[-_ ]id|rg\b|driver'?s?[-_ ]license|cnh\b|visa|i[-_ ]94|entry[-_ ]exit|travel[-_ ]document|mrz/i.test(fileUrl)) {
    return { documentType: 'identity_travel_record', confidence: 'heuristic-low' };
  }
  if (/diploma|formatura|gradua[çc][aã]o|degree[-_]cert/i.test(fileUrl)) {
    return { documentType: 'academic_diploma_certificate', confidence: 'heuristic-low' };
  }
  if (/hist[oó]rico[-_]escolar|transcript|boletim|school[-_]record|grade[-_]report/i.test(fileUrl)) {
    return { documentType: 'academic_transcript', confidence: 'heuristic-low' };
  }
  if (/enrollment[-_ ]cert|certificate[-_ ]of[-_ ]enrollment|proof[-_ ]of[-_ ]enrollment|declaracao[-_ ]escolar|declara[cç][aã]o[-_ ]acad[eê]mica|academic[-_ ]declaration|course[-_ ]completion[-_ ]statement|syllabus|ementa|course[-_ ]outline|curricular[-_ ]component/i.test(fileUrl)) {
    return { documentType: 'academic_record_general', confidence: 'heuristic-low' };
  }
  if (/articles[-_ ]of[-_ ](?:incorporation|organization)|operating[-_ ]agreement|bylaws?|annual[-_ ]report|good[-_ ]standing|business[-_ ]license|corporate[-_ ]resolution|business[-_ ]registration|registry[-_ ]extract|junta[-_ ]comercial|cnpj/i.test(fileUrl)) {
    return { documentType: 'corporate_business_record', confidence: 'heuristic-low' };
  }
  if (/declarac[aã]o[-_ ]de[-_ ]aceite|aceite[-_ ](?:de[-_ ])?artigo|article[-_ ]acceptance|acceptance[-_ ]certificate|carta[-_ ]aceite|publicacao[-_ ]aceite/i.test(fileUrl)) {
    return { documentType: 'publication_acceptance_certificate', confidence: 'heuristic-low' };
  }
  if (/not[ií]cia|materia|mat[eé]ria|reportagem|jornal|newspaper|clipping|press[-_ ]coverage|media[-_ ]coverage|web[-_ ]news|news[-_ ]article|print[-_ ]view|cookie|related[-_ ]stories|headline|byline|editorial|op[-_ ]ed|doi|volume[-_ ]?\d+|issue[-_ ]?\d+|publication[-_ ]metadata|revista[-_ ]de[-_ ]estudos/i.test(fileUrl)) {
    return { documentType: 'editorial_news_pages', confidence: 'heuristic-low' };
  }
  if (/book[-_ ]cover|article[-_ ]cover|journal|magazine|newspaper|clipping|media[-_ ]coverage|press[-_ ]coverage|interview|conference[-_ ]paper|abstract|proceedings|doi|issn|isbn|publication[-_ ]metadata/i.test(fileUrl)) {
    return { documentType: 'publication_media_record', confidence: 'heuristic-low' };
  }
  if (/declarac[aã]o|declaration|statement|carta[-_ ]de[-_ ]refer[eê]ncia|recommendation[-_ ]letter|reference[-_ ]letter|support[-_ ]letter|letter[-_ ]of[-_ ]reference|hr[-_ ]declaration|human[-_ ]resources|contador|accountant[-_ ]declaration|matr[ií]cula|enrollment[-_ ]declaration|resume|curriculum[-_ ]vitae|cv[-_ ]attached/i.test(fileUrl)) {
    return { documentType: 'letters_and_statements', confidence: 'heuristic-low' };
  }
  if (/recommendation[-_ ]letter|expert[-_ ]opinion|support[-_ ]letter|reference[-_ ]letter|testimonial[-_ ]letter|endorsement[-_ ]letter|carta[-_ ]recomend|carta[-_ ]apoio|opinion[-_ ]letter|o[-_ ]1|eb[-_ ]1|eb[-_ ]2|niw/i.test(fileUrl)) {
    return { documentType: 'recommendation_letter', confidence: 'heuristic-low' };
  }
  if (/employment|experience[-_ ]letter|employer[-_ ]declaration|salary[-_ ]confirm|work[-_ ]cert|hr[-_ ]attestation|employment[-_ ]contract|contrato[-_ ]trabalho/i.test(fileUrl)) {
    return { documentType: 'employment_record', confidence: 'heuristic-low' };
  }
  // Landscape/participation certificates — common filename patterns from Brazilian institutions
  // and online learning platforms (LinkedIn Learning, Coursera, Udemy, etc.).
  // E.g. "EINSTEIN - CIRURGIA BARIATRICA.pdf", "CRN - NUTRICIONISTAS.pdf", "CERTIFICATE.pdf",
  //      "CertificateOfCompletion_LinkedIn Learning.pdf"
  // These are lower-confidence hints only; translated text is always preferred.
  if (/certif[io]cat[eo]|certifica[cç][aã]o|participac[aã]o|conclus[aã]o[-_ ]curso|linkedin[-_ ]?learning|coursera|udemy/i.test(fileUrl)) {
    return { documentType: 'course_certificate_landscape', confidence: 'heuristic-low' };
  }
  if (/eb[-_ ]?1|evidence[-_ ]?\d+|evid[eê]ncia[-_ ]?\d+|imagens?[-_ ]do[-_ ]recebimento|photo[-_ ]sheet|photo[-_ ]evidence|trof[eé]u|medalha|honraria|colar[-_ ]evocativo/i.test(fileUrl)) {
    return { documentType: 'eb1_evidence_photo_sheet', confidence: 'heuristic-low' };
  }
  return { documentType: 'unknown', confidence: 'heuristic-low' };
}
