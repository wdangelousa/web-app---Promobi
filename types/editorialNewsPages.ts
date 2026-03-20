/**
 * types/editorialNewsPages.ts
 * -----------------------------------------------------------------------------
 * Structured schema for flexible editorial/news pages.
 *
 * Supported shapes:
 * - scanned newspaper clippings
 * - web news articles
 * - web print views with UI furniture
 * - editorial metadata / cover / landing pages
 * -----------------------------------------------------------------------------
 */

export type EditorialNewsOrientation = 'portrait' | 'landscape' | 'mixed' | 'unknown';
export type EditorialNewsDensity = 'low' | 'medium' | 'high';
export type EditorialNewsSpacingProfile = 'compact' | 'normal';
export type EditorialNewsCompactionPriority = 'high' | 'medium' | 'low';

export type EditorialNewsModelKey =
  | 'print_news_clipping'
  | 'web_news_article'
  | 'web_news_printview'
  | 'editorial_article_cover_or_metadata'
  | 'web_structured_data_page'
  | 'editorial_news_generic_structured'
  | 'magazine_feature'
  | 'academic_journal_article'
  | 'newsletter_clipping';

export interface EditorialNewsPageMetadata {
  page_number: number;
  detected_document_type: string;
  suggested_family?: string;
  suggested_model_key?: EditorialNewsModelKey | 'unknown';
  suggested_orientation: EditorialNewsOrientation;
  estimated_density: EditorialNewsDensity;
  suggested_font_style: string;
  suggested_font_size_by_section: Record<string, string>;
  is_scanned_clipping: boolean;
  has_graphic_elements: boolean;
}

export interface EditorialNewsPageStructure {
  columns_count: number;
  has_main_headline: boolean;
  has_subheadlines: boolean;
  has_byline: boolean;
  has_dateline: boolean;
}

export interface EditorialNewsLayoutZone {
  zone_id: string;
  zone_type: string;
  relative_position: string;
  visual_style: string;
  compaction_priority: EditorialNewsCompactionPriority | string;
}

export interface EditorialNewsTranslatedZoneContent {
  zone_id: string;
  content: string;
}

export interface EditorialNewsRenderingHints {
  recommended_spacing_profile: EditorialNewsSpacingProfile | string;
  recommended_line_height: string;
  recommended_layout_mode: string;
  page_parity_risk_notes: string;
}

export interface EditorialNewsStructuredPage {
  PAGE_METADATA: EditorialNewsPageMetadata;
  LAYOUT_ZONES: EditorialNewsLayoutZone[];
  TRANSLATED_CONTENT_BY_ZONE: EditorialNewsTranslatedZoneContent[];
  NON_TEXTUAL_ELEMENTS: string[];
  RENDERING_HINTS: EditorialNewsRenderingHints;
}

export interface EditorialNewsPages {
  document_type: 'editorial_news_pages';
  family: 'editorial_news_pages' | 'publications_media' | 'unknown';
  model_key: EditorialNewsModelKey | 'unknown';
  PAGES: EditorialNewsStructuredPage[];
  QUALITY_FLAGS?: string[];
  orientation: EditorialNewsOrientation;
  page_count: number | null;
}

