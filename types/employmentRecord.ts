/**
 * types/employmentRecord.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for structured employment-related documents.
 *
 * Covered first release:
 *   - employment verification letters
 *   - experience letters
 *   - employer declarations
 *   - job letters
 *   - salary confirmation letters
 *   - work certificates
 *   - simple employment contracts
 *   - HR attestations
 *
 * Design goals:
 *   - Business-letter/document aesthetics
 *   - Deterministic section blocks for rendering
 *   - Honest extraction (no hallucination)
 *   - Orientation/page_count filled by pipeline
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

export type EmploymentDocumentSubtype =
  | 'employment_verification_letter'
  | 'experience_letter'
  | 'employer_declaration'
  | 'job_letter'
  | 'salary_confirmation_letter'
  | 'work_certificate'
  | 'employment_contract'
  | 'hr_attestation'
  | 'unknown';

export interface EmploymentTimelineEntry {
  role_or_title: string;
  start_date: string;
  end_date: string;
  responsibilities_summary: string;
}

export interface EmploymentSalaryBlock {
  base_amount: string;
  currency: string;
  pay_period: string;
  total_compensation: string;
  benefits_or_notes: string;
}

export interface EmploymentSignatory {
  name: string;
  role: string;
  department: string;
}

export interface EmploymentRecord {
  document_type: 'employment_record';
  document_subtype: EmploymentDocumentSubtype;

  document_title: string;
  document_subject: string;

  issuing_company: string;
  company_department: string;
  company_identification: string;

  issue_date: string;
  issue_location: string;
  addressee: string;
  salutation: string;

  employee_name: string;
  employee_id: string;
  employee_national_id: string;
  job_title: string;
  employment_status: string;
  employment_start_date: string;
  employment_end_date: string;

  employment_timeline: EmploymentTimelineEntry[];
  duties_and_responsibilities: string[];
  salary: EmploymentSalaryBlock | null;
  body_paragraphs: string[];

  issuer_name: string;
  issuer_role: string;
  issuer_department: string;
  issuer_contact: string;

  company_footer: string;
  attachments_or_references: string[];
  signatories: EmploymentSignatory[];
  visual_elements?: VisualElement[];

  orientation: 'portrait' | 'landscape' | 'unknown';
  page_count: number | null;
}

