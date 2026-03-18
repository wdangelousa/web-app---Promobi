/**
 * types/corporateBusinessRecord.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for structured corporate/business document extraction.
 *
 * Covered first release:
 *   - articles of organization/incorporation
 *   - operating agreements (simple excerpts)
 *   - bylaws (simple excerpts)
 *   - annual reports
 *   - certificates of good standing
 *   - business licenses
 *   - corporate resolutions
 *   - business registration documents
 *   - company extracts from official registries
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

export type CorporateBusinessDocumentSubtype =
  | 'articles_of_incorporation'
  | 'articles_of_organization'
  | 'operating_agreement_excerpt'
  | 'bylaws_excerpt'
  | 'annual_report'
  | 'certificate_of_good_standing'
  | 'business_license'
  | 'corporate_resolution'
  | 'business_registration'
  | 'official_registry_extract'
  | 'unknown';

export interface CorporateKeyValue {
  label: string;
  value: string;
}

export interface CorporateOfficerMemberEntry {
  name: string;
  role: string;
  id_reference: string;
  term_or_date: string;
  notes: string;
}

export interface CorporateNumberedSection {
  number: string;
  heading: string;
  body: string;
}

export interface CorporateSignatory {
  name: string;
  role: string;
  authority: string;
  date_line: string;
}

export interface CorporateBusinessRecord {
  document_type: 'corporate_business_record';
  document_subtype: CorporateBusinessDocumentSubtype;

  document_title: string;
  document_subtitle: string;

  issuing_authority: string;
  authority_jurisdiction: string;
  authority_reference: string;

  entity_legal_name: string;
  entity_trade_name: string;
  entity_type: string;
  jurisdiction_of_formation: string;
  registration_number: string;
  tax_id: string;
  registered_address: string;
  principal_address: string;
  status: string;
  standing: string;

  filing_date: string;
  effective_date: string;
  expiration_date: string;
  reporting_period: string;
  document_number: string;

  entity_metadata: CorporateKeyValue[];
  filing_information: CorporateKeyValue[];
  officers_managers_members: CorporateOfficerMemberEntry[];
  numbered_sections: CorporateNumberedSection[];
  body_paragraphs: string[];
  registry_notes: string[];
  attachments_or_references: string[];

  certification_language: string;
  signatories: CorporateSignatory[];
  visual_elements?: VisualElement[];

  orientation: 'portrait' | 'landscape' | 'unknown';
  page_count: number | null;
}
