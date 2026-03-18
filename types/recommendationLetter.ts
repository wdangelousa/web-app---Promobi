/**
 * types/recommendationLetter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for structured recommendation/expert-support letters.
 *
 * Covered first release:
 *   - recommendation letters
 *   - expert opinion letters
 *   - support letters
 *   - reference letters
 *   - testimonial letters
 *   - institutional endorsement letters
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

export type RecommendationLetterSubtype =
  | 'recommendation_letter'
  | 'expert_opinion_letter'
  | 'support_letter'
  | 'reference_letter'
  | 'testimonial_letter'
  | 'institutional_endorsement_letter'
  | 'unknown';

export interface RecommenderCredentialItem {
  label: string;
  value: string;
}

export interface RecommendationSignatory {
  name: string;
  title: string;
  institution_or_company: string;
  contact_line: string;
}

export interface RecommendationLetter {
  document_type: 'recommendation_letter';
  document_subtype: RecommendationLetterSubtype;

  document_title: string;
  issuing_letterhead: string;
  issue_date: string;
  issue_location: string;
  addressee: string;
  salutation: string;

  recommender_name: string;
  recommender_title: string;
  recommender_institution: string;
  recommender_credentials: RecommenderCredentialItem[];

  beneficiary_name: string;
  beneficiary_identifier: string;
  beneficiary_role_or_field: string;

  evaluation_statements: string[];
  body_paragraphs: string[];
  closing_paragraph: string;
  attached_bio_or_resume_mention: string;

  signatories: RecommendationSignatory[];
  footer_or_contact_block: string;
  attachments_or_references: string[];
  visual_elements?: VisualElement[];

  orientation: 'portrait' | 'landscape' | 'unknown';
  page_count: number | null;
}
