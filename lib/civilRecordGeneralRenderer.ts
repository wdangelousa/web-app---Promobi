/**
 * lib/civilRecordGeneralRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic premium renderer for general civil records.
 *
 * Styles supported:
 *   - certificate style
 *   - registry extract style
 *   - judgment/order-derived style
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  CivilRecordGeneral,
  CivilRecordKeyValue,
  CivilRecordPersonEntry,
  VisualElement,
} from '@/types/civilRecordGeneral';

export interface CivilRecordGeneralRenderOptions {
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

function normalize(value: string | undefined | null): string {
  const v = nonEmpty(value);
  return v ? escapeHtml(v) : '&mdash;';
}

function inferStyle(
  data: CivilRecordGeneral,
): 'certificate_style' | 'registry_extract_style' | 'judgment_order_style' {
  if (data.document_style === 'certificate_style') return 'certificate_style';
  if (data.document_style === 'registry_extract_style') return 'registry_extract_style';
  if (data.document_style === 'judgment_order_style') return 'judgment_order_style';

  if (data.document_subtype === 'civil_registry_extract') return 'registry_extract_style';
  if (data.document_subtype === 'divorce_judgment_or_decree') return 'judgment_order_style';
  return 'certificate_style';
}

function renderHeader(
  data: CivilRecordGeneral,
  style: 'certificate_style' | 'registry_extract_style' | 'judgment_order_style',
): string {
  const authority = nonEmpty(data.issuing_authority);
  const registryOffice = nonEmpty(data.registry_office);
  const jurisdiction = nonEmpty(data.jurisdiction);
  const title = nonEmpty(data.document_title) ?? 'CIVIL RECORD';
  const subtype = nonEmpty(data.document_subtype)?.replace(/_/g, ' ');
  const eventType = nonEmpty(data.event_type);

  return `
<header class="doc-header ${style}">
  ${authority ? `<div class="authority">${escapeHtml(authority)}</div>` : ''}
  ${registryOffice ? `<div class="registry">${escapeHtml(registryOffice)}</div>` : ''}
  ${jurisdiction ? `<div class="jurisdiction">${escapeHtml(jurisdiction)}</div>` : ''}
  <div class="title-row">
    <div class="title">${escapeHtml(title)}</div>
    ${subtype ? `<div class="subtype">${escapeHtml(subtype.toUpperCase())}</div>` : ''}
  </div>
  ${eventType ? `<div class="event-type"><strong>Event:</strong> ${escapeHtml(eventType)}</div>` : ''}
  <div class="rule"></div>
</header>`;
}

function renderKvTable(
  title: string,
  rows: Array<[string, string | undefined | null]>,
  cssClass: string,
): string {
  const valid = rows.filter(([label, value]) => nonEmpty(label) && nonEmpty(value));
  if (valid.length === 0) return '';

  const htmlRows = valid
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value ?? '')}</td></tr>`)
    .join('');

  return `
<section class="section ${cssClass}">
  <h2 class="section-title">${escapeHtml(title)}</h2>
  <table class="kv-table"><tbody>${htmlRows}</tbody></table>
</section>`;
}

function renderMetadataSection(data: CivilRecordGeneral): string {
  const baseRows: Array<[string, string | undefined | null]> = [
    ['Registration Number', data.registration_number],
    ['Protocol Number', data.protocol_number],
    ['Book Reference', data.book_reference],
    ['Page Reference', data.page_reference],
    ['Term Reference', data.term_reference],
    ['Event Date', data.event_date],
    ['Event Location', data.event_location],
  ];

  const extraRows = (data.document_metadata ?? []).map((item: CivilRecordKeyValue) => [
    item.label,
    item.value,
  ] as [string, string]);

  return renderKvTable('Registry and Event Metadata', [...baseRows, ...extraRows], 'metadata-section');
}

function renderEventSummary(data: CivilRecordGeneral): string {
  const eventSummary = nonEmpty(data.event_summary);
  if (!eventSummary) return '';
  return `
<section class="section summary-section">
  <h2 class="section-title">Event Summary</h2>
  <div class="summary-box">${escapeHtml(eventSummary)}</div>
</section>`;
}

function renderEventPersonData(data: CivilRecordGeneral): string {
  const rows = (data.event_person_data ?? [])
    .filter((entry: CivilRecordKeyValue) => nonEmpty(entry.label) && nonEmpty(entry.value))
    .map((entry) => [entry.label, entry.value] as [string, string]);

  return renderKvTable('Event and Person Data', rows, 'event-person-section');
}

function renderPeopleTable(
  title: string,
  people: CivilRecordPersonEntry[] | undefined,
  cssClass: string,
): string {
  const rows = (people ?? [])
    .filter((person) =>
      nonEmpty(person.role) ||
      nonEmpty(person.full_name) ||
      nonEmpty(person.id_reference) ||
      nonEmpty(person.date_of_birth) ||
      nonEmpty(person.nationality) ||
      nonEmpty(person.notes),
    )
    .map((person) => `<tr>
  <td>${normalize(person.role)}</td>
  <td>${normalize(person.full_name)}</td>
  <td>${normalize(person.id_reference)}</td>
  <td>${normalize(person.date_of_birth)}</td>
  <td>${normalize(person.nationality)}</td>
  <td>${normalize(person.notes)}</td>
</tr>`)
    .join('');

  if (!rows) return '';

  return `
<section class="section ${cssClass}">
  <h2 class="section-title">${escapeHtml(title)}</h2>
  <table class="grid-table">
    <thead>
      <tr>
        <th>Role</th>
        <th>Name</th>
        <th>ID Reference</th>
        <th>Date of Birth</th>
        <th>Nationality</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function renderLineList(title: string, lines: string[], cssClass: string): string {
  const valid = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  if (valid.length === 0) return '';

  const listItems = valid.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  return `
<section class="section ${cssClass}">
  <h2 class="section-title">${escapeHtml(title)}</h2>
  <ul class="line-list">${listItems}</ul>
</section>`;
}

function renderJudgmentSection(data: CivilRecordGeneral): string {
  if (!data.judgment_or_order) return '';

  const block = data.judgment_or_order;
  const hasAnyValue =
    nonEmpty(block.court_name) ||
    nonEmpty(block.judge_name) ||
    nonEmpty(block.case_number) ||
    nonEmpty(block.decision_date) ||
    nonEmpty(block.effective_date) ||
    nonEmpty(block.operative_text);

  if (!hasAnyValue) return '';

  const kv = renderKvTable(
    'Judgment / Order Metadata',
    [
      ['Court', block.court_name],
      ['Judge', block.judge_name],
      ['Case Number', block.case_number],
      ['Decision Date', block.decision_date],
      ['Effective Date', block.effective_date],
    ],
    'judgment-metadata',
  );

  const operative = nonEmpty(block.operative_text)
    ? `<div class="judgment-operative">${escapeHtml(block.operative_text)}</div>`
    : '';

  return `
<section class="section judgment-section">
  <h2 class="section-title">Judgment / Order Section</h2>
  ${kv}
  ${operative}
</section>`;
}

function renderCertificationFooter(data: CivilRecordGeneral): string {
  const footer = data.certification_footer;
  const kv = renderKvTable(
    'Certification and Footer',
    [
      ['Certification Text', footer.certification_text],
      ['Issuer Name', footer.issuer_name],
      ['Issuer Role', footer.issuer_role],
      ['Issue Date', footer.issue_date],
      ['Issue Location', footer.issue_location],
      ['Seal Reference', footer.seal_reference],
      ['Signature Line', footer.signature_line],
      ['Validation Code', footer.validation_code],
      ['Validation URL', footer.validation_url],
      ['Footer Notes', footer.footer_notes],
    ],
    'certification-footer',
  );

  return kv;
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
  <h2 class="section-title">Documentary Marks</h2>
  <table class="grid-table marks-table">
    <thead><tr><th>Type</th><th>Description</th><th>Page</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function buildCss(
  orientation: 'portrait' | 'landscape',
  style: 'certificate_style' | 'registry_extract_style' | 'judgment_order_style',
): string {
  const pageRule =
    orientation === 'landscape'
      ? '@page { size: letter landscape; margin: 0.4in; }'
      : '@page { size: letter portrait; margin: 0.48in; }';

  const titleColor =
    style === 'judgment_order_style'
      ? '#0f172a'
      : style === 'registry_extract_style'
        ? '#1f2937'
        : '#111827';

  const headerBackground =
    style === 'registry_extract_style'
      ? '#f8fafc'
      : style === 'judgment_order_style'
        ? '#f9fafb'
        : '#ffffff';

  return `
${pageRule}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  color: #111827;
  font-size: 10.4pt;
  line-height: 1.35;
}
.document { width: 100%; padding: 0.04in; }
.doc-header {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: ${headerBackground};
}
.authority { font-weight: 700; font-size: 10.8pt; letter-spacing: 0.18px; }
.registry, .jurisdiction { font-size: 9pt; color: #374151; margin-top: 2px; }
.title-row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-top: 8px; }
.title { font-size: 12.3pt; letter-spacing: 0.45px; font-weight: 700; text-transform: uppercase; color: ${titleColor}; }
.subtype { font-size: 8.2pt; border: 1px solid #d1d5db; border-radius: 999px; padding: 2px 9px; font-weight: 700; color: #374151; }
.event-type { margin-top: 5px; font-size: 9.2pt; }
.rule { border-top: 1.1px solid #111827; margin-top: 8px; }

.section { margin-top: 9px; page-break-inside: avoid; }
.section-title {
  margin: 0 0 5px;
  font-size: 9.2pt;
  letter-spacing: 0.72px;
  text-transform: uppercase;
  color: #1f2937;
  font-weight: 700;
}

.kv-table, .grid-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}
.kv-table th, .kv-table td, .grid-table th, .grid-table td {
  border: 0.8px solid #d1d5db;
  padding: 5px 7px;
  vertical-align: top;
}
.kv-table th, .grid-table th {
  background: #f9fafb;
  text-align: left;
  font-weight: 700;
}
.kv-table th { width: 31%; }

.summary-box {
  border: 1px solid #d1d5db;
  background: #fcfcfd;
  border-radius: 6px;
  padding: 9px 10px;
  white-space: pre-wrap;
}
.line-list { margin: 0; padding-left: 18px; }
.line-list li { margin: 0 0 4px; }

.judgment-section { page-break-inside: auto; }
.judgment-operative {
  margin-top: 7px;
  border: 1px solid #d1d5db;
  border-left: 3px solid #6b7280;
  border-radius: 4px;
  padding: 9px 10px;
  white-space: pre-wrap;
}

.marks-table em { color: #374151; font-style: italic; }
`;
}

export function renderCivilRecordGeneralHtml(
  data: CivilRecordGeneral,
  options: CivilRecordGeneralRenderOptions = {},
): string {
  const style = inferStyle(data);
  const orientation =
    options.orientation && options.orientation !== 'unknown'
      ? options.orientation
      : data.orientation !== 'unknown'
        ? data.orientation
        : 'portrait';

  const html = [
    renderHeader(data, style),
    renderMetadataSection(data),
    renderEventSummary(data),
    renderEventPersonData(data),
    renderPeopleTable('Primary Parties', data.parties, 'parties-section'),
    renderPeopleTable(
      'Parent / Spouse / Witness Data',
      data.parent_spouse_witness_data,
      'related-parties-section',
    ),
    renderLineList('Annotations and Marginal Notes', data.annotations_marginal_notes, 'annotations-section'),
    renderLineList('Documentary Notes', data.documentary_notes, 'notes-section'),
    renderJudgmentSection(data),
    renderCertificationFooter(data),
    renderVisualElements(data.visual_elements),
  ]
    .filter(Boolean)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(nonEmpty(data.document_title) ?? 'Civil Record')}</title>
  <style>${buildCss(orientation, style)}</style>
</head>
<body>
  <main class="document">${html}</main>
</body>
</html>`;
}

