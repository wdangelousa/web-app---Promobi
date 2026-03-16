/**
 * types/certificateLandscape.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for a structured landscape certificate translation.
 *
 * Covers: course certificates, training certificates, participation certificates,
 * completion certificates, and similar institutional certificates typically
 * issued in landscape orientation.
 *
 * Design goals:
 *   - Honest handwritten content: never hallucinate; use legibility markers
 *   - Flexible: works for printed, handwritten-name, and mixed certificates
 *   - Orientation-aware: orientation + page_count are populated by the pipeline,
 *     NOT by Claude extraction — Claude always sets these to 'unknown' / null
 *   - Not a catch-all for unknown documents — targeted to certificate-class docs
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Reuse VisualElement from marriageCertificate.ts for consistency.
import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

// ── Sub-schemas ───────────────────────────────────────────────────────────────

/**
 * A named signatory block.
 * Physical signature marks go in visual_elements, not here.
 */
export interface SignatoryEntry {
  /** Name of the signatory as it appears on the document. */
  name: string;
  /** Role or title, e.g. "Director", "Instructor", "Coordinator". */
  role: string;
  /**
   * Institution name if different from the issuing institution.
   * Omit when it is the same as issuing_institution.
   */
  institution?: string;
}

/**
 * A field that was filled in by hand on the original document.
 * Legibility must be reported honestly — never invent unreadable text.
 */
export interface HandwrittenField {
  /** Which field this is, e.g. "recipient_name", "date", "hours", "free_text". */
  field: string;
  /**
   * Transcribed text if legible.
   * Use "illegible" or "partially legible" when the handwriting cannot be read.
   * Never guess or invent content for illegible entries.
   */
  value: string;
  /** Legibility assessment. */
  legibility: 'legible' | 'partially legible' | 'illegible';
}

// ── Root schema ───────────────────────────────────────────────────────────────

export interface CourseCertificateLandscape {
  /** Always "course_certificate_landscape". Used for type-narrowing. */
  document_type: 'course_certificate_landscape';

  // ── Core identity ─────────────────────────────────────────────────────────

  /**
   * Main title as printed on the certificate.
   * e.g. "CERTIFICATE OF COMPLETION", "CERTIFICATE OF PARTICIPATION".
   */
  certificate_title: string;

  /**
   * Full name of the issuing organization.
   * e.g. "Hospital São Luiz", "Universidade Federal do Rio de Janeiro".
   */
  issuing_institution: string;

  /**
   * Subheading or department under the main institution, if present.
   * e.g. "Training and Development Division". Empty string if absent.
   */
  institution_subheading: string;

  // ── Recipient ─────────────────────────────────────────────────────────────

  /**
   * Name of the certificate recipient.
   * If handwritten and legible: transcribe exactly.
   * If handwritten and unreadable: use "illegible" or "partially legible".
   * Never guess or invent a name.
   */
  recipient_name: string;

  /**
   * How the recipient name appears on the original document.
   *   'printed'     → fully typeset / printed
   *   'handwritten' → filled in by hand
   *   'mixed'       → part printed, part handwritten
   *   'unknown'     → cannot be determined from the document
   */
  recipient_name_source: 'printed' | 'handwritten' | 'mixed' | 'unknown';

  // ── Certificate body ──────────────────────────────────────────────────────

  /**
   * Name of the course, training, program, workshop, or event.
   * Empty string if absent.
   */
  course_or_program_name: string;

  /**
   * The core award/recognition sentence, translated to English.
   * e.g. "This certificate is awarded to [name] in recognition of completing the
   *       Emergency First Aid course with 40 hours of training."
   */
  completion_statement: string;

  /**
   * Course duration or workload, e.g. "40 hours", "3 days", "8h".
   * Empty string if not stated on the certificate.
   */
  workload_or_hours: string;

  // ── Date / location ───────────────────────────────────────────────────────

  /**
   * Issue date as it appears on the document.
   * Convert to American format ("Month DD, YYYY") when possible.
   * If handwritten and illegible, use "illegible".
   */
  issue_date: string;

  /**
   * City and/or state of issue. e.g. "São Paulo, SP". Empty string if absent.
   */
  location: string;

  // ── Signatories ───────────────────────────────────────────────────────────

  /**
   * Named signatories with roles.
   * List only those whose name and/or role appears in text on the certificate.
   * Physical signature marks go in visual_elements.
   * Empty array if no named signatories are identifiable.
   */
  signatories: SignatoryEntry[];

  // ── Handwritten fields ────────────────────────────────────────────────────

  /**
   * Fields on the certificate that were filled in by hand, beyond recipient_name.
   * Common examples: handwritten dates, hours, course names, free-text additions.
   * Use empty array if no additional handwritten fields are present.
   * Legibility must be honest: never invent illegible content.
   */
  handwritten_fields: HandwrittenField[];

  // ── Documentary marks ─────────────────────────────────────────────────────

  /**
   * Visual/physical marks detected on the certificate: seals, stamps, logos,
   * watermarks, QR codes, signatures, etc.
   * Reuses VisualElement from marriageCertificate.ts for consistency.
   * Empty array or absent if no relevant marks are detected.
   */
  visual_elements?: VisualElement[];

  // ── Layout metadata (populated by pipeline, NOT by Claude) ───────────────

  /**
   * Orientation of the original document.
   * Set by the pipeline from PDF page dimensions — not extracted by Claude.
   * Claude always outputs "unknown" for this field; the pipeline overwrites it.
   */
  orientation: 'portrait' | 'landscape' | 'unknown';

  /**
   * Page count of the original document.
   * Set by the pipeline from PDF metadata — not extracted by Claude.
   * Claude always outputs null for this field; the pipeline overwrites it.
   */
  page_count: number | null;
}
