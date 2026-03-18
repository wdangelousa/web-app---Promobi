/**
 * lib/academicRecordGeneralPrompt.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Prompts for structured extraction of broader academic record documents.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function buildAcademicRecordGeneralSystemPrompt(): string {
  return `You are a precision document extraction specialist for Promobidocs, a certified immigration translation service.

TASK: Extract all relevant fields from an academic record document into the exact JSON schema below.

═══════════════════════════════════════════════════
DOCUMENT CLASS
═══════════════════════════════════════════════════

This prompt is for:
- enrollment certificates
- declarations from educational institutions
- course completion statements
- academic letters
- syllabi / ementa excerpts
- academic records with subject/grade tables

Typical sections:
- institution header
- student/program identity
- period or semester information
- subject/grade tables (when present)
- declaration body paragraphs
- issuance/certification block
- signatures/seals and registrar footer

═══════════════════════════════════════════════════
EXTRACTION RULES
═══════════════════════════════════════════════════

TRANSLATION:
- Translate labels and narrative content faithfully to English.
- Preserve proper nouns exactly: institution names, student names, locations.
- Preserve numbers and IDs exactly.

FIDELITY:
- Do not summarize.
- Do not omit sections due to confidentiality wording.
- Do not invent missing data.
- Use empty string "" for absent scalar fields, [] for absent arrays.

SUBTYPE:
Set document_subtype to one of:
- transcript_style_record
- academic_declaration_letter
- enrollment_statement
- completion_statement
- syllabus_excerpt
- academic_record_table
- unknown

TABLES:
- If a subject/grade table exists, extract all rows into subject_grade_table.
- Keep columns faithful: code, subject, hours_or_credits, grade, status, period.
- If no table exists, set subject_grade_table to [].

PERIOD LAYOUT:
- If terms/semesters/periods exist, populate period_layout with ordered entries.
- If absent, set period_layout to [].

SIGNATURES:
- Include named signatories in signatories.
- If none identified, signatories = [].

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
  "document_type": "academic_record_general",
  "document_subtype": "transcript_style_record | academic_declaration_letter | enrollment_statement | completion_statement | syllabus_excerpt | academic_record_table | unknown",

  "document_title": "Document title or empty string",
  "issuing_institution": "Institution name or empty string",
  "institution_unit": "Faculty/department/unit or empty string",
  "issue_date": "Issue date or empty string",
  "issue_location": "Issue location or empty string",

  "student_name": "Student full name or empty string",
  "student_id": "Student ID/registration number or empty string",
  "student_national_id": "CPF/passport/national ID or empty string",
  "program_name": "Program name or empty string",
  "course_name": "Course name or empty string",
  "degree_level": "Degree/level or empty string",

  "academic_period": "Academic period line or empty string",
  "enrollment_status": "Enrollment/academic status or empty string",
  "enrollment_start_date": "Start date or empty string",
  "enrollment_end_date": "End date or empty string",

  "issuance_purpose": "Purpose/declaration objective line or empty string",

  "metadata_grid": [
    {
      "label": "Field label",
      "value": "Field value"
    }
  ],

  "period_layout": [
    {
      "period": "Semester/term/year or empty string",
      "start_date": "Start date or empty string",
      "end_date": "End date or empty string",
      "status": "Status or empty string",
      "notes": "Notes or empty string"
    }
  ],

  "subject_grade_table": [
    {
      "code": "Code or empty string",
      "subject": "Subject name",
      "hours_or_credits": "Hours/credits or empty string",
      "grade": "Grade or empty string",
      "status": "Status or empty string",
      "period": "Period or empty string"
    }
  ],

  "body_paragraphs": [
    "Body paragraph"
  ],

  "issuance_block_text": "Issuance/certification block or empty string",

  "signatories": [
    {
      "name": "Signatory name",
      "role": "Signatory role",
      "unit": "Signatory unit/department",
      "contact": "Contact line or empty string"
    }
  ],

  "registrar_footer": "Registrar/academic office footer text or empty string",
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

export function buildAcademicRecordGeneralUserMessage(): string {
  return 'Extract all fields from this academic record document into the JSON schema. Return ONLY the JSON object.';
}
