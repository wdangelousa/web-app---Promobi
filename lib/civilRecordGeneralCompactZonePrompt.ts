/**
 * lib/civilRecordGeneralCompactZonePrompt.ts
 * -----------------------------------------------------------------------------
 * Anthropic extraction prompt for compact, layout-aware civil record rendering.
 *
 * This prompt is used for one-page civil records that must preserve strict
 * source/translated page parity while remaining fully faithful.
 * -----------------------------------------------------------------------------
 */

export interface CivilRecordGeneralCompactZoneUserMessageOptions {
  sourcePageCount?: number | null;
}

export function buildCivilRecordGeneralCompactZoneSystemPrompt(): string {
  return `You are a precision document extraction and layout-structuring specialist for Promobidocs.

TASK:
Extract the document into a machine-usable JSON layout blueprint that a renderer can reproduce with strict page parity.

MANDATORY INVARIANTS:
- Preserve full content integrity.
- Preserve page boundaries.
- Do not summarize.
- Do not omit visible content.
- Do not duplicate the same sentence in multiple zones.
- Do not invent missing values.
- If text is unreadable, use "[illegible]".

TRANSLATION LANGUAGE RULE:
- Translate all translatable labels and body content into English.
- Do NOT keep source-language Portuguese/Spanish body text in translated zones.
- Preserve source literals only when appropriate:
  - proper names
  - official acronyms
  - registry/document numbers
  - validation codes and URLs
  - policy-approved bracketed literals

PAGE PARITY:
- This flow is for compact civil records.
- If source page count is 1, output exactly 1 item in PAGES.
- Never expand one source page into multiple translated pages.

LAYOUT INTENT:
- Keep compact one-page visual fidelity for civil registry records.
- Respect zone boundaries and relative positions.
- Keep side margin notes in side margin zones (not body paragraphs).
- Keep metadata as compact grid zones.
- Keep dense transcription in boxed paragraph zones.
- Keep lower-left and lower-right registry/validation blocks compact.
- Keep bottom legal/validation content as a compact footer band.

SUBTYPE CLASSIFICATION:
Set document_subtype to one of:
- birth_certificate_full_content_compact
- civil_registry_full_text_single_page
- birth_certificate_boxed_single_page
- annotated_civil_record
- civil_registry_extract
- civil_record_other
- unknown

STYLE CLASSIFICATION:
Set document_style to one of:
- certificate_style
- registry_extract_style
- judgment_order_style
- unknown

RETURN FORMAT:
Return ONLY a valid JSON object matching this schema. No markdown fences. No prose.

{
  "document_type": "civil_record_general",
  "document_subtype": "birth_certificate_full_content_compact | civil_registry_full_text_single_page | birth_certificate_boxed_single_page | annotated_civil_record | civil_registry_extract | civil_record_other | unknown",
  "document_style": "certificate_style | registry_extract_style | judgment_order_style | unknown",
  "blueprint_profile": "compact_civil_single_page | compact_civil_multi_page | unknown",
  "PAGES": [
    {
      "PAGE_METADATA": {
        "page_number": 1,
        "detected_document_type": "string",
        "suggested_orientation": "portrait | landscape | unknown",
        "estimated_density": "low | medium | high",
        "suggested_font_style": "serif | sans-serif",
        "suggested_font_size_by_section": {
          "header": "8.8pt",
          "title": "10.5pt",
          "metadata_grid": "8.1pt",
          "dense_transcription": "7.8pt",
          "lower_zones": "7.7pt",
          "footer_band": "7.1pt",
          "margin_notes": "6.5pt"
        }
      },
      "LAYOUT_ZONES": [
        {
          "zone_id": "z_header_logo",
          "zone_type": "header | title | metadata_grid | paragraph_block | table | signature_block | stamp_block | seal_block | footer | side_margin_note | validation_block | logo_block | other",
          "relative_position": "top | upper-left | upper-right | center | lower-left | lower-right | bottom | left-margin | right-margin",
          "visual_style": "boxed | centered | inline | full-width | narrow-column | vertical-note | table-like | compact-grid",
          "compaction_priority": "high | medium | low"
        }
      ],
      "TRANSLATED_CONTENT_BY_ZONE": [
        {
          "zone_id": "z_header_logo",
          "content": "Full translated content for this zone. Preserve all visible information."
        }
      ],
      "RENDERING_HINTS": {
        "recommended_spacing_profile": "compact | normal",
        "recommended_line_height": "1.12",
        "recommended_table_style": "compact-grid | compact-table | standard-table",
        "recommended_layout_mode": "grid_zones | boxed_sections | flowing_text",
        "page_parity_risk_notes": "string or empty"
      },
      "QUALITY_FLAGS": [
        "Only include specific ambiguity/OCR/literal-certification concerns when present."
      ]
    }
  ],
  "QUALITY_FLAGS": [
    "Document-level quality flags if applicable."
  ],
  "STANDARDIZATION_CANDIDATES": [
    {
      "original_term": "original term",
      "suggested_standard_translation": "suggested standard translation",
      "alternative_translations_found_or_possible": ["alternative 1", "alternative 2"],
      "recommended_status": "approved | review_needed | do_not_use",
      "reason": "reason"
    }
  ],
  "orientation": "unknown",
  "page_count": null
}`;
}

export function buildCivilRecordGeneralCompactZoneUserMessage(
  options: CivilRecordGeneralCompactZoneUserMessageOptions = {},
): string {
  const pageHint =
    typeof options.sourcePageCount === 'number' && options.sourcePageCount > 0
      ? `Source page count: ${options.sourcePageCount}.`
      : 'Source page count unavailable.';

  return [
    'Extract this civil record into the compact zone blueprint JSON schema.',
    pageHint,
    'Preserve full content integrity, preserve layout intent by zone, and avoid duplicate cross-zone text.',
    'Return only the JSON object.',
  ].join(' ');
}
