/**
 * lib/editorialNewsPagesPrompt.ts
 * -----------------------------------------------------------------------------
 * Structured extraction prompt for flexible editorial/news pages.
 * -----------------------------------------------------------------------------
 */

export interface EditorialNewsPagesUserMessageOptions {
  sourcePageCount?: number | null;
}

export function buildEditorialNewsPagesSystemPrompt(): string {
  return `You are a precision document extraction and layout-fidelity specialist for Promobidocs.

TASK:
Extract editorial/news evidence pages into a strict structured JSON model for client-facing translated rendering.

SCOPE (FLEXIBLE):
- scanned newspaper clippings
- web news article pages
- web print captures with site UI/furniture
- editorial/article metadata pages
- journal/magazine cover or article landing pages

MANDATORY INVARIANTS:
- Preserve exact page parity.
- Preserve reading order and hierarchy.
- Preserve title/byline/date/article-body relationships.
- Preserve image/figure placement signals and captions.
- Preserve visible web furniture text if present (menus, cookie text, footer links, URL/timestamp).
- Do not summarize.
- Do not omit visible text.
- Do not invent values.
- If unreadable, use "[illegible]".

TRANSLATION LANGUAGE RULE:
- Translate visible translatable text to English.
- Preserve proper names, acronyms, DOI, ISSN/ISBN, URLs exactly.

SUBTYPE MODEL KEY (LIGHTWEIGHT):
- print_news_clipping
- web_news_article
- web_news_printview
- editorial_article_cover_or_metadata
- editorial_news_generic_structured (fallback when subtype confidence is weak)

REQUIRED PAGE MODEL:
{
  "document_type": "editorial_news_pages",
  "family": "editorial_news_pages | publications_media | unknown",
  "model_key": "print_news_clipping | web_news_article | web_news_printview | editorial_article_cover_or_metadata | editorial_news_generic_structured | unknown",
  "PAGES": [
    {
      "PAGE_METADATA": {
        "page_number": 1,
        "detected_document_type": "string",
        "suggested_family": "editorial_news_pages",
        "suggested_model_key": "print_news_clipping | web_news_article | web_news_printview | editorial_article_cover_or_metadata | editorial_news_generic_structured | unknown",
        "suggested_orientation": "portrait | landscape | unknown",
        "estimated_density": "low | medium | high",
        "suggested_font_style": "string",
        "suggested_font_size_by_section": {
          "z_headline": "11pt",
          "z_subheadline": "10pt",
          "z_byline": "9pt",
          "z_article_body": "10pt"
        }
      },
      "LAYOUT_ZONES": [
        {
          "zone_id": "z_headline",
          "zone_type": "header | title | subheadline | byline | location_date | paragraph_block | photo_block | photo_gallery | metadata_block | doi_block | abstract_block | web_furniture | footer | other",
          "relative_position": "top | upper-left | upper-right | center | lower-left | lower-right | bottom",
          "visual_style": "single-line | multi-line | full-width | side-by-side | stacked | image-based | boxed | multi-column | other",
          "compaction_priority": "high | medium | low"
        }
      ],
      "TRANSLATED_CONTENT_BY_ZONE": [
        {
          "zone_id": "z_headline",
          "content": "full translated content for this text-bearing zone"
        }
      ],
      "NON_TEXTUAL_ELEMENTS": [
        "[Photo: ...]",
        "[Publication logo/seal if visible]",
        "[Figure/caption relationship preserved]"
      ],
      "RENDERING_HINTS": {
        "recommended_spacing_profile": "compact | normal",
        "recommended_line_height": "1.25",
        "recommended_layout_mode": "single-column editorial | two-column clipping | web article with furniture blocks",
        "page_parity_risk_notes": "string"
      }
    }
  ],
  "QUALITY_FLAGS": [
    "optional quality flag"
  ],
  "orientation": "unknown",
  "page_count": null
}

Return ONLY valid JSON. No markdown fences. No extra prose.`;
}

export function buildEditorialNewsPagesUserMessage(
  options: EditorialNewsPagesUserMessageOptions = {},
): string {
  const pageHint =
    typeof options.sourcePageCount === 'number' && options.sourcePageCount > 0
      ? `Source page count: ${options.sourcePageCount}.`
      : 'Source page count unavailable.';

  return [
    'Extract this editorial/news evidence document into the JSON schema.',
    pageHint,
    'Keep headline hierarchy, article body order, optional image/caption relationships, and web-furniture text when visible.',
    'Return only JSON.',
  ].join(' ');
}

