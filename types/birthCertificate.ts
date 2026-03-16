/**
 * types/birthCertificate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for a structured Brazilian birth certificate translation.
 *
 * Covers: certidão de nascimento, birth certificates issued by civil registry
 * offices (cartório de registro civil de pessoas naturais) in Brazil.
 *
 * Design goals:
 *   - Mirrors the structural completeness of MarriageCertificateBrazil
 *   - Covers full parent data (name, nationality, DOB, CPF, grandparents)
 *   - Certification, officer contact, and validation blocks match the
 *     marriage cert pattern — same registry office format
 *   - orientation + page_count populated by pipeline, NOT by Claude
 *   - Never hallucinate — absent fields use empty string
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Reuse VisualElement from marriageCertificate.ts for consistency.
import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

// ── Sub-schemas ───────────────────────────────────────────────────────────────

/**
 * Parent data block (mother or father).
 * All fields except name use empty string when absent.
 */
export interface BirthParentData {
  /** Full name of the parent as it appears on the document. */
  name: string;
  /** Nationality, e.g. "Brazilian". Empty string if absent. */
  nationality: string;
  /** Date of birth in American format, e.g. "March 15, 1970". Empty string if absent. */
  date_of_birth: string;
  /** CPF number. Empty string if absent. */
  cpf: string;
  /** Grandparent names (as a single text string, may list both paternal grandparents). Empty string if absent. */
  parents: string;
}

/**
 * Certification block — mirrors CertificationBlock in marriageCertificate.ts.
 * All fields use empty string when absent.
 */
export interface BirthCertCertificationBlock {
  /** Attestation clause, e.g. "I certify that this is a true copy...". */
  attestation: string;
  /** Date and location of the certificate, e.g. "São Paulo, January 10, 2024". */
  date_location: string;
  /** Digital seal reference or number. */
  digital_seal: string;
  /** Amount charged for the certificate. */
  amount_charged: string;
  /** QR code notice or URL. */
  qr_notice: string;
  /** Electronic signature text. */
  electronic_signature: string;
}

/**
 * Registry office contact block — mirrors OfficerContact in marriageCertificate.ts.
 * All fields use empty string when absent.
 */
export interface BirthCertOfficerContact {
  /** CNS (Cadastro Nacional de Serventias) number. */
  cns_number: string;
  /** Role of the signing officer, e.g. "Official of the Registry". */
  officer_role: string;
  /** Location / city. */
  location: string;
  /** Name of the officer. */
  officer_name: string;
  /** Registry office address. */
  address: string;
  /** Postal code. */
  cep: string;
  /** Phone number. */
  phone: string;
  /** Email address. */
  email: string;
}

/**
 * Validation block — mirrors ValidationBlock in marriageCertificate.ts.
 * All fields use empty string when absent.
 */
export interface BirthCertValidation {
  /** CNS clerk or operator reference. */
  cns_clerk_reference: string;
  /** URL for online validation. */
  validation_url: string;
  /** Validation alphanumeric code. */
  validation_code: string;
}

// ── Root schema ───────────────────────────────────────────────────────────────

export interface BirthCertificateBrazil {
  /** Always "birth_certificate_brazil". Used for type-narrowing. */
  document_type: 'birth_certificate_brazil';

  // ── Document identity ──────────────────────────────────────────────────────

  /** e.g. "FEDERATIVE REPUBLIC OF BRAZIL". Empty string if absent. */
  country_header: string;

  /** Registry office name, e.g. "Civil Registry of Natural Persons — 1st Notary of...". */
  registry_office_header: string;

  /** e.g. "BIRTH CERTIFICATE". */
  certificate_title: string;

  /** Certificate registration or serial number. Empty string if absent. */
  registration_number: string;

  // ── Child information ──────────────────────────────────────────────────────

  /** Full name of the child as it appears on the document. */
  child_name: string;

  /**
   * Date of birth in American format, e.g. "March 15, 2001".
   * Empty string if absent.
   */
  date_of_birth: string;

  /** Time of birth, e.g. "14:30". Empty string if absent. */
  time_of_birth: string;

  /** Place of birth, e.g. "São Paulo, São Paulo". Empty string if absent. */
  place_of_birth: string;

  /** Gender, e.g. "Male", "Female". Empty string if absent. */
  gender: string;

  /** Nationality, e.g. "Brazilian". Empty string if absent. */
  nationality: string;

  // ── Parents ────────────────────────────────────────────────────────────────

  /** Mother's information. */
  mother: BirthParentData;

  /** Father's information. Empty name when not listed on the document. */
  father: BirthParentData;

  // ── Declarant ─────────────────────────────────────────────────────────────

  /** Name of the person who registered the birth. Empty string if absent. */
  declarant_name: string;

  /** Relationship to the child, e.g. "Mother", "Father", "Hospital Officer". */
  declarant_relationship: string;

  /** Date of registration in American format, e.g. "March 20, 2001". Empty string if absent. */
  registration_date: string;

  // ── Annotations ───────────────────────────────────────────────────────────

  /** Annotations or endorsements block. Text uses empty string when absent. */
  annotations_endorsements: { text: string };

  /** Voluntary registry annotations. Empty string if absent. */
  voluntary_registry_annotations: string;

  // ── Certification, officer, validation ────────────────────────────────────

  /** Certification block. */
  certification: BirthCertCertificationBlock;

  /** Registry office contact information. */
  officer_contact: BirthCertOfficerContact;

  /** Validation block. */
  validation: BirthCertValidation;

  // ── Documentary marks ──────────────────────────────────────────────────────

  /**
   * Visual/physical marks detected: institutional seals, stamps, signatures,
   * QR codes, watermarks, official logos, etc.
   * Empty array or absent if no relevant marks are detected.
   */
  visual_elements?: VisualElement[];

  // ── Layout metadata (populated by pipeline, NOT by Claude) ────────────────

  /**
   * Orientation of the original document.
   * Set by the pipeline from PDF page dimensions — Claude always outputs "unknown".
   */
  orientation: 'portrait' | 'landscape' | 'unknown';

  /**
   * Page count of the original document.
   * Set by the pipeline from PDF metadata — Claude always outputs null.
   */
  page_count: number | null;
}
