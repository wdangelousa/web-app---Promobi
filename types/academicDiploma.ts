/**
 * types/academicDiploma.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for a structured academic diploma / academic certificate
 * translation.
 *
 * Covers: university diplomas, academic degree certificates, graduation
 * diplomas, bachelor/master/doctorate certificates, educational completion
 * certificates issued by academic institutions (universities, colleges,
 * technical institutes, professional schools).
 *
 * Design goals:
 *   - Covers single-page portrait diplomas through multi-page landscape
 *     academic records with supplement pages.
 *   - orientation + page_count populated by pipeline, NOT by Claude.
 *   - Never hallucinate — absent fields use empty string "".
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Reuse VisualElement from marriageCertificate.ts for consistency.
import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

// ── Sub-schemas ───────────────────────────────────────────────────────────────

/**
 * An official registration, reference, or authentication number on the diploma.
 * Typical examples: Diploma Number, Book, Page, Folio, MEC Registry Code.
 */
export interface RegistrationNumber {
  /** Label as it appears on the document (translated). e.g. "Diploma Number", "Book", "Page". */
  label: string;
  /** The actual number or code value. */
  value: string;
}

/**
 * A named signatory block.
 * Physical signature marks go in visual_elements, not here.
 */
export interface AcademicSignatory {
  /** Full name of the signatory as it appears on the document. */
  name: string;
  /** Role or title, e.g. "Rector", "Dean", "Vice-Rector", "Secretary-General". */
  role: string;
  /**
   * Institution name if different from the issuing institution.
   * Omit when it is the same as issuing_institution.
   */
  institution?: string;
}

// ── Root schema ───────────────────────────────────────────────────────────────

export interface AcademicDiplomaCertificate {
  /** Always "academic_diploma_certificate". Used for type-narrowing. */
  document_type: 'academic_diploma_certificate';

  // ── Document identity ──────────────────────────────────────────────────────

  /**
   * Main document title as it appears on the diploma, e.g. "DIPLOMA",
   * "ACADEMIC DIPLOMA", "GRADUATION DIPLOMA", "DEGREE CERTIFICATE".
   * Empty string if not present as a standalone title.
   */
  diploma_title: string;

  /**
   * Secondary class or descriptor label, e.g. "BACHELOR'S DEGREE DIPLOMA",
   * "MASTER'S DEGREE DIPLOMA IN FULL RIGHTS", "CERTIFICATE OF DEGREE".
   * Empty string if absent.
   */
  document_label: string;

  // ── Issuing institution ────────────────────────────────────────────────────

  /** Full official name of the issuing university, college, or academic institution. */
  issuing_institution: string;

  /**
   * Faculty, college, school, department, or administrative subheading.
   * e.g. "Faculty of Engineering", "College of Health Sciences".
   * Empty string if absent.
   */
  institution_subheading: string;

  // ── Recipient / degree ─────────────────────────────────────────────────────

  /** Full name of the degree recipient exactly as it appears on the document. */
  recipient_name: string;

  /**
   * Full degree title, translated to English.
   * e.g. "Bachelor in Computer Engineering", "Master of Business Administration",
   * "Doctorate in Medical Sciences", "Technologist in Information Systems".
   */
  degree_title: string;

  /**
   * Name of the program, course, or area of study, if stated separately from
   * degree_title. e.g. "Computer Engineering", "Nursing".
   * Empty string if the program is already fully described in degree_title.
   */
  program_or_course: string;

  // ── Conferral statement ────────────────────────────────────────────────────

  /**
   * Full translated conferral/issuance statement — the core juridical text.
   * e.g. "The Rector of [University], in the use of his legal attributions,
   * confers upon [Name] the degree of Bachelor in Computer Engineering,
   * having taken the oath required by law..."
   * Include oath-taking clause and legal statute references if present.
   */
  conferral_statement: string;

  /**
   * Date the degree was conferred (graduation date), in American format.
   * e.g. "December 10, 2022". Empty string if absent.
   */
  conferral_date: string;

  /**
   * Date the diploma document was issued, if different from conferral_date.
   * In American format. Empty string if absent or same as conferral_date.
   */
  issue_date: string;

  /** City and/or state of issue, e.g. "São Paulo, SP". Empty string if absent. */
  location: string;

  // ── Authentication / registration ──────────────────────────────────────────

  /**
   * Official registration numbers, book/page references, and authentication
   * identifiers. e.g.:
   *   [{label: "Diploma Number", value: "12345"},
   *    {label: "Book", value: "10"},
   *    {label: "Page", value: "45"}]
   * Empty array if no registration numbers are present.
   */
  registration_numbers: RegistrationNumber[];

  /**
   * Additional authentication or validation notices, e.g. QR code verification
   * URL, MEC/INEP registry notice. Empty string if absent.
   */
  authentication_notes: string;

  // ── Signatories ────────────────────────────────────────────────────────────

  /**
   * Named signatories whose name and/or role appears on the document.
   * Typically: Rector, Vice-Rector, Pro-Rector for Undergraduate Studies,
   * Secretary-General, Dean.
   * Physical signature marks go in visual_elements, not here.
   * Empty array if no named signatories are identifiable.
   */
  signatories: AcademicSignatory[];

  // ── Multi-page / supplementary ─────────────────────────────────────────────

  /**
   * Page labels or continuation markers as they appear on the document.
   * e.g. ["Page 1 of 2", "Academic Record Supplement", "Verso"].
   * Empty array if no explicit page markers are present.
   */
  page_markers: string[];

  /**
   * Full translated text of any supplementary page, verso, or addendum.
   * Includes academic record details, course lists, or additional certification
   * text found on a second page.
   * Empty string if absent.
   */
  supplementary_notes: string;

  // ── Documentary marks ──────────────────────────────────────────────────────

  /**
   * Visual/physical marks detected: institutional seals, stamps, signatures,
   * QR codes, watermarks, official logos, etc.
   * Reuses VisualElement from marriageCertificate.ts for consistency.
   * Empty array or absent if no relevant marks are detected.
   */
  visual_elements?: VisualElement[];

  // ── Layout metadata (populated by pipeline, NOT by Claude) ────────────────

  /**
   * Orientation of the original document.
   * Set by the pipeline from PDF page dimensions — Claude always outputs "unknown".
   */
  orientation: 'portrait' | 'landscape' | 'unknown';

  /**
   * Page count of the original document.
   * Set by the pipeline from PDF metadata — Claude always outputs null.
   */
  page_count: number | null;
}
