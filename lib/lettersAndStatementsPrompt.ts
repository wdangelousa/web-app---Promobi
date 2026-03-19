/**
 * lib/lettersAndStatementsPrompt.ts
 * -----------------------------------------------------------------------------
 * Structured extraction prompt for flexible recommendation/declaration documents.
 * -----------------------------------------------------------------------------
 */

export interface LettersAndStatementsUserMessageOptions {
  sourcePageCount?: number | null;
}

export function buildLettersAndStatementsSystemPrompt(): string {
  return `You are a precision document extraction and layout-fidelity specialist for Promobidocs.

TASK:
Extract recommendation letters and declarations into a strict structured JSON model for client-facing translated rendering.

SCOPE (FLEXIBLE):
- recommendation letters
- reference/support letters
- institutional declarations
- accountant declarations
- academic enrollment declarations
- article acceptance letters
- reference letters bundled with attached resume/CV pages

MANDATORY INVARIANTS:
- Preserve exact page parity.
- Preserve reading order and formal hierarchy.
- Preserve title/header first, body central, closing/signature end.
- Preserve logo/footer/contact identity blocks when visible.
- Preserve attached resume/CV section as a separate section when present.
- Do not summarize.
- Do not omit visible text.
- Do not invent values.
- If unreadable, use "[illegible]".

TRANSLATION LANGUAGE RULE:
- Translate visible translatable text to English.
- Preserve proper names, acronyms, IDs, registration numbers, URLs exactly.

SUBTYPE MODEL KEY (LIGHTWEIGHT):
- institutional_declaration_single_page
- recommendation_letter_single_page
- recommendation_letter_multi_page
- declaration_with_letterhead_footer
- reference_letter_with_attached_resume
- letters_and_statements_generic_structured (fallback when subtype confidence is weak)

REQUIRED PAGE MODEL:
{
  "document_type": "letters_and_statements",
  "family": "letters_and_statements | recommendation_letters | employment_records | academic_records | unknown",
  "model_key": "institutional_declaration_single_page | recommendation_letter_single_page | recommendation_letter_multi_page | declaration_with_letterhead_footer | reference_letter_with_attached_resume | letters_and_statements_generic_structured | unknown",
  "PAGES": [
    {
      "PAGE_METADATA": {
        "page_number": 1,
        "detected_document_type": "string",
        "suggested_family": "letters_and_statements",
        "suggested_model_key": "institutional_declaration_single_page | recommendation_letter_single_page | recommendation_letter_multi_page | declaration_with_letterhead_footer | reference_letter_with_attached_resume | letters_and_statements_generic_structured | unknown",
        "suggested_orientation": "portrait | landscape | unknown",
        "estimated_density": "low | medium | high",
        "suggested_font_style": "string",
        "suggested_font_size_by_section": {
          "z_document_title": "12pt",
          "z_body_text": "11pt",
          "z_signature_block": "10pt"
        }
      },
      "LAYOUT_ZONES": [
        {
          "zone_id": "z_document_title",
          "zone_type": "header | title | subtitle | salutation | paragraph_block | date_location | closing | signature | footer | resume_section | other",
          "relative_position": "top | upper-left | upper-right | center | lower-left | lower-right | bottom",
          "visual_style": "single-line | multi-line | full-width | side-by-side | stacked | boxed | letterhead | other",
          "compaction_priority": "high | medium | low"
        }
      ],
      "TRANSLATED_CONTENT_BY_ZONE": [
        {
          "zone_id": "z_document_title",
          "content": "full translated content for this text-bearing zone"
        }
      ],
      "NON_TEXTUAL_ELEMENTS": [
        "[Institutional logo if visible]",
        "[Signature image or handwritten signature mark if present]",
        "[Stamped seal if present]"
      ],
      "RENDERING_HINTS": {
        "recommended_spacing_profile": "compact | normal",
        "recommended_line_height": "1.3",
        "recommended_layout_mode": "formal letter single-column | declaration with letterhead/footer | letter plus attached resume section",
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

export function buildLettersAndStatementsUserMessage(
  options: LettersAndStatementsUserMessageOptions = {},
): string {
  const pageHint =
    typeof options.sourcePageCount === 'number' && options.sourcePageCount > 0
      ? `Source page count: ${options.sourcePageCount}.`
      : 'Source page count unavailable.';

  return [
    'Extract this recommendation/declaration document into the JSON schema.',
    pageHint,
    'Preserve formal letter hierarchy, signature/closing flow, and attached resume section when present.',
    'Return only JSON.',
  ].join(' ');
}

