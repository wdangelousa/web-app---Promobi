/**
 * lib/marriageCertRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic HTML renderer for structured Brazilian marriage certificate data.
 *
 * Input:  MarriageCertificateBrazil (validated JSON from structuredPipeline.ts)
 * Output: Self-contained HTML string, ready for Gotenberg/Chromium rendering.
 *
 * Rendering modes (driven by pageCount):
 *   pageCount === 1    → compact-one-page: aggressive grid layout, spouses
 *                        side-by-side, minimal spacing. All content fits 1 page.
 *   pageCount >= 2     → standard-multipage: content split across pages with an
 *                        explicit page break. Spouses stacked vertically.
 *   pageCount undefined → standard-single: all content in one block, no forced
 *                        break, moderate layout (conservative fallback).
 *
 * Design goals:
 *   - Deterministic: same input always produces identical output.
 *   - Pagination 1:1: respects original document page count.
 *   - Resilient: missing/empty fields render as em-dash; never throws.
 *   - Isolated: pure function, no side effects, no DB/network calls.
 *
 * This module does NOT affect the legacy pipeline, Workbench,
 * generateDeliveryKit.ts, translationHtmlSanitizer.ts, or the API response.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  MarriageCertificateBrazil,
  SpouseData,
  CelebrationDate,
  RegistrationDate,
  OfficerContact,
  CertificationBlock,
  ValidationBlock,
  VisualElement,
} from '@/types/marriageCertificate';

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * pageCount: number of pages in the *original* source document.
 *   === 1     → compact-one-page mode (grid form layout, side-by-side spouses)
 *   >= 2      → standard-multipage mode (explicit page break)
 *   undefined → standard-single mode (single block, conservative fallback)
 *
 * orientation: detected orientation of the original source document.
 *   'portrait'  → standard US Letter portrait rendering (current behavior)
 *   'landscape' → TODO: implement landscape-aware layout for certificates/diplomas
 *   'unknown'   → treat as portrait (conservative fallback)
 *   undefined   → treat as portrait (conservative fallback)
 */
