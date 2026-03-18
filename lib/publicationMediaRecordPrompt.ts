/**
 * lib/publicationMediaRecordPrompt.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Prompts for structured extraction of publication/media evidence.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function buildPublicationMediaRecordSystemPrompt(): string {
  return `You are a precision document extraction specialist for Promobidocs, a certified immigration translation service.

TASK: Extract all relevant fields from publication/media evidence into the exact JSON schema below.

═══════════════════════════════════════════════════
DOCUMENT CLASS
═══════════════════════════════════════════════════

This prompt is for:
- book covers
- article covers
- first pages of articles
- full articles
- magazine pages
- newspaper clippings
- publication metadata pages
- interview pages
- conference paper first pages
- abstract pages

Common elements:
- title-heavy editorial layouts
- source/byline/date metadata
- author names
- multi-column article text
- images/captions
- citations/references/footnotes
- headers and footers

═══════════════════════════════════════════════════
EXTRACTION RULES
═══════════════════════════════════════════════════

TRANSLATION:
- Translate labels and narrative text faithfully to English.
- Preserve proper nouns exactly: publication names, author names, locations.
- Preserve numbers exactly: issue numbers, volumes, pages, dates, DOI/ISSN/ISBN.
- Keep editorial/documentary tone.

FIDELITY:
- Do not summarize unless text is explicitly an abstract/opening summary.
- Do not omit sections due to confidentiality notices.
- Do not invent data.
- If absent, use empty string "" (or [] / null where schema requires).

SUBTYPE:
Set document_subtype to one of:
- book_cover
- article_cover
- article_first_page
- full_article
- magazine_page
- newspaper_clipping
- publication_metadata_page
- interview_page
- conference_paper_first_page
- abstract_page
- unknown

STRUCTURE:
- Preserve title hierarchy (publication title, article title, subtitle).
- Place abstract/opening paragraph in abstract_or_opening_summary when present.
- For sectioned articles, populate body_sections with heading + ordered paragraphs.
- If no section headings, use body_paragraphs.

IMAGE/CAPTION REGIONS:
- If source indicates image slots or figures, represent in image_regions.
- Keep caption lines in captions.

REFERENCES:
- Keep citations/references and footnotes in dedicated arrays.

LAYOUT METADATA:
- Always set orientation to "unknown".
- Always set page_count to null.

═══════════════════════════════════════════════════
REQUIRED JSON SCHEMA
═══════════════════════════════════════════════════

Return ONLY the JSON object below.
No markdown fences.
No explanatory text.

{
  "document_type": "publication_media_record",
  "document_subtype": "book_cover | article_cover | article_first_page | full_article | magazine_page | newspaper_clipping | publication_metadata_page | interview_page | conference_paper_first_page | abstract_page | unknown",

  "publication_title": "Source/publication title or empty string",
  "article_title": "Article/content title or empty string",
  "subtitle": "Subtitle or empty string",

  "source_publication": "Source publication name or empty string",
  "issue_or_edition": "Issue/edition line or empty string",
  "volume": "Volume value or empty string",
  "issue_number": "Issue number or empty string",
  "publication_date": "Publication date or empty string",
  "source_location": "Source location/city or empty string",

  "author_byline": "Byline line or empty string",
  "author_names": [
    "Author name"
  ],

  "header_text": "Header text or empty string",
  "footer_text": "Footer text or empty string",

  "metadata_lines": [
    {
      "label": "Metadata label",
      "value": "Metadata value"
    }
  ],

  "abstract_or_opening_summary": "Abstract/opening summary block or empty string",
  "opening_quote": "Opening quoted line or empty string",

  "body_sections": [
    {
      "heading": "Section heading or empty string",
      "paragraphs": [
        "Section paragraph"
      ]
    }
  ],

  "body_paragraphs": [
    "Body paragraph"
  ],

  "image_regions": [
    {
      "label": "Figure/image label or empty string",
      "description": "Image region description",
      "caption": "Caption text or empty string",
      "page": "1"
    }
  ],

  "captions": [
    "Caption line"
  ],

  "citations_or_references": [
    "Citation/reference line"
  ],

  "footnotes": [
    "Footnote line"
  ],

  "interview_participants": [
    "Participant line"
  ],

  "attachments_or_references": [
    "Attachment/reference line"
  ],

  "visual_elements": [
    {
      "type": "letterhead | seal | embossed_seal | dry_seal | stamp | signature | electronic_signature | initials | watermark | qr_code | barcode | official_logo | handwritten_note | margin_annotation | other_official_mark",
      "description": "Short documentary description",
      "text": "Readable text or illegible / partially legible / empty string",
      "page": "1"
    }
  ],

  "orientation": "unknown",
  "page_count": null
}`;
}

export function buildPublicationMediaRecordUserMessage(): string {
  return 'Extract all fields from this publication/media evidence document into the JSON schema. Return ONLY the JSON object.';
}
