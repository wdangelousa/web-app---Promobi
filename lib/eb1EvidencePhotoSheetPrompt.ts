/**
 * lib/eb1EvidencePhotoSheetPrompt.ts
 * -----------------------------------------------------------------------------
 * Structured extraction prompt for EB1 evidence photo sheets.
 * -----------------------------------------------------------------------------
 */

export interface Eb1EvidencePhotoSheetUserMessageOptions {
  sourcePageCount?: number | null;
}

export function buildEb1EvidencePhotoSheetSystemPrompt(): string {
  return `You are a precision document extraction and layout-fidelity specialist for Promobidocs.

TASK:
Extract EB1 evidence photo sheets into a strict structured JSON layout model for client-facing translated rendering.

MANDATORY INVARIANTS:
- Preserve exact page parity.
- Preserve reading order and block hierarchy.
- Preserve relative placement of text and photo blocks.
- Preserve photo arrangement (single, side-by-side, or two-plus-one).
- Preserve highlight arrows/markers in non-textual representation.
- Do not summarize.
- Do not omit visible text.
- Do not invent missing values.
- If unreadable, use "[illegible]".

TRANSLATION LANGUAGE RULE:
- Translate all visible translatable text to English.
- Preserve proper names and acronyms exactly.
- Keep evidence numbering and labels faithful.

PAGE PARITY:
- Output exactly one translated page object per source page.
- Never split one source page into multiple translated pages.

RETURN FORMAT:
Return ONLY valid JSON. No markdown fences. No explanatory prose.

{
  "document_type": "eb1_evidence_photo_sheet",
  "family": "eb1_evidence_photo_sheet | relationship_evidence | unknown",
  "model_key": "eb1_single_photo_with_highlight_footer_v1 | eb1_two_photo_sheet_v1 | eb1_two_plus_one_photo_sheet_v1 | unknown",
  "PAGES": [
    {
      "PAGE_METADATA": {
        "page_number": 1,
        "detected_document_type": "string",
        "suggested_family": "eb1_evidence_photo_sheet",
        "suggested_model_key": "eb1_single_photo_with_highlight_footer_v1 | eb1_two_photo_sheet_v1 | eb1_two_plus_one_photo_sheet_v1 | unknown",
        "suggested_orientation": "portrait | landscape | unknown",
        "estimated_density": "low | medium | high",
        "suggested_font_style": "string",
        "suggested_font_size_by_section": {
          "z_evidence_title": "11pt",
          "z_explanatory_paragraph": "11pt",
          "z_footer_identity": "11pt"
        }
      },
      "LAYOUT_ZONES": [
        {
          "zone_id": "z_evidence_title",
          "zone_type": "title | paragraph_block | photo_block | photo_gallery | highlight_marker | footer | header | other",
          "relative_position": "top | upper-left | upper-right | center | lower-left | lower-right | bottom",
          "visual_style": "single-line | full-width | centered | side-by-side | stacked | image-based | boxed | other",
          "compaction_priority": "high | medium | low"
        }
      ],
      "TRANSLATED_CONTENT_BY_ZONE": [
        {
          "zone_id": "z_evidence_title",
          "content": "full translated content for this text-bearing zone"
        }
      ],
      "NON_TEXTUAL_ELEMENTS": [
        "[Photo: ...]",
        "[Yellow arrow pointing to the beneficiary]",
        "[Certificate visible]"
      ],
      "RENDERING_HINTS": {
        "recommended_spacing_profile": "compact | normal",
        "recommended_line_height": "1.25",
        "recommended_photo_layout_mode": "single centered portrait photo block | two-column gallery | top row 2-up + bottom centered single",
        "whether_images_must_remain_side_by_side_or_stacked": "single | side-by-side | top side-by-side with bottom centered",
        "page_parity_risk_notes": "string"
      }
    }
  ],
  "QUALITY_FLAGS": [
    "optional quality flag"
  ],
  "orientation": "unknown",
  "page_count": null
}`;
}

export function buildEb1EvidencePhotoSheetUserMessage(
  options: Eb1EvidencePhotoSheetUserMessageOptions = {},
): string {
  const pageHint =
    typeof options.sourcePageCount === 'number' && options.sourcePageCount > 0
      ? `Source page count: ${options.sourcePageCount}.`
      : 'Source page count unavailable.';

  return [
    'Extract this EB1 evidence photo sheet into the JSON schema.',
    pageHint,
    'Preserve zone order, photo arrangement, highlight markers, and footer identity.',
    'Translate all visible text to English and return only JSON.',
  ].join(' ');
}
