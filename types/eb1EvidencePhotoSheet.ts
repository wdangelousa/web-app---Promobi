/**
 * types/eb1EvidencePhotoSheet.ts
 * -----------------------------------------------------------------------------
 * Structured schema for EB1 evidence photo sheets.
 *
 * This model keeps layout-first fidelity for pages with:
 * - evidence title
 * - explanatory paragraph
 * - photo blocks/galleries
 * - optional highlight arrows/markers
 * - footer identity
 * -----------------------------------------------------------------------------
 */

export type Eb1EvidenceOrientation = 'portrait' | 'landscape' | 'unknown';
export type Eb1EvidenceDensity = 'low' | 'medium' | 'high';
export type Eb1EvidenceSpacingProfile = 'compact' | 'normal';
export type Eb1EvidenceCompactionPriority = 'high' | 'medium' | 'low';

export interface Eb1EvidencePageMetadata {
  page_number: number;
  detected_document_type: string;
  suggested_family?: string;
  suggested_model_key?: string;
  suggested_orientation: Eb1EvidenceOrientation;
  estimated_density: Eb1EvidenceDensity;
  suggested_font_style: string;
  suggested_font_size_by_section: Record<string, string>;
}

export interface Eb1EvidenceLayoutZone {
  zone_id: string;
  zone_type: string;
  relative_position: string;
  visual_style: string;
  compaction_priority: Eb1EvidenceCompactionPriority | string;
}

export interface Eb1EvidenceTranslatedZoneContent {
  zone_id: string;
  content: string;
}

export interface Eb1EvidenceRenderingHints {
  recommended_spacing_profile: Eb1EvidenceSpacingProfile | string;
  recommended_line_height: string;
  recommended_photo_layout_mode: string;
  whether_images_must_remain_side_by_side_or_stacked: string;
  page_parity_risk_notes: string;
}

export interface Eb1EvidenceStructuredPage {
  PAGE_METADATA: Eb1EvidencePageMetadata;
  LAYOUT_ZONES: Eb1EvidenceLayoutZone[];
  TRANSLATED_CONTENT_BY_ZONE: Eb1EvidenceTranslatedZoneContent[];
  NON_TEXTUAL_ELEMENTS: string[];
  RENDERING_HINTS: Eb1EvidenceRenderingHints;
}

export interface Eb1EvidencePhotoSheet {
  document_type: 'eb1_evidence_photo_sheet';
  family: 'eb1_evidence_photo_sheet' | 'relationship_evidence' | 'unknown';
  model_key:
    | 'eb1_single_photo_with_highlight_footer_v1'
    | 'eb1_two_photo_sheet_v1'
    | 'eb1_two_plus_one_photo_sheet_v1'
    | 'unknown';
  PAGES: Eb1EvidenceStructuredPage[];
  QUALITY_FLAGS?: string[];
  orientation: Eb1EvidenceOrientation;
  page_count: number | null;
}
