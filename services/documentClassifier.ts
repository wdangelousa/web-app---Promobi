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
 *   - marriage_certificate_brazil    (certidão de casamento)
 *   - birth_certificate_brazil       (certidão de nascimento)
 *   - academic_diploma_certificate   (diplomas, degree certificates from universities)
 *   - academic_transcript            (grade records, school histories, histórico escolar)
 *   - course_certificate_landscape   (course/training/participation/completion certificates)
 *   - unknown                        (anything else, or insufficient signals)
 *
 * Classification order matters — more-specific families are checked first:
 *   marriage → birth → academic_diploma → academic_transcript → course_certificate → unknown
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
  | 'academic_diploma_certificate'   // University diplomas, degree certificates
  | 'academic_transcript'            // Grade transcripts, school records, histórico escolar
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

  // ── Course / Landscape Certificate ──
  // Only reached if NEITHER marriage NOR birth cert NOR academic diploma NOR transcript matched.
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

  const matchesCombinationRule = comboRule1 || comboRule2 || comboRule3 || comboRule4;

  // ── Logging ─────────────────────────────────────────────────────────────────
  if (certLandscapeHits > 0 || matchesCombinationRule) {
    const activeRules = [
      comboRule1 && 'certify+participation',
      comboRule2 && 'title+certify+load',
      comboRule3 && 'title+load+role',
      comboRule4 && 'certify+capacity',
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
  if (/diploma|formatura|gradua[çc][aã]o|degree[-_]cert/i.test(fileUrl)) {
    return { documentType: 'academic_diploma_certificate', confidence: 'heuristic-low' };
  }
  if (/hist[oó]rico[-_]escolar|transcript|boletim|school[-_]record|grade[-_]report/i.test(fileUrl)) {
    return { documentType: 'academic_transcript', confidence: 'heuristic-low' };
  }
  // Landscape/participation certificates — common filename patterns from Brazilian institutions
  // E.g. "EINSTEIN - CIRURGIA BARIATRICA.pdf", "CRN - NUTRICIONISTAS.pdf", "CERTIFICATE.pdf"
  // These are lower-confidence hints only; translated text is always preferred.
  if (/certif[io]cat[eo]|certifica[cç][aã]o|participac[aã]o|conclus[aã]o[-_ ]curso/i.test(fileUrl)) {
    return { documentType: 'course_certificate_landscape', confidence: 'heuristic-low' };
  }
  return { documentType: 'unknown', confidence: 'heuristic-low' };
}