export interface MarriageCertRenderOptions {
  pageCount?: number;
  /**
   * Orientation of the original source document.
   * Currently accepted but unused by the renderer — stored here for future use.
   *
   * TODO(landscape): When implementing landscape document classes (e.g. course
   * certificates, diplomas, naturalization certificates), use this field to:
   *   1. Switch the CSS @page rule: `size: letter landscape`
   *   2. Adjust the .page min-height and padding for landscape proportions
   *   3. Redesign grid layouts for wider, shorter pages
   * Keep 'portrait' as the default — never change current rendering unless
   * orientation === 'landscape' AND the document class explicitly requires it.
   */
  orientation?: 'portrait' | 'landscape' | 'unknown';
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

function escapeHtml(value: string | undefined | null): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeValue(value: string | undefined | null): string {
  const v = (value ?? '').trim();
  return v ? escapeHtml(v) : '&mdash;';
}

/** Standard label/value row (used in standard modes). */
function renderField(label: string, value: string | undefined | null): string {
  return (
    `<div class="field">` +
    `<span class="label">${escapeHtml(label)}</span>` +
    `<span class="value">${normalizeValue(value)}</span>` +
    `</div>`
  );
}

/** Standard titled section (used in standard modes). */
function renderSection(title: string, innerHtml: string): string {
  return (
    `<div class="section">` +
    `<div class="section-title">${escapeHtml(title)}</div>` +
    innerHtml +
    `</div>`
  );
}

function renderPageBreak(): string {
  return '<div class="page-break"></div>';
}

// Documentary marks must never be truncated — full text required for USCIS fidelity.

// ── Documentary marks — label normalization and priority ──────────────────────

/** Maps raw extraction type values to normalized display labels. */
const VISUAL_LABEL_MAP: Record<string, string> = {
  letterhead:           'Letterhead',
  seal:                 'Seal',
  embossed_seal:        'Embossed seal',
  dry_seal:             'Dry seal',
  stamp:                'Stamp',
  digital_seal:         'Digital seal',
  signature:            'Signature',
  electronic_signature: 'Electronic signature',
  initials:             'Initials',
  watermark:            'Watermark',
  qr_code:              'QR code',
  barcode:              'Barcode',
  handwritten_note:     'Handwritten note',
  margin_annotation:    'Margin annotation',
  revenue_stamp:        'Revenue stamp',
  notarial_mark:        'Notarial mark',
  other_official_mark:  'Other official mark',
  official_logo:        'Official logo',
  logo:                 'Official logo',
};

/** Lower number = higher rendering priority. */
const VISUAL_TYPE_PRIORITY: Record<string, number> = {
  signature:            1,
  electronic_signature: 1,
  seal:                 2,
  digital_seal:         2,
  embossed_seal:        2,
  dry_seal:             2,
  stamp:                3,
  qr_code:              4,
  barcode:              4,
  letterhead:           5,
  official_logo:        5,
  logo:                 5,
  watermark:            6,
  margin_annotation:    7,
  handwritten_note:     7,
  revenue_stamp:        8,
  notarial_mark:        8,
  initials:             9,
  other_official_mark:  10,
};

/** Converts an unknown raw type string to a title-cased display fallback. */
function toDisplayLabel(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Builds a single documentary mark line in the format: "Label: content".
 * Uses normalized label from VISUAL_LABEL_MAP. Description is the content —
 * it must NOT repeat the type name (enforced by the prompt).
 * Appends legibility status if present and not already in description.
 * Falls back to text, then "present".
 */
function formatVisualLine(el: VisualElement): string {
  const rawType = (el.type || 'other_official_mark').toLowerCase().replace(/[-\s]+/g, '_');
  const label   = VISUAL_LABEL_MAP[rawType] ?? toDisplayLabel(rawType);
  const desc    = (el.description || '').trim();
  const isLegibilityNote = el.text === 'illegible' || el.text === 'partially legible';

  let content: string;
  if (desc) {
    const descLower = desc.toLowerCase();
    const alreadyNoted = descLower.includes('illegible') || descLower.includes('partially legible');
    content = (isLegibilityNote && !alreadyNoted) ? `${desc} (${el.text})` : desc;
  } else if (el.text) {
    content = el.text.trim();
  } else {
    content = 'present';
  }

  return `${label}: ${content}`;
}

/**
 * Standard-mode documentary marks section.
 * Priority-sorted; all items shown; full descriptions — no truncation.
 */
function renderVisualElements(elements: VisualElement[] | undefined): string {
  if (!elements || elements.length === 0) return '';
  const sorted = [...elements].sort((a, b) => {
    const pa = VISUAL_TYPE_PRIORITY[(a.type || '').toLowerCase()] ?? 99;
    const pb = VISUAL_TYPE_PRIORITY[(b.type || '').toLowerCase()] ?? 99;
    return pa - pb;
  });
  const items = sorted.map(el => (
    `<div class="vm-item">\u2022 ${escapeHtml(formatVisualLine(el))}</div>`
  )).join('');
  return renderSection('Documentary Marks', `<div class="vm-list">${items}</div>`);
}

/**
 * Compact-mode documentary marks section.
 * Priority-sorted; all items shown; full descriptions — no truncation.
 */
function renderCompactVisualElements(elements: VisualElement[] | undefined): string {
  if (!elements || elements.length === 0) return '';
  const sorted = [...elements]
    .sort((a, b) => {
      const pa = VISUAL_TYPE_PRIORITY[(a.type || '').toLowerCase()] ?? 99;
      const pb = VISUAL_TYPE_PRIORITY[(b.type || '').toLowerCase()] ?? 99;
      return pa - pb;
    });
  const items = sorted.map(el => (
    `<div class="vm-item">\u2022 ${escapeHtml(formatVisualLine(el))}</div>`
  )).join('');
  return (
    `<div class="section">` +
    `<div class="section-title">Documentary Marks</div>` +
    `<div class="vm-list">${items}</div>` +
    `</div>`
  );
}

function formatDateParts(day: string, month: string, year: string): string {
  const MONTHS = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const m = parseInt(month, 10);
  if (day && month && year && m >= 1 && m <= 12) {
    return `${MONTHS[m]} ${parseInt(day, 10)}, ${year}`;
  }
  return '';
}

// ── Standard mode section renderers ──────────────────────────────────────────
// Used when pageCount === undefined (single block) or pageCount >= 2 (split).

function renderDocumentHeader(data: MarriageCertificateBrazil): string {
  const regNum = data.registration_number
    ? `<div class="reg-number">Registration No.: ${escapeHtml(data.registration_number)}</div>`
    : '';
  return (
    `<div class="doc-header">` +
    `<div class="country">${escapeHtml(data.country_header || '')}</div>` +
    `<div class="registry">${escapeHtml(data.registry_office_header || '')}</div>` +
    `<div class="cert-title">${escapeHtml(data.certificate_title || 'MARRIAGE CERTIFICATE')}</div>` +
    regNum +
    `</div>`
  );
}

function renderCurrentNamesSection(data: MarriageCertificateBrazil): string {
  const header = data.current_names_section_header || 'Current Names of Spouses and CPF Numbers';
  return renderSection(header, [
    renderField('Spouse 1 — Current Name', data.spouse_1_current?.current_name),
    renderField('Spouse 1 — CPF', data.spouse_1_current?.cpf_number),
    renderField('Spouse 2 — Current Name', data.spouse_2_current?.current_name),
    renderField('Spouse 2 — CPF', data.spouse_2_current?.cpf_number),
  ].join(''));
}

function renderSpouseBlock(label: string, spouse: SpouseData): string {
  if (!spouse) return '';
  const dob =
    formatDateParts(spouse.date_of_birth_day, spouse.date_of_birth_month, spouse.date_of_birth_year) ||
    [spouse.date_of_birth_day, spouse.date_of_birth_month, spouse.date_of_birth_year]
      .filter(Boolean).join('/');
  const birthplace = [spouse.municipality_of_birth, spouse.state].filter(Boolean).join(' \u2013 ');
  return renderSection(label, [
    renderField('Name at Marriage Application', spouse.name_at_marriage_application),
    renderField('Date of Birth', dob),
    renderField('Nationality', spouse.nationality),
    renderField('Marital Status', spouse.marital_status),
    renderField('Municipality of Birth', birthplace),
    renderField('Parents', spouse.parents),
    renderField('Name Came to Use', spouse.name_came_to_use),
  ].join(''));
}

function renderCelebrationDateBlock(cd: CelebrationDate): string {
  if (!cd) return '';
  const date = cd.date || formatDateParts(cd.day, cd.month, cd.year) || '';
  const fullTextHtml = cd.full_text
    ? `<div class="celebration-full-text">${escapeHtml(cd.full_text)}</div>`
    : '';
  return renderSection('Celebration of Marriage', [
    renderField('Date of Celebration', date),
    fullTextHtml,
  ].join(''));
}

function renderPropertyRegimeBlock(regime: string | undefined): string {
  return renderSection(
    'Property Regime',
    `<div class="field"><span class="value">${normalizeValue(regime)}</span></div>`,
  );
}

function renderRegistrationDateBlock(rd: RegistrationDate): string {
  if (!rd) return '';
  const date = rd.date || formatDateParts(rd.day, rd.month, rd.year) || '';
  return renderSection('Marriage Registration Date', renderField('Registered On', date));
}

function renderAnnotationsBlock(data: MarriageCertificateBrazil): string {
  return renderSection('Annotations and Endorsements', [
    renderField('Annotations / Endorsements', data.annotations_endorsements?.text),
    renderField('Voluntary Registry Annotations', data.voluntary_registry_annotations),
  ].join(''));
}

function renderCertificationBlock(cert: CertificationBlock): string {
  if (!cert) return '';
  const attestationHtml = cert.attestation
    ? `<div class="attestation">${escapeHtml(cert.attestation)}</div>`
    : '';
  const signatureHtml = cert.electronic_signature
    ? `<div class="signature-line">${escapeHtml(cert.electronic_signature)}</div>`
    : '';
  return renderSection('Certification', [
    attestationHtml,
    renderField('Date / Location', cert.date_location),
    renderField('Digital Seal', cert.digital_seal),
    renderField('Amount Charged', cert.amount_charged),
    cert.qr_notice ? renderField('QR Notice', cert.qr_notice) : '',
    signatureHtml,
  ].join(''));
}

function renderOfficerBlock(oc: OfficerContact): string {
  if (!oc) return '';
  return renderSection('Registry Office Contact', [
    renderField('CNS Number', oc.cns_number),
    renderField('Role', oc.officer_role),
    renderField('Location', oc.location),
    renderField('Officer', oc.officer_name),
    renderField('Address', oc.address),
    renderField('CEP', oc.cep),
    renderField('Phone', oc.phone),
    renderField('Email', oc.email),
  ].join(''));
}

function renderValidationBlock(val: ValidationBlock): string {
  if (!val) return '';
  const hasContent = val.cns_clerk_reference || val.validation_url || val.validation_code;
  if (!hasContent) return '';
  return renderSection('Validation', [
    val.cns_clerk_reference ? renderField('CNS Clerk Reference', val.cns_clerk_reference) : '',
    val.validation_url ? renderField('Validation URL', val.validation_url) : '',
    val.validation_code ? renderField('Validation Code', val.validation_code) : '',
  ].join(''));
}

// ── Compact mode renderers (pageCount === 1) ──────────────────────────────────
// Each function produces tighter HTML using CSS grid for side-by-side layout.
// Priority: fit content in one page. Spacing is sacrificed over overflow.

/** Compact current names: Name + CPF in a 4-column grid row per spouse. */
function renderCompactCurrentNamesAndReg(data: MarriageCertificateBrazil): string {
  const header = data.current_names_section_header || 'Current Names of Spouses and CPF Numbers';
  const regNumHtml = data.registration_number
    ? `<div class="cform cform-2 reg-row">` +
      `<span class="cl">Registration No.:</span>` +
      `<span class="cv">${escapeHtml(data.registration_number)}</span>` +
      `</div>`
    : '';
  return (
    `<div class="section">` +
    `<div class="section-title">${escapeHtml(header)}</div>` +
    `<div class="cform cform-4">` +
    `<span class="cl">Spouse 1:</span><span class="cv">${normalizeValue(data.spouse_1_current?.current_name)}</span>` +
    `<span class="cl">CPF:</span><span class="cv">${normalizeValue(data.spouse_1_current?.cpf_number)}</span>` +
    `<span class="cl">Spouse 2:</span><span class="cv">${normalizeValue(data.spouse_2_current?.current_name)}</span>` +
    `<span class="cl">CPF:</span><span class="cv">${normalizeValue(data.spouse_2_current?.cpf_number)}</span>` +
    `</div>` +
    regNumHtml +
    `</div>`
  );
}

/** Inner compact field grid for one spouse. Used inside the side-by-side layout. */
function renderCompactSpouseInner(spouse: SpouseData): string {
  if (!spouse) return '';
  const dob =
    formatDateParts(spouse.date_of_birth_day, spouse.date_of_birth_month, spouse.date_of_birth_year) ||
    [spouse.date_of_birth_day, spouse.date_of_birth_month, spouse.date_of_birth_year]
      .filter(Boolean).join('/');
  const birthplace = [spouse.municipality_of_birth, spouse.state].filter(Boolean).join(' \u2013 ');
  return (
    `<div class="cform cform-2">` +
    `<span class="cl">Name (Application)</span><span class="cv">${normalizeValue(spouse.name_at_marriage_application)}</span>` +
    `<span class="cl">Date of Birth</span><span class="cv">${normalizeValue(dob)}</span>` +
    `<span class="cl">Nationality</span><span class="cv">${normalizeValue(spouse.nationality)}</span>` +
    `<span class="cl">Marital Status</span><span class="cv">${normalizeValue(spouse.marital_status)}</span>` +
    `<span class="cl">Birthplace</span><span class="cv">${normalizeValue(birthplace)}</span>` +
    `<span class="cl">Parents</span><span class="cv">${normalizeValue(spouse.parents)}</span>` +
    `<span class="cl">Name Came to Use</span><span class="cv">${normalizeValue(spouse.name_came_to_use)}</span>` +
    `</div>`
  );
}

/**
 * Compact spouses: both spouses rendered side by side in a 2-column grid.
 * Reduces 14 vertical rows to 7 — the most impactful single compaction.
 */
function renderCompactSpouses(data: MarriageCertificateBrazil): string {
  return (
    `<div class="section">` +
    `<div class="spouses-grid">` +
    `<div class="spouse-col">` +
    `<div class="section-title">Spouse 1</div>` +
    renderCompactSpouseInner(data.spouse_1) +
    `</div>` +
    `<div class="spouse-col">` +
    `<div class="section-title">Spouse 2</div>` +
    renderCompactSpouseInner(data.spouse_2) +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

/** Compact dates + property regime in two compact rows. */
function renderCompactDatesAndRegime(data: MarriageCertificateBrazil): string {
  const celebDate = data.celebration_date?.date ||
    formatDateParts(data.celebration_date?.day ?? '', data.celebration_date?.month ?? '', data.celebration_date?.year ?? '') || '';
  const regDate = data.registration_date?.date ||
    formatDateParts(data.registration_date?.day ?? '', data.registration_date?.month ?? '', data.registration_date?.year ?? '') || '';
  return (
    `<div class="section">` +
    `<div class="section-title">Dates and Property Regime</div>` +
    `<div class="cform cform-4">` +
    `<span class="cl">Celebration Date</span><span class="cv">${normalizeValue(celebDate)}</span>` +
    `<span class="cl">Registration Date</span><span class="cv">${normalizeValue(regDate)}</span>` +
    `</div>` +
    `<div class="cform cform-2" style="margin-top:1pt">` +
    `<span class="cl">Property Regime</span><span class="cv">${normalizeValue(data.property_regime)}</span>` +
    `</div>` +
    `</div>`
  );
}

/** Compact annotations in a bordered box. */
function renderCompactAnnotations(data: MarriageCertificateBrazil): string {
  const annotText = data.annotations_endorsements?.text || '';
  const voluntaryText = data.voluntary_registry_annotations || '';
  return (
    `<div class="section">` +
    `<div class="section-title">Annotations and Endorsements</div>` +
    `<div class="annotations-box">` +
    `<div class="annot-row"><span class="cl">Annotations:</span><span class="cv">${normalizeValue(annotText)}</span></div>` +
    `<div class="annot-row"><span class="cl">Voluntary:</span><span class="cv">${normalizeValue(voluntaryText)}</span></div>` +
    `</div>` +
    `</div>`
  );
}

/** Compact certification fields (used inside bottom 2-col grid). */
function renderCompactCertInner(cert: CertificationBlock): string {
  if (!cert) return '';
  const attestationHtml = cert.attestation
    ? `<span class="attestation-compact" style="grid-column:1/-1">${escapeHtml(cert.attestation)}</span>`
    : '';
  const signatureHtml = cert.electronic_signature
    ? `<span class="sig-compact" style="grid-column:1/-1">${escapeHtml(cert.electronic_signature)}</span>`
    : '';
  return (
    `<div class="cform cform-2">` +
    attestationHtml +
    `<span class="cl">Date / Location</span><span class="cv">${normalizeValue(cert.date_location)}</span>` +
    `<span class="cl">Digital Seal</span><span class="cv">${normalizeValue(cert.digital_seal)}</span>` +
    `<span class="cl">Amount</span><span class="cv">${normalizeValue(cert.amount_charged)}</span>` +
    (cert.qr_notice ? `<span class="cl">QR</span><span class="cv">${escapeHtml(cert.qr_notice)}</span>` : '') +
    signatureHtml +
    `</div>`
  );
}

/** Compact officer fields (used inside bottom 2-col grid). */
function renderCompactOfficerInner(oc: OfficerContact): string {
  if (!oc) return '';
  return (
    `<div class="cform cform-2">` +
    `<span class="cl">CNS</span><span class="cv">${normalizeValue(oc.cns_number)}</span>` +
    `<span class="cl">Role</span><span class="cv">${normalizeValue(oc.officer_role)}</span>` +
    `<span class="cl">Location</span><span class="cv">${normalizeValue(oc.location)}</span>` +
    `<span class="cl">Officer</span><span class="cv">${normalizeValue(oc.officer_name)}</span>` +
    `<span class="cl">Address</span><span class="cv">${normalizeValue(oc.address)}</span>` +
    `<span class="cl">CEP</span><span class="cv">${normalizeValue(oc.cep)}</span>` +
    `<span class="cl">Phone</span><span class="cv">${normalizeValue(oc.phone)}</span>` +
    `<span class="cl">Email</span><span class="cv">${normalizeValue(oc.email)}</span>` +
    `</div>`
  );
}

/**
 * Compact bottom section: certification and officer contact side by side.
 * Reduces ~15 vertical field rows to ~8 by using a 2-column grid.
 */
function renderCompactBottomSection(data: MarriageCertificateBrazil): string {
  const hasCert = !!data.certification;
  const hasOfficer = !!data.officer_contact;
  if (!hasCert && !hasOfficer) return '';
  return (
    `<div class="section">` +
    `<div class="bottom-grid">` +
    (hasCert
      ? `<div><div class="section-title">Certification</div>${renderCompactCertInner(data.certification)}</div>`
      : '') +
    (hasOfficer
      ? `<div><div class="section-title">Registry Office Contact</div>${renderCompactOfficerInner(data.officer_contact)}</div>`
      : '') +
    `</div>` +
    `</div>`
  );
}

/** Compact validation in a 4-column grid. */
function renderCompactValidation(val: ValidationBlock): string {
  if (!val) return '';
  const hasContent = val.cns_clerk_reference || val.validation_url || val.validation_code;
  if (!hasContent) return '';
  return (
    `<div class="section">` +
    `<div class="section-title">Validation</div>` +
    `<div class="cform cform-4">` +
    (val.cns_clerk_reference ? `<span class="cl">CNS Clerk</span><span class="cv">${escapeHtml(val.cns_clerk_reference)}</span>` : '') +
    (val.validation_url ? `<span class="cl">URL</span><span class="cv">${escapeHtml(val.validation_url)}</span>` : '') +
    (val.validation_code ? `<span class="cl">Code</span><span class="cv">${escapeHtml(val.validation_code)}</span>` : '') +
    `</div>` +
    `</div>`
  );
}

/** Assembles all compact sections for the one-page mode. */
function renderCompactOnePage(data: MarriageCertificateBrazil): string {
  return [
    renderDocumentHeader(data),
    renderCompactCurrentNamesAndReg(data),
    renderCompactSpouses(data),
    renderCompactDatesAndRegime(data),
    renderCompactAnnotations(data),
    renderCompactBottomSection(data),
    renderCompactValidation(data.validation),
    renderCompactVisualElements(data.visual_elements),
  ].join('');
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const RENDERER_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 8.5pt;
  line-height: 1.35;
  color: #1a1a1a;
  background: #fff;
}

/* Paper: US Letter, matching the official generateDeliveryKit.ts PDF_ENGINE.
   With preferCssPageSize=false (Gotenberg setting), physical dimensions come
   from Gotenberg's paperWidth/paperHeight params, not from @page. */
@page { size: letter; }

/* Standard page layout.
   padding matches the Gotenberg margin values (1.8/1.2/0.8/0.8) so the
   structured preview and the official kit are visually comparable. */
.page {
  width: 100%;
  padding: 0.15in 0.8in 1.2in 0.8in;
}

/* ── Compact one-page overrides ─────────────────────────────────────────────
   Applied via .compact-page class when pageCount === 1.
   Drastically reduces internal padding because the Gotenberg physical margins
   already provide the required white space. The CSS padding would double them
   and waste ~202pt of the available 677pt content height.
   Priority: fit > spacing. */
.compact-page {
  padding: 0.12in 0.08in 0.08in 0.08in;
  font-size: 7pt;
  line-height: 1.22;
}
.compact-page .doc-header {
  margin-bottom: 3pt;
  padding-bottom: 3pt;
}
.compact-page .doc-header .cert-title { font-size: 10pt; }
.compact-page .doc-header .country,
.compact-page .doc-header .registry,
.compact-page .doc-header .reg-number { font-size: 6.5pt; }
.compact-page .section {
  margin-bottom: 2.5pt;
  page-break-inside: auto;
  break-inside: auto;
}
.compact-page .section-title {
  font-size: 5.5pt;
  margin-bottom: 1.5pt;
  padding-bottom: 1pt;
}
.compact-page .letterhead-img {
  max-height: 0.5in;
  margin-bottom: 5pt;
}

/* Page break: forces a new PDF page. */
.page-break {
  break-after: page;
  page-break-after: always;
}

/* Letterhead image: constrained height prevents it from pushing content off-page.
   Has zero visual effect when no .letterhead-img element is present. */
.letterhead-img {
  display: block;
  width: 100%;
  max-height: 1.0in;
  margin-bottom: 12pt;
  break-inside: avoid;
  page-break-inside: avoid;
}

/* ── Standard mode styles ────────────────────────────────────────────────── */
.doc-header {
  text-align: center;
  margin-bottom: 8pt;
  border-bottom: 1.5pt solid #000;
  padding-bottom: 6pt;
}
.doc-header .country { font-size: 7.5pt; color: #444; margin-bottom: 1pt; }
.doc-header .registry { font-size: 7.5pt; color: #444; margin-bottom: 3pt; }
.doc-header .cert-title { font-size: 12pt; font-weight: bold; letter-spacing: 0.07em; }
.doc-header .reg-number { font-size: 7.5pt; color: #555; margin-top: 3pt; }

.section {
  margin-bottom: 6pt;
  page-break-inside: avoid;
  break-inside: avoid;
}
.section-title {
  font-size: 6.5pt;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #333;
  border-bottom: 0.5pt solid #999;
  padding-bottom: 2pt;
  margin-bottom: 3pt;
}

.field {
  display: flex;
  gap: 4pt;
  margin-bottom: 1.5pt;
  font-size: 8pt;
}
.label {
  font-weight: bold;
  min-width: 110pt;
  flex-shrink: 0;
  color: #333;
}
.value { flex: 1; word-break: break-word; }

.celebration-full-text {
  font-size: 7pt;
  font-style: italic;
  color: #555;
  margin-top: 2pt;
  padding-top: 2pt;
  border-top: 0.5pt solid #e0e0e0;
  line-height: 1.4;
}
.attestation {
  font-style: italic;
  font-size: 8pt;
  margin-bottom: 3pt;
  color: #111;
}
.signature-line {
  font-size: 6.5pt;
  color: #444;
  margin-top: 3pt;
  font-style: italic;
  border-top: 0.5pt solid #ccc;
  padding-top: 2pt;
  line-height: 1.4;
}

/* ── Compact grid primitives ─────────────────────────────────────────────── */

/* Base compact form grid */
.cform {
  display: grid;
  column-gap: 3pt;
  row-gap: 0.5pt;
}
/* 2-column: label | value */
.cform-2 { grid-template-columns: auto 1fr; }
/* 4-column: label | value | label | value */
.cform-4 { grid-template-columns: auto 1fr auto 1fr; }

/* Compact label / value spans */
.cl {
  font-weight: bold;
  color: #444;
  white-space: nowrap;
  padding-right: 2pt;
  align-self: start;
  font-size: inherit;
}
.cv {
  word-break: break-word;
  align-self: start;
  font-size: inherit;
}

.reg-row { margin-top: 1.5pt; }

/* Spouses: two columns, side by side — biggest vertical space saver */
.spouses-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 5pt;
  border: 0.5pt solid #ccc;
}
.spouse-col { padding: 2pt; }
.spouse-col .section-title {
  background: #f0f0f0;
  border: none;
  border-bottom: 0.5pt solid #ccc;
  padding: 1pt 3pt;
  margin-bottom: 2pt;
}

/* Bottom: certification + officer side by side */
.bottom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 6pt;
}

/* Annotations bordered box */
.annotations-box {
  border: 0.5pt solid #ccc;
  padding: 2pt;
  background: #fafafa;
}
.annot-row {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 3pt;
  margin-bottom: 1pt;
}

/* Compact certification elements */
.attestation-compact {
  font-style: italic;
  font-size: inherit;
  margin-bottom: 2pt;
  color: #111;
}
.sig-compact {
  font-size: 6pt;
  font-style: italic;
  color: #555;
  border-top: 0.5pt solid #ccc;
  padding-top: 1.5pt;
  margin-top: 2pt;
  word-break: break-word;
  line-height: 1.3;
}

/* ── Documentary Marks section ─────────────────────────────────────────────
   Bullet-list: • Label: content
   Priority-sorted; compact mode caps at 5 items; descriptions truncated. */
.vm-list { padding: 0; margin: 0; }
.vm-item {
  margin-bottom: 2pt;
  word-break: break-word;
  line-height: 1.3;
  font-size: 8pt;
}
.compact-page .vm-item {
  font-size: 6.5pt;
  line-height: 1.18;
  margin-bottom: 0.8pt;
}

@media print {
  .page-break { break-after: page; page-break-after: always; }
}
`;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Renders a validated MarriageCertificateBrazil into a deterministic HTML string.
 *
 * Mode selection by pageCount:
 *   1         → compact-one-page (side-by-side spouses, grid layout, minimal padding)
 *   >= 2      → standard-multipage (vertical stacking, explicit page break)
 *   undefined → standard-single (vertical stacking, no page break, conservative)
 */
export function renderMarriageCertificateHtml(
  data: MarriageCertificateBrazil,
  options: MarriageCertRenderOptions = {},
): string {
  const { pageCount } = options;

  const isCompactOnePage = typeof pageCount === 'number' && pageCount === 1;
  const splitPages       = typeof pageCount === 'number' && pageCount >= 2;

  let bodyContent: string;

  if (isCompactOnePage) {
    // Compact form layout: aggressive space reduction, spouses side-by-side.
    bodyContent = `<div class="page compact-page">${renderCompactOnePage(data)}</div>`;

  } else if (splitPages) {
    // Standard multi-page: page 1 = identification/spouses/dates,
    //                       page 2 = annotations/certification/officer/validation.
    const page1Content = [
      renderDocumentHeader(data),
      renderCurrentNamesSection(data),
      renderSpouseBlock('Spouse 1', data.spouse_1),
      renderSpouseBlock('Spouse 2', data.spouse_2),
      renderCelebrationDateBlock(data.celebration_date),
      renderPropertyRegimeBlock(data.property_regime),
      renderRegistrationDateBlock(data.registration_date),
    ].join('');

    const page2Content = [
      renderAnnotationsBlock(data),
      renderCertificationBlock(data.certification),
      renderOfficerBlock(data.officer_contact),
      renderValidationBlock(data.validation),
      renderVisualElements(data.visual_elements),
    ].join('');

    bodyContent =
      `<div class="page">${page1Content}</div>` +
      renderPageBreak() +
      `<div class="page">${page2Content}</div>`;

  } else {
    // Standard single (pageCount undefined): all content sequentially, no forced break.
    const allContent = [
      renderDocumentHeader(data),
      renderCurrentNamesSection(data),
      renderSpouseBlock('Spouse 1', data.spouse_1),
      renderSpouseBlock('Spouse 2', data.spouse_2),
      renderCelebrationDateBlock(data.celebration_date),
      renderPropertyRegimeBlock(data.property_regime),
      renderRegistrationDateBlock(data.registration_date),
      renderAnnotationsBlock(data),
      renderCertificationBlock(data.certification),
      renderOfficerBlock(data.officer_contact),
      renderValidationBlock(data.validation),
      renderVisualElements(data.visual_elements),
    ].join('');
    bodyContent = `<div class="page">${allContent}</div>`;
  }

  return (
    `<!DOCTYPE html>\n` +
    `<html lang="en">\n` +
    `<head>\n` +
    `  <meta charset="UTF-8" />\n` +
    `  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n` +
    `  <title>${escapeHtml(data.certificate_title || 'Marriage Certificate')}</title>\n` +
    `  <style>${RENDERER_CSS}</style>\n` +
    `</head>\n` +
    `<body>\n` +
    `  ${bodyContent}\n` +
    `</body>\n` +
    `</html>`
  );
}
