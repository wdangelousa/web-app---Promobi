/**
 * types/webContentAnalysis.ts
 * -----------------------------------------------------------------------------
 * Types for high-level web content analysis and metadata extraction.
 * -----------------------------------------------------------------------------
 */

export type WebContentType = 'article' | 'blog_post' | 'product_page' | 'forum_thread' | 'landing_page' | 'documentation';

export interface WebMetadata {
  title: string;
  author?: string;
  published_date?: string;
  modified_date?: string;
  source_url: string;
  language: string;
  reading_time_minutes?: number;
}

export interface WebContentAnalysis {
  content_type: WebContentType;
  metadata: WebMetadata;
  main_topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  confidence_score: number;
  summary_short: string;
  summary_long: string;
}
