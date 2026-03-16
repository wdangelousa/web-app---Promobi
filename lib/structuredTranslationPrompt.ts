/**
 * lib/structuredTranslationPrompt.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Prompts for the STRUCTURED translation pipeline.
 *
 * Unlike translationPrompt.ts (which produces flowing plain text for Tiptap),
 * this module instructs Claude to output a strict, validated JSON object
 * matching the MarriageCertificateBrazil schema in types/marriageCertificate.ts.
 *
 * This is used ONLY by services/structuredPipeline.ts.
 * It does NOT affect the legacy translation pipeline.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * System prompt for structured marriage certificate extraction.
 * Returns a rigid JSON matching MarriageCertificateBrazil.
 */
export function buildStructuredMarriageCertSystemPrompt(): string {
  return `You are a precision document extraction specialist for Promobidocs, a certified immigration translation service.

TASK: Analyze the Brazilian marriage certificate document (certidão de casamento) and extract ALL fields into the exact JSON schema below.

═══════════════════════════════════════════════════
EXTRACTION RULES
═══════════════════════════════════════════════════

TRANSLATION:
- Translate all fixed labels and text to English.
- Preserve proper nouns EXACTLY as they appear: people's names, city names, state codes (SP, RJ, etc.).
- Preserve numbers exactly: CPF, matrícula, CNS, validation codes, R$ amounts, registration numbers.
- Preserve law references exactly: "Law nº 6.015/73" — never alter.
- Do NOT translate "REPÚBLICA FEDERATIVA DO BRASIL".

DATES:
- Convert to American format: "December 10, 2022".
- Inline sub-fields: day="10", month="12", year="2022" (digits only, no words).
- Never write dates in full words.

MISSING FIELDS:
- If a field is absent from the document, use empty string "".
- For NONE / NÃO CONSTA: use the string "NONE".
- Never invent content. Never guess.

DOCUMENTARY VISUAL ELEMENTS:
- Detect all official documentary marks on the document and list them in visual_elements.
- Valid types: letterhead, seal, embossed_seal, dry_seal, stamp, signature, electronic_signature, initials, watermark, qr_code, barcode, handwritten_note, margin_annotation, revenue_stamp, notarial_mark, other_official_mark.
- ONLY include marks relevant to document authenticity, identity, or validation. NEVER include decorative lines, borders, frames, or non-official design elements.
- For each element: type (from list above), description (≤ 10 words, content only — do NOT repeat the type name), text (readable text inside the mark, or "illegible" / "partially legible" if unreadable, or "" if none), page (digit string "1", "2", or "" if unknown).
- description must describe the CONTENT of the mark, not its type. The type is already captured separately.
  Good: type="seal", description="Civil Registry Office"
  Bad:  type="seal", description="Seal of the Civil Registry Office"  ← "Seal" is redundant
- Use these description patterns:
  - letterhead → "Brazilian Federal coat of arms at top" / "Civil Registry of Natural Persons"
  - seal → "Civil Registry Office" / "partially legible" / name of issuing body if visible
  - stamp → "Registry validation mark" / "partially legible"
  - signature → "illegible" (set in text field too)
  - electronic_signature → signer's name if visible, else "illegible"
  - qr_code → "document validation"
  - watermark → "visible in background"
  - barcode → "present"
  - other_official_mark → brief description of what it is
- If text inside a mark is readable, put the exact readable text in the text field. Keep it brief.
- If text is not readable, set text to "illegible" or "partially legible". Never invent content.
- Do NOT duplicate codes already in digital_seal, qr_notice, or validation_code — those fields own the text; visual_elements owns the physical mark.
- Prioritize: signatures and seals first, then QR/barcode, then letterhead/logo, then others.
- Never write narrative sentences. Never output markdown.
- If no relevant marks are detected, set visual_elements to [].

═══════════════════════════════════════════════════
REQUIRED JSON SCHEMA
═══════════════════════════════════════════════════

Return ONLY the following JSON structure, filled with extracted values.
Do NOT output any text before or after the JSON.
Do NOT wrap in markdown code fences.
Do NOT add commentary or explanation.

{
  "document_type": "marriage_certificate_brazil",
  "certificate_title": "MARRIAGE CERTIFICATE",
  "country_header": "REPÚBLICA FEDERATIVA DO BRASIL",
  "registry_office_header": "CIVIL REGISTRY OF NATURAL PERSONS",
  "current_names_section_header": "CURRENT NAMES OF SPOUSES AND CPF NUMBERS",
  "spouse_1_current": {
    "current_name": "FULL CURRENT NAME IN CAPS",
    "cpf_number": "000.000.000-00"
  },
  "spouse_2_current": {
    "current_name": "FULL CURRENT NAME IN CAPS",
    "cpf_number": "000.000.000-00"
  },
  "registration_number": "full registration number as it appears",
  "spouse_1": {
    "name_at_marriage_application": "NAME IN CAPS",
    "date_of_birth_day": "DD",
    "date_of_birth_month": "MM",
    "date_of_birth_year": "YYYY",
    "nationality": "Brazilian",
    "marital_status": "Single",
    "municipality_of_birth": "CITY NAME",
    "state": "UF",
    "parents": "FATHER NAME; MOTHER NAME",
    "name_came_to_use": "NAME IN CAPS"
  },
  "spouse_2": {
    "name_at_marriage_application": "NAME IN CAPS",
    "date_of_birth_day": "DD",
    "date_of_birth_month": "MM",
    "date_of_birth_year": "YYYY",
    "nationality": "Brazilian",
    "marital_status": "Single",
    "municipality_of_birth": "CITY NAME",
    "state": "UF",
    "parents": "FATHER NAME; MOTHER NAME",
    "name_came_to_use": "NAME IN CAPS"
  },
  "celebration_date": {
    "full_text": "Date of celebration of marriage or, if applicable, date of stable union conversion registration Month DD, YYYY Day DD Month MM Year YYYY",
    "date": "Month DD, YYYY",
    "day": "DD",
    "month": "MM",
    "year": "YYYY"
  },
  "property_regime": "Full translated regime clause, ALL CAPS where original is all caps.",
  "registration_date": {
    "date": "Month DD, YYYY",
    "day": "DD",
    "month": "MM",
    "year": "YYYY"
  },
  "annotations_endorsements": {
    "text": "Annotations/Endorsements full text including book, page, number, and any rectification notes."
  },
  "voluntary_registry_annotations": "NONE",
  "officer_contact": {
    "cns_number": "NNNNN",
    "officer_role": "Officer of Civil Registry of Natural Persons",
    "location": "City - State",
    "officer_name": "Full Name - Officer",
    "address": "Street address",
    "cep": "postal code digits",
    "phone": "(XX)XXXXXXXX",
    "email": "address@domain.com"
  },
  "certification": {
    "attestation": "The content of this certificate is true. I certify.",
    "date_location": "City - State, Month DD, YYYY.",
    "digital_seal": "seal code",
    "amount_charged": "R$ XX.XX",
    "qr_notice": "Full QR code / materialization notice sentence.",
    "electronic_signature": "Electronically signed by: Full Name - Month DD, YYYY - HH:MM:SS, in accordance with article 19 of Law nº 6.015/73, and article 228-F of the National Code of Standards of the National Corregedoria of Justice of the National Council of Justice - Extrajudicial Forum (CNN/CN/CNJ-Extra)"
  },
  "validation": {
    "cns_clerk_reference": "CNS: NNNNN - Clerk - State - City",
    "validation_url": "https://validation.url",
    "validation_code": "code"
  },
  "visual_elements": [
    {
      "type": "seal | stamp | signature | initials | embossed_seal | dry_seal | watermark | qr_code | barcode | letterhead | handwritten_note | margin_annotation | revenue_stamp | notarial_mark | other_official_mark",
      "description": "Short documentary description, ≤ 12 words",
      "text": "Readable text inside this element, or: illegible / partially legible / empty string if none",
      "page": "1"
    }
  ]
}`;
}

/**
 * User message for the structured extraction call.
 * Kept intentionally brief — all instructions are in the system prompt.
 */
export function buildStructuredUserMessage(): string {
  return 'Extract all fields from this Brazilian marriage certificate into the JSON schema. Return ONLY the JSON object. No text before or after.';
}
