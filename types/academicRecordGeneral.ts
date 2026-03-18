/**
 * types/academicRecordGeneral.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for broader academic records beyond canonical transcripts.
 *
 * Covered first release:
 *   - enrollment certificates
 *   - declarations from educational institutions
 *   - course completion statements
 *   - academic letters
 *   - syllabi / ementa excerpts
 *   - academic records with subject/grade tables
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

export type AcademicRecordGeneralSubtype =
  | 'transcript_style_record'
  | 'academic_declaration_letter'
  | 'enrollment_statement'
  | 'completion_statement'
  | 'syllabus_excerpt'
  | 'academic_record_table'
  | 'unknown';

export interface AcademicRecordMetaItem {
  label: string;
  value: string;
}

export interface AcademicRecordPeriodEntry {
  period: string;
  start_date: string;
  end_date: string;
  status: string;
  notes: string;
}

export interface AcademicRecordSubjectRow {
  code: string;
  subject: string;
  hours_or_credits: string;
  grade: string;
  status: string;
  period: string;
}

export interface AcademicRecordSignatory {
  name: string;
  role: string;
  unit: string;
  contact: string;
}

export interface AcademicRecordGeneral {
  document_type: 'academic_record_general';
  document_subtype: AcademicRecordGeneralSubtype;

  document_title: string;
  issuing_institution: string;
  institution_unit: string;
  issue_date: string;
  issue_location: string;

  student_name: string;
  student_id: string;
  student_national_id: string;
  program_name: string;
  course_name: string;
  degree_level: string;

  academic_period: string;
  enrollment_status: string;
  enrollment_start_date: string;
  enrollment_end_date: string;

  issuance_purpose: string;
  metadata_grid: AcademicRecordMetaItem[];
  period_layout: AcademicRecordPeriodEntry[];
  subject_grade_table: AcademicRecordSubjectRow[];
  body_paragraphs: string[];

  issuance_block_text: string;
  signatories: AcademicRecordSignatory[];
  registrar_footer: string;
  attachments_or_references: string[];
  visual_elements?: VisualElement[];

  orientation: 'portrait' | 'landscape' | 'unknown';
  page_count: number | null;
}
