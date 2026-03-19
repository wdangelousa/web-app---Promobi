/**
 * types/lettersAndStatements.ts
 * -----------------------------------------------------------------------------
 * Structured schema for flexible letters and declarations.
 *
 * Supported shapes:
 * - recommendation/reference/support letters
 * - institutional/accountant/academic declarations
 * - article acceptance letters
 * - reference letters bundled with attached resume/CV pages
 * -----------------------------------------------------------------------------
 */

export type LettersStatementsOrientation = 'portrait' | 'landscape' | 'unknown';
export type LettersStatementsDensity = 'low' | 'medium' | 'high';
export type LettersStatementsSpacingProfile = 'compact' | 'normal';
export type LettersStatementsCompactionPriority = 'high' | 'medium' | 'low';

export type LettersStatementsModelKey =
  | 'institutional_declaration_single_page'
  | 'recommendation_letter_single_page'
  | 'recommendation_letter_multi_page'
  | 'declaration_with_letterhead_footer'
  | 'reference_letter_with_attached_resume'
  | 'letters_and_statements_generic_structured';

export interface LettersStatementsPageMetadata {
  page_number: number;
  detected_document_type: string;
  suggested_family?: string;
  suggested_model_key?: LettersStatementsModelKey | 'unknown';
  suggested_orientation: LettersStatementsOrientation;
  estimated_density: LettersStatementsDensity;
  suggested_font_style: string;
  suggested_font_size_by_section: Record<string, string>;
}

export interface LettersStatementsLayoutZone {
  zone_id: string;
  zone_type: string;
  relative_position: string;
  visual_style: string;
  compaction_priority: LettersStatementsCompactionPriority | string;
}

export interface LettersStatementsTranslatedZoneContent {
  zone_id: string;
  content: string;
}

export interface LettersStatementsRenderingHints {
  recommended_spacing_profile: LettersStatementsSpacingProfile | string;
  recommended_line_height: string;
  recommended_layout_mode: string;
  page_parity_risk_notes: string;
}

export interface LettersStatementsStructuredPage {
  PAGE_METADATA: LettersStatementsPageMetadata;
  LAYOUT_ZONES: LettersStatementsLayoutZone[];
  TRANSLATED_CONTENT_BY_ZONE: LettersStatementsTranslatedZoneContent[];
  NON_TEXTUAL_ELEMENTS: string[];
  RENDERING_HINTS: LettersStatementsRenderingHints;
}

export interface LettersAndStatements {
  document_type: 'letters_and_statements';
  family:
    | 'letters_and_statements'
    | 'recommendation_letters'
    | 'employment_records'
    | 'academic_records'
    | 'unknown';
  model_key: LettersStatementsModelKey | 'unknown';
  PAGES: LettersStatementsStructuredPage[];
  QUALITY_FLAGS?: string[];
  orientation: LettersStatementsOrientation;
  page_count: number | null;
}

