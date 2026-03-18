/**
 * lib/corporateBusinessRecordRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic premium renderer for corporate/business records.
 *
 * Supports:
 *   - registry-style official records/extracts
 *   - certificate-style corporate extracts
 *   - sectioned legal/business governance documents
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  CorporateBusinessRecord,
  CorporateKeyValue,
  CorporateNumberedSection,
  CorporateOfficerMemberEntry,
  CorporateSignatory,
  VisualElement,
} from '@/types/corporateBusinessRecord';

export interface CorporateBusinessRecordRenderOptions {
  pageCount?: number;
  orientation?: 'portrait' | 'landscape' | 'unknown';
}

function escapeHtml(value: string | undefined | null): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nonEmpty(value: string | undefined | null): string | null {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : null;
}

function splitParagraphs(text: string | undefined | null): string[] {
  return (text ?? '')
    .split(/\n{2,}|\r\n\r\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isRegistryStyle(data: CorporateBusinessRecord): boolean {
  return (
    data.document_subtype === 'certificate_of_good_standing' ||
    data.document_subtype === 'business_license' ||
    data.document_subtype === 'business_registration' ||
    data.document_subtype === 'official_registry_extract' ||
    data.document_subtype === 'annual_report'
  );
}

function renderHeader(data: CorporateBusinessRecord, registryStyle: boolean): string {
  const authority = nonEmpty(data.issuing_authority);
  const authorityJurisdiction = nonEmpty(data.authority_jurisdiction);
  const authorityReference = nonEmpty(data.authority_reference);
  const title = nonEmpty(data.document_title) ?? 'CORPORATE RECORD';
  const subtitle = nonEmpty(data.document_subtitle);
  const subtype = nonEmpty(data.document_subtype)?.replace(/_/g, ' ');

  return `
<header class="doc-header ${registryStyle ? 'registry-header' : 'governance-header'}">
  ${authority ? `<div class="authority-name">${escapeHtml(authority)}</div>` : ''}
  ${authorityJurisdiction ? `<div class="authority-jurisdiction">${escapeHtml(authorityJurisdiction)}</div>` : ''}
  ${authorityReference ? `<div class="authority-reference">${escapeHtml(authorityReference)}</div>` : ''}
  <div class="title-row">
    <div class="doc-title">${escapeHtml(title)}</div>
    ${subtype ? `<div class="doc-subtype">${escapeHtml(subtype.toUpperCase())}</div>` : ''}
  </div>
  ${subtitle ? `<div class="doc-subtitle">${escapeHtml(subtitle)}</div>` : ''}
  <div class="header-rule"></div>
</header>`;
}

function collectEntityRows(data: CorporateBusinessRecord): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Entity Legal Name', data.entity_legal_name],
    ['Entity Trade Name', data.entity_trade_name],
    ['Entity Type', data.entity_type],
    ['Jurisdiction of Formation', data.jurisdiction_of_formation],
    ['Registration Number', data.registration_number],
    ['Tax ID', data.tax_id],
    ['Registered Address', data.registered_address],
    ['Principal Address', data.principal_address],
    ['Status', data.status],
    ['Standing', data.standing],
  ];

  (data.entity_metadata ?? []).forEach((entry: CorporateKeyValue) => {
    rows.push([entry.label, entry.value]);
  });

  return rows.filter(([label, value]) => nonEmpty(label) && nonEmpty(value));
}

function collectFilingRows(data: CorporateBusinessRecord): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Filing Date', data.filing_date],
    ['Effective Date', data.effective_date],
    ['Expiration Date', data.expiration_date],
    ['Reporting Period', data.reporting_period],
    ['Document Number', data.document_number],
  ];

  (data.filing_information ?? []).forEach((entry: CorporateKeyValue) => {
    rows.push([entry.label, entry.value]);
  });

  return rows.filter(([label, value]) => nonEmpty(label) && nonEmpty(value));
}

function renderKvTable(
  sectionTitle: string,
  rows: Array<[string, string]>,
  cssClass: string,
): string {
  if (rows.length === 0) return '';

  const htmlRows = rows
    .map(([label, value]) => {
      return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
    })
    .join('');

  return `
<section class="section ${cssClass}">
  <h2 class="section-title">${escapeHtml(sectionTitle)}</h2>
  <table class="kv-table">
    <tbody>${htmlRows}</tbody>
  </table>
</section>`;
}

function renderOfficers(entries: CorporateOfficerMemberEntry[]): string {
  const rows = (entries ?? [])
    .filter((entry) => nonEmpty(entry.name) || nonEmpty(entry.role) || nonEmpty(entry.id_reference))
    .map((entry) => {
      const name = nonEmpty(entry.name) ?? '&mdash;';
      const role = nonEmpty(entry.role) ?? '&mdash;';
      const idRef = nonEmpty(entry.id_reference) ?? '&mdash;';
      const term = nonEmpty(entry.term_or_date) ?? '&mdash;';
      const notes = nonEmpty(entry.notes) ?? '&mdash;';
      return `<tr>
  <td>${escapeHtml(name)}</td>
  <td>${escapeHtml(role)}</td>
  <td>${escapeHtml(idRef)}</td>
  <td>${escapeHtml(term)}</td>
  <td>${escapeHtml(notes)}</td>
</tr>`;
    })
    .join('');

  if (!rows) return '';

  return `
<section class="section officers-section">
  <h2 class="section-title">OFFICERS / MANAGERS / MEMBERS</h2>
  <table class="grid-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Role</th>
        <th>ID / Reference</th>
        <th>Term / Date</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function renderNumberedSections(sections: CorporateNumberedSection[]): string {
  const valid = (sections ?? [])
    .filter((section) => nonEmpty(section.number) || nonEmpty(section.heading) || nonEmpty(section.body))
    .map((section, index) => {
      const number = nonEmpty(section.number) ?? String(index + 1);
      const heading = nonEmpty(section.heading);
      const body = nonEmpty(section.body);
      const bodyParagraphs = body
        ? splitParagraphs(body).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')
        : '<p>&mdash;</p>';

      return `<article class="legal-clause">
  <div class="clause-heading">
    <span class="clause-number">${escapeHtml(number)}</span>
    ${heading ? `<span class="clause-title">${escapeHtml(heading)}</span>` : ''}
  </div>
  <div class="clause-body">${bodyParagraphs}</div>
</article>`;
    })
    .join('');

  if (!valid) return '';

  return `
<section class="section legal-sections">
  <h2 class="section-title">NUMBERED ARTICLES / CLAUSES</h2>
  <div class="legal-clause-list">${valid}</div>
</section>`;
}

function renderBodyParagraphs(paragraphs: string[]): string {
  const valid = (paragraphs ?? []).map((line) => line.trim()).filter(Boolean);
  if (valid.length === 0) return '';

  const html = valid.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  return `
<section class="section body-section">
  <h2 class="section-title">DOCUMENT TEXT</h2>
  <div class="body-paragraphs">${html}</div>
</section>`;
}

function renderListSection(title: string, lines: string[], cssClass: string): string {
  const valid = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  if (valid.length === 0) return '';
  const listItems = valid.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  return `
<section class="section ${cssClass}">
  <h2 class="section-title">${escapeHtml(title)}</h2>
  <ul class="line-list">${listItems}</ul>
</section>`;
}

function renderCertificationAndSignatures(data: CorporateBusinessRecord): string {
  const certLanguage = nonEmpty(data.certification_language);
  const signatories = (data.signatories ?? [])
    .filter((entry: CorporateSignatory) => nonEmpty(entry.name) || nonEmpty(entry.role))
    .map((entry) => {
      return `<div class="sig-card">
  <div class="sig-line"></div>
  ${nonEmpty(entry.name) ? `<div class="sig-name">${escapeHtml(entry.name)}</div>` : ''}
  ${nonEmpty(entry.role) ? `<div class="sig-role">${escapeHtml(entry.role)}</div>` : ''}
  ${nonEmpty(entry.authority) ? `<div class="sig-authority">${escapeHtml(entry.authority)}</div>` : ''}
  ${nonEmpty(entry.date_line) ? `<div class="sig-date">${escapeHtml(entry.date_line)}</div>` : ''}
</div>`;
    })
    .join('');

  if (!certLanguage && !signatories) return '';

  return `
<section class="section certification-section">
  <h2 class="section-title">CERTIFICATION / SIGNATURES</h2>
  ${certLanguage ? `<div class="cert-language">${escapeHtml(certLanguage)}</div>` : ''}
  ${signatories ? `<div class="sig-grid">${signatories}</div>` : ''}
</section>`;
}

function renderVisualElements(elements: VisualElement[] | undefined): string {
  if (!elements || elements.length === 0) return '';
  const rows = elements
    .map((el) => {
      const type = escapeHtml(el.type ?? 'other_official_mark');
      const description = escapeHtml(el.description ?? '');
      const text = nonEmpty(el.text);
      const page = nonEmpty(el.page);
      return `<tr>
  <td>${type}</td>
  <td>${description}${text ? ` — <em>${escapeHtml(text)}</em>` : ''}</td>
  <td>${page ? escapeHtml(page) : ''}</td>
</tr>`;
    })
    .join('');

  return `
<section class="section marks-section">
  <h2 class="section-title">DOCUMENTARY MARKS</h2>
  <table class="grid-table marks-table">
    <thead><tr><th>Type</th><th>Description</th><th>Page</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function buildCss(orientation: 'portrait' | 'landscape', registryStyle: boolean): string {
  // Margins are enforced globally by the translated-page safe-area policy.
  const pageRule =
    orientation === 'landscape'
      ? '@page { size: letter landscape; }'
      : '@page { size: letter portrait; }';

  return `
${pageRule}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  color: #111827;
  font-size: 10.5pt;
  line-height: 1.36;
}
.document { width: 100%; padding: 0.04in; }
.doc-header { margin-bottom: 12px; }
.registry-header { border: 1px solid #d1d5db; background: #fbfcfd; padding: 10px 12px; border-radius: 6px; }
.governance-header { padding: 2px 0 0; }
.authority-name { font-size: 11pt; font-weight: 700; letter-spacing: 0.2px; }
.authority-jurisdiction, .authority-reference { font-size: 8.9pt; color: #374151; margin-top: 2px; }
.title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-top: 9px; }
.doc-title { font-size: ${registryStyle ? '12.6pt' : '12pt'}; font-weight: 700; letter-spacing: 0.35px; text-transform: uppercase; }
.doc-subtype { font-size: 8.2pt; font-weight: 700; color: #1f2937; border: 1px solid #d1d5db; border-radius: 999px; padding: 2px 10px; }
.doc-subtitle { margin-top: 4px; font-size: 9.2pt; color: #374151; }
.header-rule { border-top: 1.1px solid #111827; margin-top: 8px; }

.section { margin-top: 10px; page-break-inside: avoid; }
.section-title {
  margin: 0 0 5px;
  font-size: 9.2pt;
  font-weight: 700;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: #1f2937;
}

.kv-table, .grid-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.1pt;
}
.kv-table th, .kv-table td, .grid-table th, .grid-table td {
  border: 0.8px solid #d1d5db;
  padding: 5px 7px;
  vertical-align: top;
}
.kv-table th, .grid-table th {
  background: #f9fafb;
  font-weight: 700;
  text-align: left;
}
.kv-table th { width: 32%; }

.line-list { margin: 0; padding-left: 18px; }
.line-list li { margin: 0 0 4px; }

.legal-sections { page-break-inside: auto; }
.legal-clause-list { display: block; }
.legal-clause {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 9px 10px;
  margin-bottom: 8px;
  break-inside: avoid-page;
  page-break-inside: avoid;
}
.clause-heading { display: flex; gap: 9px; align-items: baseline; margin-bottom: 4px; }
.clause-number { font-weight: 700; min-width: 70px; white-space: nowrap; }
.clause-title { font-weight: 700; }
.clause-body p { margin: 0 0 6px; text-align: justify; }
.clause-body p:last-child { margin-bottom: 0; }

.body-paragraphs p { margin: 0 0 7px; text-align: justify; }

.cert-language {
  border: 1px solid #d1d5db;
  background: #fafafa;
  padding: 9px 10px;
  margin-bottom: 12px;
}
.sig-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.sig-card { padding-top: 22px; }
.sig-line { border-top: 1px solid #111827; margin-bottom: 6px; }
.sig-name { font-weight: 700; font-size: 9.6pt; }
.sig-role, .sig-authority, .sig-date { font-size: 8.8pt; color: #374151; margin-top: 2px; }

.marks-table td:nth-child(1) { width: 24%; }
.marks-table td:nth-child(3) { width: 10%; text-align: center; }

.layout-landscape .kv-table th { width: 24%; }
.layout-landscape .sig-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;
}

export function renderCorporateBusinessRecordHtml(
  data: CorporateBusinessRecord,
  options: CorporateBusinessRecordRenderOptions = {},
): string {
  const orientation =
    options.orientation === 'landscape' ? 'landscape' : 'portrait';
  const registryStyle = isRegistryStyle(data);

  const entityRows = collectEntityRows(data);
  const filingRows = collectFilingRows(data);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>${buildCss(orientation, registryStyle)}</style>
</head>
<body class="layout-${orientation}">
  <main class="document">
    ${renderHeader(data, registryStyle)}
    ${renderKvTable('ENTITY INFORMATION', entityRows, 'entity-section')}
    ${renderKvTable('FILING INFORMATION', filingRows, 'filing-section')}
    ${renderOfficers(data.officers_managers_members)}
    ${renderNumberedSections(data.numbered_sections)}
    ${renderBodyParagraphs(data.body_paragraphs)}
    ${renderListSection('REGISTRY NOTES', data.registry_notes, 'notes-section')}
    ${renderListSection('ATTACHMENTS / REFERENCES', data.attachments_or_references, 'attachments-section')}
    ${renderCertificationAndSignatures(data)}
    ${renderVisualElements(data.visual_elements)}
  </main>
</body>
</html>`;

  return html;
}
