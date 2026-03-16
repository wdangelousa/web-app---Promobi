/**
 * lib/birthCertificateRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic HTML renderer for structured Brazilian birth certificate data.
 *
 * Input:  BirthCertificateBrazil (validated JSON from previewStructuredKit)
 * Output: Self-contained HTML string, ready for Gotenberg/Chromium rendering.
 *
 * Rendering modes (driven by pageCount):
 *   pageCount === 1 or undefined → single-page layout (most birth certs)
 *   pageCount >= 2               → multi-page (annotations + certification on page 2)
 *
 * Orientation:
 *   Brazilian birth certificates are almost always portrait.
 *   'portrait' | 'unknown' | undefined → portrait (default, no override)
 *   'landscape' → landscape hint (rare, but supported)
 *
 * Design goals:
 *   - Layout mirrors the marriage cert renderer for visual consistency
 *   - Child info is visually prominent (name large, birth date/place clear)
 *   - Parents side by side in standard mode (mirrors compact spouse layout)
 *   - Certification / officer / validation in clean labeled sections
 *   - Deterministic: same input → identical output
 *   - Resilient: missing/empty fields render as em-dash; never throws
 *   - Isolated: pure function, no side effects, no DB/network calls
 *
 * This module does NOT affect the legacy pipeline, Workbench,
 * generateDeliveryKit.ts, translationHtmlSanitizer.ts, or the API response.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  BirthCertificateBrazil,
  BirthParentData,
  BirthCertCertificationBlock,
  BirthCertOfficerContact,
  BirthCertValidation,
  VisualElement,
} from '@/types/birthCertificate';

// ── Public types ──────────────────────────────────────────────────────────────

export interface BirthCertRenderOptions {
  pageCount?: number;
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

function nonEmpty(value: string | undefined | null): boolean {
  return (value ?? '').trim().length > 0;
}

function renderField(label: string, value: string | undefined | null): string {
  return (
    `<div class="field">` +
    `<span class="label">${escapeHtml(label)}</span>` +
    `<span class="value">${normalizeValue(value)}</span>` +
    `</div>`
  );
}

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

// ── Visual elements section ───────────────────────────────────────────────────

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
};

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
  watermark:            6,
  margin_annotation:    7,
  handwritten_note:     7,
  revenue_stamp:        8,
  notarial_mark:        8,
  initials:             9,
  other_official_mark:  10,
};

function toDisplayLabel(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatVisualLine(el: VisualElement): string {
  const rawType = (el.type || 'other_official_mark').toLowerCase().replace(/[-\s]+/g, '_');
  const label   = VISUAL_LABEL_MAP[rawType] ?? toDisplayLabel(rawType);
  const desc    = (el.description || '').trim();
  const isLegibilityNote = el.text === 'illegible' || el.text === 'partially legible';
  let content: string;
  if (desc) {
    const alreadyNoted = desc.toLowerCase().includes('illegible') || desc.toLowerCase().includes('partially legible');
    content = (isLegibilityNote && !alreadyNoted) ? `${desc} (${el.text})` : desc;
  } else if (el.text) {
    content = el.text.trim();
  } else {
    content = 'present';
  }
  return `${label}: ${content}`;
}

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

// ── Document header ───────────────────────────────────────────────────────────

function renderDocumentHeader(data: BirthCertificateBrazil): string {
  const regNum = nonEmpty(data.registration_number)
    ? `<div class="reg-number">Registration No.: ${escapeHtml(data.registration_number)}</div>`
    : '';
  return (
    `<div class="doc-header">` +
    `<div class="country">${escapeHtml(data.country_header || '')}</div>` +
    `<div class="registry">${escapeHtml(data.registry_office_header || '')}</div>` +
    `<div class="cert-title">${escapeHtml(data.certificate_title || 'BIRTH CERTIFICATE')}</div>` +
    regNum +
    `</div>`
  );
}

// ── Child information section ─────────────────────────────────────────────────

function renderChildSection(data: BirthCertificateBrazil): string {
  const timePart = nonEmpty(data.time_of_birth)
    ? ` at ${data.time_of_birth}` : '';
  const dobLine = nonEmpty(data.date_of_birth)
    ? `${data.date_of_birth}${timePart}`
    : '';

  return (
    `<div class="section child-section">` +
    `<div class="section-title">Child</div>` +
    `<div class="child-name">${escapeHtml(data.child_name || '')}</div>` +
    renderField('Date of Birth', dobLine) +
    renderField('Place of Birth', data.place_of_birth) +
    renderField('Gender', data.gender) +
    renderField('Nationality', data.nationality) +
    `</div>`
  );
}

// ── Parent block ──────────────────────────────────────────────────────────────

function renderParentBlock(label: string, parent: BirthParentData): string {
  if (!parent) return '';
  return renderSection(label, [
    renderField('Name', parent.name),
    renderField('Nationality', parent.nationality),
    renderField('Date of Birth', parent.date_of_birth),
    renderField('CPF', parent.cpf),
    renderField('Parents', parent.parents),
  ].join(''));
}

// ── Parents side-by-side ──────────────────────────────────────────────────────

function renderParentsSideBySide(data: BirthCertificateBrazil): string {
  const motherInner = [
    renderField('Name', data.mother?.name),
    renderField('Nationality', data.mother?.nationality),
    renderField('Date of Birth', data.mother?.date_of_birth),
    renderField('CPF', data.mother?.cpf),
    renderField('Parents', data.mother?.parents),
  ].join('');

  const fatherInner = [
    renderField('Name', data.father?.name),
    renderField('Nationality', data.father?.nationality),
    renderField('Date of Birth', data.father?.date_of_birth),
    renderField('CPF', data.father?.cpf),
    renderField('Parents', data.father?.parents),
  ].join('');

  return (
    `<div class="section">` +
    `<div class="parents-grid">` +
    `<div class="parent-col">` +
    `<div class="section-title">Mother</div>` +
    motherInner +
    `</div>` +
    `<div class="parent-col">` +
    `<div class="section-title">Father</div>` +
    fatherInner +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

// ── Declarant section ─────────────────────────────────────────────────────────

function renderDeclarantSection(data: BirthCertificateBrazil): string {
  const hasDeclarant = nonEmpty(data.declarant_name) || nonEmpty(data.declarant_relationship);
  const hasRegDate   = nonEmpty(data.registration_date);
  if (!hasDeclarant && !hasRegDate) return '';
  return renderSection('Registration', [
    nonEmpty(data.declarant_name) ? renderField('Declarant', data.declarant_name) : '',
    nonEmpty(data.declarant_relationship) ? renderField('Relationship', data.declarant_relationship) : '',
    nonEmpty(data.registration_date) ? renderField('Registration Date', data.registration_date) : '',
  ].join(''));
}

// ── Annotations ───────────────────────────────────────────────────────────────

function renderAnnotationsSection(data: BirthCertificateBrazil): string {
  return renderSection('Annotations and Endorsements', [
    renderField('Annotations / Endorsements', data.annotations_endorsements?.text),
    renderField('Voluntary Registry Annotations', data.voluntary_registry_annotations),
  ].join(''));
}

// ── Certification ─────────────────────────────────────────────────────────────

function renderCertificationSection(cert: BirthCertCertificationBlock): string {
  if (!cert) return '';
  const attestationHtml = nonEmpty(cert.attestation)
    ? `<div class="attestation">${escapeHtml(cert.attestation)}</div>`
    : '';
  const signatureHtml = nonEmpty(cert.electronic_signature)
    ? `<div class="signature-line">${escapeHtml(cert.electronic_signature)}</div>`
    : '';
  return renderSection('Certification', [
    attestationHtml,
    renderField('Date / Location', cert.date_location),
    renderField('Digital Seal', cert.digital_seal),
    renderField('Amount Charged', cert.amount_charged),
    nonEmpty(cert.qr_notice) ? renderField('QR Notice', cert.qr_notice) : '',
    signatureHtml,
  ].join(''));
}

// ── Officer contact ───────────────────────────────────────────────────────────

function renderOfficerSection(oc: BirthCertOfficerContact): string {
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

// ── Validation ────────────────────────────────────────────────────────────────

function renderValidationSection(val: BirthCertValidation): string {
  if (!val) return '';
  const hasContent = nonEmpty(val.cns_clerk_reference) || nonEmpty(val.validation_url) || nonEmpty(val.validation_code);
  if (!hasContent) return '';
  return renderSection('Validation', [
    nonEmpty(val.cns_clerk_reference) ? renderField('CNS Clerk Reference', val.cns_clerk_reference) : '',
    nonEmpty(val.validation_url) ? renderField('Validation URL', val.validation_url) : '',
    nonEmpty(val.validation_code) ? renderField('Validation Code', val.validation_code) : '',
  ].join(''));
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

@page { size: letter; }

.page {
  width: 100%;
  padding: 0.15in 0.8in 1.2in 0.8in;
}

.page-break {
  break-after: page;
  page-break-after: always;
}

.doc-header {
  text-align: center;
  margin-bottom: 8pt;
  border-bottom: 1.5pt solid #000;
  padding-bottom: 6pt;
}
.doc-header .country  { font-size: 7.5pt; color: #444; margin-bottom: 1pt; }
.doc-header .registry { font-size: 7.5pt; color: #444; margin-bottom: 3pt; }
.doc-header .cert-title { font-size: 12pt; font-weight: bold; letter-spacing: 0.07em; }
.doc-header .reg-number { font-size: 7.5pt; color: #555; margin-top: 3pt; }

.child-section {
  text-align: center;
  margin-bottom: 8pt;
  padding-bottom: 6pt;
  border-bottom: 0.75pt solid #ccc;
}

.child-name {
  font-size: 13pt;
  font-weight: bold;
  letter-spacing: 0.04em;
  margin: 4pt 0;
}

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

/* ── Parents side by side ── */
.parents-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 6pt;
  border: 0.5pt solid #ccc;
}
.parent-col { padding: 3pt; }
.parent-col .section-title {
  background: #f0f0f0;
  border: none;
  border-bottom: 0.5pt solid #ccc;
  padding: 1pt 3pt;
  margin-bottom: 2pt;
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

.vm-list { padding: 0; margin: 0; }
.vm-item {
  margin-bottom: 2pt;
  word-break: break-word;
  line-height: 1.3;
  font-size: 8pt;
}

@media print {
  .page-break { break-after: page; page-break-after: always; }
}
`;

// ── Main renderer ─────────────────────────────────────────────────────────────

/**
 * Renders a BirthCertificateBrazil into a deterministic HTML string.
 *
 * pageCount === 1 or undefined → single page (all content)
 * pageCount >= 2 → page 1 = child + parents + declarant;
 *                  page 2 = annotations + certification + officer + validation
 */
export function renderBirthCertificateHtml(
  data: BirthCertificateBrazil,
  options: BirthCertRenderOptions = {},
): string {
  try {
    const { pageCount } = options;
    const splitPages = typeof pageCount === 'number' && pageCount >= 2;

    let bodyContent: string;

    if (splitPages) {
      const page1 = [
        renderDocumentHeader(data),
        renderChildSection(data),
        renderParentsSideBySide(data),
        renderDeclarantSection(data),
      ].join('');

      const page2 = [
        renderAnnotationsSection(data),
        renderCertificationSection(data.certification),
        renderOfficerSection(data.officer_contact),
        renderValidationSection(data.validation),
        renderVisualElements(data.visual_elements),
      ].join('');

      bodyContent =
        `<div class="page">${page1}</div>` +
        renderPageBreak() +
        `<div class="page">${page2}</div>`;
    } else {
      const allContent = [
        renderDocumentHeader(data),
        renderChildSection(data),
        renderParentsSideBySide(data),
        renderDeclarantSection(data),
        renderAnnotationsSection(data),
        renderCertificationSection(data.certification),
        renderOfficerSection(data.officer_contact),
        renderValidationSection(data.validation),
        renderVisualElements(data.visual_elements),
      ].join('');
      bodyContent = `<div class="page">${allContent}</div>`;
    }

    return (
      `<!DOCTYPE html>\n` +
      `<html lang="en">\n` +
      `<head>\n` +
      `  <meta charset="UTF-8" />\n` +
      `  <title>${escapeHtml(data.certificate_title || 'Birth Certificate')}</title>\n` +
      `  <style>${RENDERER_CSS}</style>\n` +
      `</head>\n` +
      `<body>\n` +
      `  ${bodyContent}\n` +
      `</body>\n` +
      `</html>`
    );
  } catch {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><style>body{font-family:Arial;font-size:11pt;}</style></head>
<body><p>[Birth certificate rendering error — see server logs]</p></body>
</html>`;
  }
}
