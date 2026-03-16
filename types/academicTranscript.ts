/**
 * types/academicTranscript.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for a structured academic transcript.
 *
 * Covers: grade transcripts, school records, academic histories,
 * histórico escolar, boletim acadêmico, registro acadêmico, and similar
 * multi-subject academic record documents.
 *
 * These differ from:
 *   - academic_diploma_certificate: confers a degree (conferral language, rector)
 *   - course_certificate_landscape: certifies attendance at a training event
 *
 * Design goals:
 *   - Subjects always rendered as a table (the core document structure)
 *   - orientation + page_count populated by pipeline, NOT by Claude
 *   - Never hallucinate — absent fields use empty string / null / []
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Reuse VisualElement from marriageCertificate.ts for consistency.
import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

// ── Sub-schemas ───────────────────────────────────────────────────────────────

/**
 * A single subject/course entry from the transcript.
 * All fields except name are optional (use empty string when absent).
 */
export interface SubjectEntry {
  /** Subject code or ID, e.g. "CSC-101". Empty string if absent. */
  code: string;
  /** Full subject name, e.g. "Introduction to Computer Science". Required. */
  name: string;
  /** Course load / credit hours, e.g. "60h", "4 credits". Empty string if absent. */
  hours: string;
  /** Grade received, e.g. "8.5", "A", "Pass", "10.0". Empty string if absent. */
  grade: string;
  /** Pass/fail status: "Approved", "Failed", "Exempt", "Incomplete", "Withdrawn". Empty string if absent. */
  status: string;
  /** Academic period (semester/term/year), e.g. "2021.1", "Spring 2021". Empty string if absent. */
  period: string;
}

/**
 * Summary statistics for the academic record.
 * All fields use empty string when absent.
 */
export interface TranscriptSummary {
  /** Total workload or credit hours, e.g. "3,200 hours" or "240 credits". */
  total_hours: string;
  /** Overall GPA or weighted average, e.g. "8.5 / 10.0" or "3.8 / 4.0". */
  overall_gpa: string;
  /** Graduation or enrollment status: "Graduated", "Enrolled", "Transferred". */
  graduation_status: string;
  /** Graduation date in American format, e.g. "December 2022". */
  graduation_date: string;
  /** Date of enrollment or entry, e.g. "February 2019". */
  entry_date: string;
}

/**
 * A named signatory on the transcript.
 */
export interface TranscriptSignatory {
  /** Full name of the signatory. Empty string if absent. */
  name: string;
  /** Role or title, e.g. "Academic Secretary", "School Principal", "Registrar". */
  role: string;
}

// ── Root schema ───────────────────────────────────────────────────────────────

export interface AcademicTranscript {
  /** Always "academic_transcript". Used for type-narrowing. */
  document_type: 'academic_transcript';

  // ── Document identity ──────────────────────────────────────────────────────

  /**
   * Main document title, e.g. "ACADEMIC TRANSCRIPT", "SCHOOL RECORD",
   * "GRADE REPORT", "ACADEMIC HISTORY".
   */
  document_title: string;

  /** Full official name of the issuing institution. */
  issuing_institution: string;

  /**
   * Faculty, school, department, or administrative subheading.
   * Empty string if absent.
   */
  institution_subheading: string;

  // ── Student identity ───────────────────────────────────────────────────────

  /** Full name of the student as it appears on the document. */
  student_name: string;

  /** Student registration or enrollment number. Empty string if absent. */
  student_id: string;

  /** Student CPF or national ID number. Empty string if absent. */
  student_cpf: string;

  // ── Program / degree ───────────────────────────────────────────────────────

  /**
   * Name of the program or course, e.g. "Computer Engineering", "Nursing",
   * "Secondary Education — Mathematics". Empty string if absent.
   */
  program_course: string;

  /**
   * Degree level: "Bachelor's", "Master's", "Doctorate",
   * "High School", "Technical". Empty string if absent.
   */
  degree_level: string;

  /**
   * Academic period covered by this transcript, e.g. "2018–2022",
   * "2021.2–2023.1". Empty string if absent.
   */
  academic_period: string;

  // ── Subject / grade table ──────────────────────────────────────────────────

  /**
   * All subject entries extracted from the transcript.
   * This is the core data of the document — extract every row.
   * Empty array if no subject rows are found.
   */
  subjects: SubjectEntry[];

  // ── Summary ────────────────────────────────────────────────────────────────

  /**
   * Summary statistics block: total hours, GPA, graduation status, dates.
   * Use null if no summary block is present.
   */
  summary: TranscriptSummary | null;

  // ── Additional content ─────────────────────────────────────────────────────

  /**
   * Any additional narrative text, observations, institutional notes,
   * or attestation clauses not captured in the structured fields above.
   * Empty string if absent.
   */
  additional_notes: string;

  // ── Signatories ────────────────────────────────────────────────────────────

  /**
   * Named signatories whose name and/or role appears on the document.
   * Typical: Academic Secretary, School Principal, Registrar.
   * Empty array if no named signatories are identifiable.
   */
  signatories: TranscriptSignatory[];

  // ── Documentary marks ──────────────────────────────────────────────────────

  /**
   * Visual/physical marks detected: institutional seals, stamps, signatures,
   * QR codes, watermarks, official logos, etc.
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
