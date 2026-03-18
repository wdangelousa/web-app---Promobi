/**
 * types/civilRecordGeneral.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for structured civil-record extraction when a dedicated
 * birth/marriage schema is not applicable.
 *
 * Covered in this family record:
 *   - divorce certificates / decrees / judgments
 *   - death certificates
 *   - adoption records
 *   - name change records
 *   - civil registry extracts
 *
 * This schema intentionally supports three rendering styles:
 *   - certificate_style
 *   - registry_extract_style
 *   - judgment_order_style
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

export type CivilRecordSubtype =
  | 'divorce_certificate'
  | 'divorce_judgment_or_decree'
  | 'death_certificate'
  | 'adoption_record'
  | 'name_change_record'
  | 'civil_registry_extract'
  | 'birth_certificate_full_content_compact'
  | 'civil_registry_full_text_single_page'
  | 'birth_certificate_boxed_single_page'
  | 'annotated_civil_record'
  | 'civil_record_other'
  | 'unknown';

export type CivilRecordStyle =
  | 'certificate_style'
  | 'registry_extract_style'
  | 'judgment_order_style'
  | 'unknown';

export interface CivilRecordKeyValue {
  label: string;
  value: string;
}

export interface CivilRecordPersonEntry {
  role: string;
  full_name: string;
  id_reference: string;
  date_of_birth: string;
  nationality: string;
  notes: string;
}

export interface CivilRecordJudgmentBlock {
  court_name: string;
  judge_name: string;
  case_number: string;
  decision_date: string;
  effective_date: string;
  operative_text: string;
}

export interface CivilRecordCertificationFooter {
  certification_text: string;
  issuer_name: string;
  issuer_role: string;
  issue_date: string;
  issue_location: string;
  seal_reference: string;
  signature_line: string;
  validation_code: string;
  validation_url: string;
  footer_notes: string;
}

export interface CivilRecordGeneral {
  document_type: 'civil_record_general';
  document_subtype: CivilRecordSubtype;
  document_style: CivilRecordStyle;

  document_title: string;
  issuing_authority: string;
  registry_office: string;
  jurisdiction: string;

  registration_number: string;
  protocol_number: string;
  book_reference: string;
  page_reference: string;
  term_reference: string;

  event_type: string;
  event_date: string;
  event_location: string;
  event_summary: string;

  document_metadata: CivilRecordKeyValue[];
  event_person_data: CivilRecordKeyValue[];
  parties: CivilRecordPersonEntry[];
  parent_spouse_witness_data: CivilRecordPersonEntry[];

  annotations_marginal_notes: string[];
  documentary_notes: string[];

  judgment_or_order: CivilRecordJudgmentBlock | null;
  certification_footer: CivilRecordCertificationFooter;
  visual_elements?: VisualElement[];

  orientation: 'portrait' | 'landscape' | 'unknown';
  page_count: number | null;
}

export type CivilRecordEstimatedDensity = 'low' | 'medium' | 'high';
export type CivilRecordFontStyle = 'serif' | 'sans-serif';
export type CivilRecordCompactionPriority = 'high' | 'medium' | 'low';
export type CivilRecordSpacingProfile = 'compact' | 'normal';
export type CivilRecordOrientationHint = 'portrait' | 'landscape' | 'unknown';

export interface CivilRecordStructuredPageMetadata {
  page_number: number;
  detected_document_type: string;
  suggested_orientation: CivilRecordOrientationHint;
  estimated_density: CivilRecordEstimatedDensity;
  suggested_font_style: CivilRecordFontStyle;
  suggested_font_size_by_section: Record<string, string>;
}

export interface CivilRecordLayoutZone {
  zone_id: string;
  zone_type: string;
  relative_position:
    | 'top'
    | 'upper-left'
    | 'upper-right'
    | 'center'
    | 'lower-left'
    | 'lower-right'
    | 'bottom'
    | 'left-margin'
    | 'right-margin';
  visual_style: string;
  compaction_priority: CivilRecordCompactionPriority;
}

export interface CivilRecordZoneTranslatedContent {
  zone_id: string;
  content: string;
}

export interface CivilRecordRenderingHints {
  recommended_spacing_profile: CivilRecordSpacingProfile;
  recommended_line_height: string;
  recommended_table_style: string;
  recommended_layout_mode: string;
  page_parity_risk_notes: string;
}

export interface CivilRecordStructuredPage {
  PAGE_METADATA: CivilRecordStructuredPageMetadata;
  LAYOUT_ZONES: CivilRecordLayoutZone[];
  TRANSLATED_CONTENT_BY_ZONE: CivilRecordZoneTranslatedContent[];
  RENDERING_HINTS: CivilRecordRenderingHints;
  QUALITY_FLAGS?: string[];
}

export interface CivilRecordStandardizationCandidate {
  original_term: string;
  suggested_standard_translation: string;
  alternative_translations_found_or_possible: string[];
  recommended_status: 'approved' | 'review_needed' | 'do_not_use';
  reason: string;
}

export interface CivilRecordGeneralZoneBlueprint {
  document_type: 'civil_record_general';
  document_subtype: CivilRecordSubtype;
  document_style: CivilRecordStyle;
  blueprint_profile: 'compact_civil_single_page' | 'compact_civil_multi_page' | 'unknown';
  PAGES: CivilRecordStructuredPage[];
  QUALITY_FLAGS?: string[];
  STANDARDIZATION_CANDIDATES?: CivilRecordStandardizationCandidate[];
  orientation: CivilRecordOrientationHint;
  page_count: number | null;
}
