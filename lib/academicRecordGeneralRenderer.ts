/**
 * lib/academicRecordGeneralRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic premium renderer for broader academic record documents.
 *
 * Supports:
 *   - transcript-style records
 *   - academic declaration letters
 *   - enrollment / completion statements
 *   - syllabus excerpts and mixed academic metadata documents
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  AcademicRecordGeneral,
  AcademicRecordMetaItem,
  AcademicRecordPeriodEntry,
  AcademicRecordSignatory,
  AcademicRecordSubjectRow,
  VisualElement,
} from '@/types/academicRecordGeneral';

export interface AcademicRecordGeneralRenderOptions {
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

function renderHeader(data: AcademicRecordGeneral): string {
  const institution = nonEmpty(data.issuing_institution);
  const unit = nonEmpty(data.institution_unit);
  const title = nonEmpty(data.document_title) ?? 'ACADEMIC RECORD';
  const subtype = nonEmpty(data.document_subtype)?.replace(/_/g, ' ');

  return `
<header class="doc-header">
  ${institution ? `<div class="institution">${escapeHtml(institution)}</div>` : ''}
  ${unit ? `<div class="institution-unit">${escapeHtml(unit)}</div>` : ''}
  <div class="title-row">
    <div class="doc-title">${escapeHtml(title)}</div>
    ${subtype ? `<div class="doc-subtype">${escapeHtml(subtype.toUpperCase())}</div>` : ''}
  </div>
  <div class="header-rule"></div>
</header>`;
}

function buildMetadataRows(data: AcademicRecordGeneral): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Issue Date', data.issue_date],
    ['Issue Location', data.issue_location],
    ['Student Name', data.student_name],
    ['Student ID', data.student_id],
    ['National ID', data.student_national_id],
    ['Program', data.program_name],
    ['Course', data.course_name],
    ['Degree Level', data.degree_level],
    ['Academic Period', data.academic_period],
    ['Enrollment Status', data.enrollment_status],
    ['Enrollment Start Date', data.enrollment_start_date],
    ['Enrollment End Date', data.enrollment_end_date],
    ['Issuance Purpose', data.issuance_purpose],
  ];

  (data.metadata_grid ?? []).forEach((item: AcademicRecordMetaItem) => {
    rows.push([item.label, item.value]);
  });

  return rows.filter(([label, value]) => nonEmpty(label) && nonEmpty(value));
}

function renderMetadataGrid(data: AcademicRecordGeneral): string {
  const rows = buildMetadataRows(data);
  if (rows.length === 0) return '';

  const htmlRows = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  return `
<section class="section meta-section">
  <h2 class="section-title">ACADEMIC METADATA</h2>
  <table class="kv-table">
    <tbody>${htmlRows}</tbody>
  </table>
</section>`;
}

function renderPeriodLayout(entries: AcademicRecordPeriodEntry[]): string {
  const rows = (entries ?? [])
    .filter((entry) => nonEmpty(entry.period) || nonEmpty(entry.start_date) || nonEmpty(entry.end_date))
    .map((entry) => {
      const period = nonEmpty(entry.period) ?? '&mdash;';
      const start = nonEmpty(entry.start_date) ?? '&mdash;';
      const end = nonEmpty(entry.end_date) ?? '&mdash;';
      const status = nonEmpty(entry.status) ?? '&mdash;';
      const notes = nonEmpty(entry.notes) ?? '&mdash;';
      return `<tr>
  <td>${escapeHtml(period)}</td>
  <td>${escapeHtml(start)}</td>
  <td>${escapeHtml(end)}</td>
  <td>${escapeHtml(status)}</td>
  <td>${escapeHtml(notes)}</td>
</tr>`;
    })
    .join('');

  if (!rows) return '';

  return `
<section class="section period-section">
  <h2 class="section-title">PERIOD / TERM LAYOUT</h2>
  <table class="grid-table">
    <thead>
      <tr>
        <th>Period</th>
        <th>Start</th>
        <th>End</th>
        <th>Status</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

interface SubjectColumns {
  showCode: boolean;
  showHours: boolean;
  showGrade: boolean;
  showStatus: boolean;
  showPeriod: boolean;
}

function subjectColumns(rows: AcademicRecordSubjectRow[]): SubjectColumns {
  return {
    showCode: rows.some((r) => nonEmpty(r.code)),
    showHours: rows.some((r) => nonEmpty(r.hours_or_credits)),
    showGrade: rows.some((r) => nonEmpty(r.grade)),
    showStatus: rows.some((r) => nonEmpty(r.status)),
    showPeriod: rows.some((r) => nonEmpty(r.period)),
  };
}

function renderSubjectGradeTable(rows: AcademicRecordSubjectRow[]): string {
  const validRows = (rows ?? []).filter((row) => nonEmpty(row.subject));
  if (validRows.length === 0) return '';

  const cols = subjectColumns(validRows);
  const thCode = cols.showCode ? '<th>Code</th>' : '';
  const thHours = cols.showHours ? '<th>Hours / Credits</th>' : '';
  const thGrade = cols.showGrade ? '<th>Grade</th>' : '';
  const thStatus = cols.showStatus ? '<th>Status</th>' : '';
  const thPeriod = cols.showPeriod ? '<th>Period</th>' : '';

  const bodyRows = validRows
    .map((row, index) => {
      const tdCode = cols.showCode ? `<td>${escapeHtml(nonEmpty(row.code) ?? '—')}</td>` : '';
      const tdHours = cols.showHours ? `<td>${escapeHtml(nonEmpty(row.hours_or_credits) ?? '—')}</td>` : '';
      const tdGrade = cols.showGrade ? `<td>${escapeHtml(nonEmpty(row.grade) ?? '—')}</td>` : '';
      const tdStatus = cols.showStatus ? `<td>${escapeHtml(nonEmpty(row.status) ?? '—')}</td>` : '';
      const tdPeriod = cols.showPeriod ? `<td>${escapeHtml(nonEmpty(row.period) ?? '—')}</td>` : '';
      const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd';
      return `<tr class="${rowClass}">
  ${tdCode}
  <td>${escapeHtml(nonEmpty(row.subject) ?? '—')}</td>
  ${tdHours}
  ${tdGrade}
  ${tdStatus}
  ${tdPeriod}
</tr>`;
    })
    .join('');

  return `
<section class="section subjects-section">
  <h2 class="section-title">SUBJECTS / GRADES</h2>
  <table class="grid-table subjects-table">
    <thead>
      <tr>
        ${thCode}
        <th>Subject</th>
        ${thHours}
        ${thGrade}
        ${thStatus}
        ${thPeriod}
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</section>`;
}

function renderBodyParagraphs(lines: string[]): string {
  const paragraphs = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  if (paragraphs.length === 0) return '';

  const html = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  return `
<section class="section body-section">
  <h2 class="section-title">DECLARATION / BODY</h2>
  <div class="body-text">${html}</div>
</section>`;
}

function renderIssuanceAndSignatures(data: AcademicRecordGeneral): string {
  const issuance = nonEmpty(data.issuance_block_text);
  const signatories = (data.signatories ?? [])
    .filter((entry: AcademicRecordSignatory) => nonEmpty(entry.name) || nonEmpty(entry.role))
    .map((entry) => {
      return `<div class="sig-card">
  <div class="sig-line"></div>
  ${nonEmpty(entry.name) ? `<div class="sig-name">${escapeHtml(entry.name)}</div>` : ''}
  ${nonEmpty(entry.role) ? `<div class="sig-role">${escapeHtml(entry.role)}</div>` : ''}
  ${nonEmpty(entry.unit) ? `<div class="sig-unit">${escapeHtml(entry.unit)}</div>` : ''}
  ${nonEmpty(entry.contact) ? `<div class="sig-contact">${escapeHtml(entry.contact)}</div>` : ''}
</div>`;
    })
    .join('');
  const footer = nonEmpty(data.registrar_footer);
  const refs = (data.attachments_or_references ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');

  if (!issuance && !signatories && !footer && !refs) return '';

  return `
<section class="section issuance-section">
  <h2 class="section-title">ISSUANCE / SIGNATURES</h2>
  ${issuance ? `<div class="issuance-block">${escapeHtml(issuance)}</div>` : ''}
  ${signatories ? `<div class="sig-grid">${signatories}</div>` : ''}
  ${footer ? `<div class="registrar-footer">${escapeHtml(footer)}</div>` : ''}
  ${refs ? `<div class="references"><strong>Attachments / References:</strong><ul>${refs}</ul></div>` : ''}
</section>`;
}

function renderVisualElements(elements: VisualElement[] | undefined): string {
  if (!elements || elements.length === 0) return '';
  const rows = elements
    .map((item) => {
      const type = escapeHtml(item.type ?? 'other_official_mark');
      const description = escapeHtml(item.description ?? '');
      const text = nonEmpty(item.text);
      const page = nonEmpty(item.page);
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

function buildCss(orientation: 'portrait' | 'landscape', denseTable: boolean): string {
  const pageRule =
    orientation === 'landscape'
      ? '@page { size: letter landscape; margin: 0.44in; }'
      : '@page { size: letter portrait; margin: 0.52in; }';

  return `
${pageRule}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Times New Roman", Georgia, serif;
  color: #111827;
  font-size: ${denseTable ? '10pt' : '10.6pt'};
  line-height: 1.4;
}
.document { width: 100%; }

.doc-header { margin-bottom: 10px; }
.institution { font-size: 12pt; font-weight: 700; }
.institution-unit { font-size: 9.6pt; color: #374151; margin-top: 2px; }
.title-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-top: 8px;
}
.doc-title { font-size: 12.4pt; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }
.doc-subtype {
  font-size: 8.4pt;
  font-weight: 700;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 2px 10px;
}
.header-rule { border-top: 1px solid #111827; margin-top: 9px; }

.section { margin-top: 11px; page-break-inside: avoid; }
.section-title {
  margin: 0 0 6px;
  font-size: 9.2pt;
  letter-spacing: 0.72px;
  text-transform: uppercase;
  font-weight: 700;
  color: #1f2937;
}

.kv-table, .grid-table {
  width: 100%;
  border-collapse: collapse;
  font-size: ${denseTable ? '8.8pt' : '9.3pt'};
}
.kv-table th, .kv-table td, .grid-table th, .grid-table td {
  border: 0.8px solid #d1d5db;
  padding: 5px 7px;
  vertical-align: top;
}
.kv-table th, .grid-table th {
  text-align: left;
  background: #f8fafc;
  font-weight: 700;
}
.kv-table th { width: 32%; }

.subjects-table .row-even { background: #fbfdff; }

.body-text p { margin: 0 0 9px; text-align: justify; }

.issuance-block {
  border: 1px solid #d1d5db;
  background: #fafafa;
  padding: 9px 10px;
}
.sig-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.sig-card { padding-top: 20px; }
.sig-line { border-top: 1px solid #111827; margin-bottom: 6px; }
.sig-name { font-weight: 700; }
.sig-role, .sig-unit, .sig-contact { margin-top: 2px; font-size: 8.9pt; color: #374151; }
.registrar-footer {
  margin-top: 10px;
  border-top: 0.8px solid #e5e7eb;
  padding-top: 7px;
  color: #4b5563;
  font-size: 9pt;
}
.references { margin-top: 8px; font-size: 9pt; }
.references ul { margin: 3px 0 0 18px; padding: 0; }

.marks-table td:nth-child(1) { width: 24%; }
.marks-table td:nth-child(3) { width: 10%; text-align: center; }

.layout-landscape .sig-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;
}

export function renderAcademicRecordGeneralHtml(
  data: AcademicRecordGeneral,
  options: AcademicRecordGeneralRenderOptions = {},
): string {
  const orientation =
    options.orientation === 'landscape' ? 'landscape' : 'portrait';
  const denseTable = (data.subject_grade_table?.length ?? 0) >= 10;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>${buildCss(orientation, denseTable)}</style>
</head>
<body class="layout-${orientation}">
  <main class="document">
    ${renderHeader(data)}
    ${renderMetadataGrid(data)}
    ${renderPeriodLayout(data.period_layout)}
    ${renderSubjectGradeTable(data.subject_grade_table)}
    ${renderBodyParagraphs(data.body_paragraphs)}
    ${renderIssuanceAndSignatures(data)}
    ${renderVisualElements(data.visual_elements)}
  </main>
</body>
</html>`;

  return html;
}
