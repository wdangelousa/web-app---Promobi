/**
 * types/publicationMediaRecord.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for structured publication/media evidence.
 *
 * Covered first release:
 *   - book covers
 *   - article covers and first pages
 *   - full articles
 *   - magazine pages
 *   - newspaper clippings
 *   - publication metadata pages
 *   - interview pages
 *   - conference paper first pages
 *   - abstract pages
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

export type PublicationMediaSubtype =
  | 'book_cover'
  | 'article_cover'
  | 'article_first_page'
  | 'full_article'
  | 'magazine_page'
  | 'newspaper_clipping'
  | 'publication_metadata_page'
  | 'interview_page'
  | 'conference_paper_first_page'
  | 'abstract_page'
  | 'unknown';

export interface PublicationMetadataItem {
  label: string;
  value: string;
}

export interface PublicationBodySection {
  heading: string;
  paragraphs: string[];
}

export interface PublicationImageRegion {
  label: string;
  description: string;
  caption: string;
  page: string;
}

export interface PublicationMediaRecord {
  document_type: 'publication_media_record';
  document_subtype: PublicationMediaSubtype;

  publication_title: string;
  article_title: string;
  subtitle: string;

  source_publication: string;
  issue_or_edition: string;
  volume: string;
  issue_number: string;
  publication_date: string;
  source_location: string;

  author_byline: string;
  author_names: string[];

  header_text: string;
  footer_text: string;

  metadata_lines: PublicationMetadataItem[];

  abstract_or_opening_summary: string;
  opening_quote: string;

  body_sections: PublicationBodySection[];
  body_paragraphs: string[];

  image_regions: PublicationImageRegion[];
  captions: string[];

  citations_or_references: string[];
  footnotes: string[];
  interview_participants: string[];

  attachments_or_references: string[];
  visual_elements?: VisualElement[];

  orientation: 'portrait' | 'landscape' | 'unknown';
  page_count: number | null;
}
