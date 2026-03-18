/**
 * types/identityTravelRecord.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema for structured identity/travel records.
 *
 * Covered first release:
 *   - passport biographic pages
 *   - identity cards
 *   - driver licenses
 *   - visa pages
 *   - entry/exit pages
 *   - I-94 style travel summaries
 *   - travel document excerpts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { VisualElement } from '@/types/marriageCertificate';
export type { VisualElement };

export type IdentityTravelSubtype =
  | 'passport_biographic_page'
  | 'identity_card'
  | 'driver_license'
  | 'visa_page'
  | 'entry_exit_page'
  | 'i94_travel_summary'
  | 'travel_document_excerpt'
  | 'unknown';

export interface IdentityTravelMetaItem {
  label: string;
  value: string;
}

export interface IdentityTravelEvent {
  event_type: string;
  date: string;
  location: string;
  class_or_status: string;
  notes: string;
}

export interface IdentityPhotoRegion {
  present: boolean;
  description: string;
  caption: string;
  page: string;
}

export interface IdentityMachineReadableRegion {
  region_type: 'mrz' | 'barcode' | 'qr_code' | 'i94_code' | 'other';
  description: string;
  lines: string[];
  page: string;
}

export interface IdentityTravelSignatory {
  name: string;
  role: string;
  authority: string;
}

export interface IdentityTravelRecord {
  document_type: 'identity_travel_record';
  document_subtype: IdentityTravelSubtype;

  document_title: string;
  issuing_country: string;
  issuing_authority: string;

  surname: string;
  given_names: string;
  full_name_line: string;
  nationality: string;
  date_of_birth: string;
  place_of_birth: string;
  sex: string;

  document_number: string;
  secondary_identifier: string;
  issue_date: string;
  expiration_date: string;

  visa_category: string;
  visa_entries: string;
  admission_class: string;
  admit_until_date: string;
  port_of_entry: string;
  entry_date: string;
  exit_date: string;

  metadata_grid: IdentityTravelMetaItem[];
  travel_events: IdentityTravelEvent[];
  photo_region: IdentityPhotoRegion | null;
  machine_readable_regions: IdentityMachineReadableRegion[];

  page_set_notes: string[];
  body_notes: string[];

  signatories: IdentityTravelSignatory[];
  authority_footer: string;
  attachments_or_references: string[];
  visual_elements?: VisualElement[];

  orientation: 'portrait' | 'landscape' | 'unknown';
  page_count: number | null;
}
