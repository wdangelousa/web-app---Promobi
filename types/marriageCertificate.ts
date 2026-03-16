/**
 * types/marriageCertificate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for a structured Brazilian marriage certificate translation.
 *
 * Field names here are CANONICAL — they must match the JSON schema in
 * lib/structuredTranslationPrompt.ts exactly.
 *
 * Convention: absent fields → empty string "". Never use null.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Sub-schemas ───────────────────────────────────────────────────────────────

export interface SpouseCurrentName {
  /** Full name after marriage, ALL CAPS as on document. */
  current_name: string;
  /** CPF number, e.g. "218.291.308-46". Empty string if absent. */
  cpf_number: string;
}

export interface SpouseData {
  /** Name as it appeared at the time of the marriage application [habilitação]. */
  name_at_marriage_application: string;
  /** Day of birth as a number string, e.g. "21". */
  date_of_birth_day: string;
  /** Month of birth as a number string, e.g. "08". */
  date_of_birth_month: string;
  /** Four-digit year of birth, e.g. "1980". */
  date_of_birth_year: string;
  /** e.g. "Brazilian". */
  nationality: string;
  /** e.g. "Single" | "Widower" | "Married" | "Divorced". */
  marital_status: string;
  /** City name, preserved as-is from the document. */
  municipality_of_birth: string;
  /** State code, e.g. "SP". */
  state: string;
  /** Parent names separated by semicolon, e.g. "FATHER NAME; MOTHER NAME". */
  parents: string;
  /** Name that came to be used [nome que passou a utilizar] after marriage. */
  name_came_to_use: string;
}

export interface CelebrationDate {
  /** Complete translated sentence from the document. */
  full_text: string;
  /** American format date, e.g. "December 10, 2022". */
  date: string;
  /** Day as number string, e.g. "10". */
  day: string;
  /** Month as number string, e.g. "12". */
  month: string;
  /** Four-digit year, e.g. "2022". */
  year: string;
}

export interface RegistrationDate {
  /** American format date, e.g. "December 10, 2022". */
  date: string;
  /** Day as number string. Empty string if not present separately. */
  day: string;
  /** Month as number string. Empty string if not present separately. */
  month: string;
  /** Four-digit year. Empty string if not present separately. */
  year: string;
}

export interface AnnotationsBlock {
  /**
   * Full translated text of the annotations/endorsements section.
   * Includes book, page, number references.
   */
  text: string;
}

export interface OfficerContact {
  /** CNS office number, e.g. "116061". */
  cns_number: string;
  /** Role description, e.g. "Officer of Civil Registry of Natural Persons". */
  officer_role: string;
  /** City and state, e.g. "Guarujá - SP". */
  location: string;
  /** Officer's full name and title, e.g. "Janaina Isa Colombo Vantini - Officer". */
  officer_name: string;
  /** Street address. */
  address: string;
  /** Brazilian postal code (CEP), e.g. "11410010". */
  cep: string;
  /** Phone number. */
  phone: string;
  /** Contact email. */
  email: string;
}

export interface CertificationBlock {
  /** e.g. "The content of this certificate is true. I certify." */
  attestation: string;
  /** e.g. "Guarujá - SP, March 13, 2025." */
  date_location: string;
  /** Digital seal code. */
  digital_seal: string;
  /** Amount in R$, e.g. "R$ 45.02". */
  amount_charged: string;
  /** QR code / materialization notice. Empty string if absent. */
  qr_notice: string;
  /** Full electronic signature line including law reference. */
  electronic_signature: string;
}

export interface ValidationBlock {
  /** e.g. "CNS: 116061 - Clerk - SP - Guarujá". Empty string if absent. */
  cns_clerk_reference: string;
  /** Validation URL. */
  validation_url: string;
  /** Short alphanumeric code. */
  validation_code: string;
}

// ── Documentary visual elements ───────────────────────────────────────────────

/**
 * A single documentary visual/physical mark detected on the document.
 * Used to surface official seals, stamps, signatures, QR codes, watermarks, etc.
 * for institutional review (USCIS, banks, universities).
 *
 * Supported types: letterhead, seal, embossed_seal, stamp, dry_seal, signature,
 * initials, watermark, qr_code, barcode, handwritten_note, margin_annotation,
 * revenue_stamp, notarial_mark, other_official_mark.
 */
export interface VisualElement {
  /** Element type, e.g. "seal" | "signature" | "qr_code" | "watermark". */
  type: string;
  /**
   * Short documentary description (≤ ~12 words).
   * e.g. "Seal of the Civil Registry Office" | "Illegible signature" | "QR code for validation".
   */
  description: string;
  /**
   * Legible text inside this element.
   * Use "illegible" or "partially legible" if unreadable.
   * Empty string if the element carries no text.
   */
  text: string;
  /**
   * Page number where this element appears ("1", "2", …).
   * Empty string if unknown.
   */
  page: string;
}

// ── Root schema ───────────────────────────────────────────────────────────────

export interface MarriageCertificateBrazil {
  /** Always "marriage_certificate_brazil". Used for type-narrowing. */
  document_type: 'marriage_certificate_brazil';

  // ── Header ──────────────────────────────────────────────────────────────────
  certificate_title: string;           // "MARRIAGE CERTIFICATE"
  country_header: string;              // "REPÚBLICA FEDERATIVA DO BRASIL"
  registry_office_header: string;      // "CIVIL REGISTRY OF NATURAL PERSONS"

  // ── Current names & registration ────────────────────────────────────────────
  current_names_section_header: string; // "CURRENT NAMES OF SPOUSES AND CPF NUMBERS"
  spouse_1_current: SpouseCurrentName;
  spouse_2_current: SpouseCurrentName;
  registration_number: string;

  // ── Spouse sections ──────────────────────────────────────────────────────────
  spouse_1: SpouseData;
  spouse_2: SpouseData;

  // ── Dates & property regime ──────────────────────────────────────────────────
  celebration_date: CelebrationDate;
  /** Full translated clause for the property regime. */
  property_regime: string;
  registration_date: RegistrationDate;

  // ── Annotations ──────────────────────────────────────────────────────────────
  annotations_endorsements: AnnotationsBlock;
  /** "NONE" or full annotations text. */
  voluntary_registry_annotations: string;

  // ── Officer / certification / validation ─────────────────────────────────────
  officer_contact: OfficerContact;
  certification: CertificationBlock;
  validation: ValidationBlock;

  // ── Documentary visual elements ───────────────────────────────────────────────
  /**
   * Optional list of documentary visual/physical marks detected on the document.
   * Absence (or empty array) does NOT affect validation of the certificate.
   */
  visual_elements?: VisualElement[];
}
