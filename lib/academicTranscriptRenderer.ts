/**
 * lib/academicTranscriptRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic HTML renderer for structured academic transcript data.
 *
 * Input:  AcademicTranscript (validated JSON from previewStructuredKit)
 * Output: Self-contained HTML string, ready for Gotenberg/Chromium rendering.
 *
 * Layout:
 *   1. Document header (institution, title)
 *   2. Student identity bar (name, ID/CPF, program, period)
 *   3. Subjects table — THE CORE SECTION (all rows, flows across pages)
 *   4. Summary block (total hours, GPA, graduation status/dates)
 *   5. Additional notes (attestation or narrative text)
 *   6. Signatories row
 *   7. Documentary marks table
 *
 * Pagination:
 *   The subjects table uses CSS pagination (no explicit page break). Chromium
 *   (via Gotenberg) naturally flows long tables across pages — rows never split
 *   mid-row. This is correct for transcripts that can have 50+ subject rows.
 *
 * Column visibility:
 *   The table adapts to the data — if ALL code values are empty, the Code
 *   column is hidden. If ALL period values are empty, Period is hidden. This
 *   prevents an ugly empty column when that data is not available.
 *
 * Orientation:
 *   'landscape' → CSS @page landscape + reduced margins for wider table
 *   'portrait' | 'unknown' | undefined → portrait (standard for most transcripts)
 *
 * Design goals:
 *   - Institutional: forms feel like official academic documents
 *   - Table-first: the subject grid is the visual center of the document
 *   - Alternate row shading for readability (long grade lists)
 *   - Status coloring: Approved = green tint, Failed = red tint, Exempt = gray tint
 *   - Deterministic: same input → identical output
 *   - Resilient: missing/empty fields silently omitted; never throws
 *   - Isolated: pure function, no side effects, no DB/network calls
 *
 * This module does NOT affect the legacy pipeline, Workbench,
 * generateDeliveryKit.ts, translationHtmlSanitizer.ts, or the API response.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  AcademicTranscript,
  SubjectEntry,
  TranscriptSummary,
  TranscriptSignatory,
  VisualElement,
} from '@/types/academicTranscript';

// ── Public types ──────────────────────────────────────────────────────────────

export interface AcademicTranscriptRenderOptions {
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

function nonEmpty(value: string | undefined | null): string | null {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : null;
}

function dash(value: string | undefined | null): string {
  return nonEmpty(value) ? escapeHtml(value) : '&mdash;';
}

// ── Column visibility analysis ────────────────────────────────────────────────

interface ColumnVisibility {
  showCode:   boolean;
  showHours:  boolean;
  showGrade:  boolean;
  showStatus: boolean;
  showPeriod: boolean;
}

function analyzeColumns(subjects: SubjectEntry[]): ColumnVisibility {
  if (!subjects || subjects.length === 0) {
    return { showCode: false, showHours: false, showGrade: false, showStatus: false, showPeriod: false };
  }
  return {
    showCode:   subjects.some(s => nonEmpty(s.code)),
    showHours:  subjects.some(s => nonEmpty(s.hours)),
    showGrade:  subjects.some(s => nonEmpty(s.grade)),
    showStatus: subjects.some(s => nonEmpty(s.status)),
    showPeriod: subjects.some(s => nonEmpty(s.period)),
  };
}

// ── Status CSS class ──────────────────────────────────────────────────────────

function statusClass(status: string): string {
  const s = (status ?? '').toLowerCase();
  if (s.startsWith('approv') || s === 'pass' || s === 'passed') return 'status-approved';
  if (s.startsWith('fail') || s.startsWith('reprov')) return 'status-failed';
  if (s.startsWith('exempt') || s.startsWith('dispen') || s.startsWith('isen')) return 'status-exempt';
  return '';
}

// ── Visual elements section ───────────────────────────────────────────────────

const VISUAL_ELEMENT_LABELS: Record<string, string> = {
  letterhead:           'Letterhead',
  seal:                 'Official Seal',
  embossed_seal:        'Embossed Seal',
  dry_seal:             'Dry Seal',
  stamp:                'Official Stamp',
  signature:            'Signature',
  electronic_signature: 'Electronic Signature',
  initials:             'Initials',
  watermark:            'Watermark',
  qr_code:              'QR Code',
  barcode:              'Barcode',
  official_logo:        'Official Logo',
  handwritten_note:     'Handwritten Note',
  margin_annotation:    'Margin Annotation',
  revenue_stamp:        'Revenue Stamp',
  notarial_mark:        'Notarial Mark',
  other_official_mark:  'Official Mark',
};

function normElementType(raw: string): string {
  const k = (raw ?? '').toLowerCase().replace(/[^a-z_]/g, '_');
  return VISUAL_ELEMENT_LABELS[k] ?? 'Official Mark';
}

function renderVisualElements(elements: VisualElement[] | undefined): string {
  if (!elements || elements.length === 0) return '';
  const rows = elements.map(el => {
    const typeLabel = normElementType(el.type);
    const desc      = escapeHtml(el.description);
    const txt       = nonEmpty(el.text);
    const pg        = nonEmpty(el.page);
    return `<tr>
      <td class="ve-type">${escapeHtml(typeLabel)}</td>
      <td class="ve-desc">${desc}${txt ? ` — <em>${escapeHtml(txt)}</em>` : ''}</td>
      ${pg ? `<td class="ve-page">p.${escapeHtml(pg)}</td>` : '<td class="ve-page"></td>'}
    </tr>`;
  }).join('\n');

  return `
<section class="section doc-marks">
  <h2 class="section-label">DOCUMENTARY MARKS</h2>
  <table class="ve-table">
    <tbody>
      ${rows}
    </tbody>
  </table>
</section>`;
}

// ── Document header ───────────────────────────────────────────────────────────

function renderHeader(data: AcademicTranscript): string {
  const institution = nonEmpty(data.issuing_institution);
  const subheading  = nonEmpty(data.institution_subheading);
  const title       = nonEmpty(data.document_title) ?? 'ACADEMIC TRANSCRIPT';

  return `
<header class="doc-header">
  ${institution ? `<div class="institution-name">${escapeHtml(institution)}</div>` : ''}
  ${subheading  ? `<div class="institution-sub">${escapeHtml(subheading)}</div>`  : ''}
  <div class="doc-title">${escapeHtml(title)}</div>
  <div class="header-rule"></div>
</header>`;
}

// ── Student identity bar ──────────────────────────────────────────────────────

function renderStudentBar(data: AcademicTranscript): string {
  const name     = nonEmpty(data.student_name);
  const id       = nonEmpty(data.student_id);
  const cpf      = nonEmpty(data.student_cpf);
  const program  = nonEmpty(data.program_course);
  const level    = nonEmpty(data.degree_level);
  const period   = nonEmpty(data.academic_period);

  const idCpfParts: string[] = [];
  if (id)  idCpfParts.push(`<span class="meta-label">ID:</span> <span class="meta-value">${escapeHtml(id)}</span>`);
  if (cpf) idCpfParts.push(`<span class="meta-label">CPF:</span> <span class="meta-value">${escapeHtml(cpf)}</span>`);

  const programParts: string[] = [];
  if (program) programParts.push(escapeHtml(program));
  if (level && level !== program) programParts.push(`<span class="meta-label">(${escapeHtml(level)})</span>`);
  if (period) programParts.push(`<span class="meta-label"> · ${escapeHtml(period)}</span>`);

  return `
<section class="student-bar">
  ${name ? `<div class="student-name">${escapeHtml(name)}</div>` : ''}
  ${idCpfParts.length  > 0 ? `<div class="student-meta">${idCpfParts.join('  &nbsp;|&nbsp;  ')}</div>`    : ''}
  ${programParts.length > 0 ? `<div class="student-program">${programParts.join('')}</div>` : ''}
</section>`;
}

// ── Subjects table ────────────────────────────────────────────────────────────

function renderSubjectsTable(subjects: SubjectEntry[], vis: ColumnVisibility): string {
  if (!subjects || subjects.length === 0) {
    return `<section class="section subjects-section">
  <h2 class="section-label">SUBJECTS</h2>
  <p class="no-subjects">No subject records found in this transcript.</p>
</section>`;
  }

  const thCode   = vis.showCode   ? '<th class="th-code">Code</th>'     : '';
  const thHours  = vis.showHours  ? '<th class="th-hours">Hours</th>'   : '';
  const thGrade  = vis.showGrade  ? '<th class="th-grade">Grade</th>'   : '';
  const thStatus = vis.showStatus ? '<th class="th-status">Status</th>' : '';
  const thPeriod = vis.showPeriod ? '<th class="th-period">Period</th>' : '';

  const rows = subjects.map((s, i) => {
    const tdCode   = vis.showCode   ? `<td class="td-code">${dash(s.code)}</td>`     : '';
    const tdHours  = vis.showHours  ? `<td class="td-hours">${dash(s.hours)}</td>`   : '';
    const tdGrade  = vis.showGrade  ? `<td class="td-grade">${dash(s.grade)}</td>`   : '';
    const statusCls = nonEmpty(s.status) ? statusClass(s.status) : '';
    const tdStatus = vis.showStatus ? `<td class="td-status ${statusCls}">${dash(s.status)}</td>` : '';
    const tdPeriod = vis.showPeriod ? `<td class="td-period">${dash(s.period)}</td>` : '';
    const rowClass = i % 2 === 0 ? 'row-even' : 'row-odd';

    return `<tr class="${rowClass}">
      ${tdCode}
      <td class="td-name">${escapeHtml(nonEmpty(s.name) ?? '—')}</td>
      ${tdHours}
      ${tdGrade}
      ${tdStatus}
      ${tdPeriod}
    </tr>`;
  }).join('\n');

  return `
<section class="section subjects-section">
  <h2 class="section-label">SUBJECTS AND GRADES</h2>
  <table class="subjects-table">
    <thead>
      <tr>
        ${thCode}
        <th class="th-name">Subject</th>
        ${thHours}
        ${thGrade}
        ${thStatus}
        ${thPeriod}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</section>`;
}

// ── Summary block ─────────────────────────────────────────────────────────────

function renderSummary(summary: TranscriptSummary | null): string {
  if (!summary) return '';

  const items: string[] = [];
  if (nonEmpty(summary.total_hours))    items.push(`<div class="sum-item"><span class="sum-label">Total Workload:</span> <span class="sum-value">${escapeHtml(summary.total_hours)}</span></div>`);
  if (nonEmpty(summary.overall_gpa))    items.push(`<div class="sum-item"><span class="sum-label">Overall GPA / Average:</span> <span class="sum-value">${escapeHtml(summary.overall_gpa)}</span></div>`);
  if (nonEmpty(summary.graduation_status)) items.push(`<div class="sum-item"><span class="sum-label">Status:</span> <span class="sum-value">${escapeHtml(summary.graduation_status)}</span></div>`);
  if (nonEmpty(summary.graduation_date)) items.push(`<div class="sum-item"><span class="sum-label">Graduation Date:</span> <span class="sum-value">${escapeHtml(summary.graduation_date)}</span></div>`);
  if (nonEmpty(summary.entry_date))     items.push(`<div class="sum-item"><span class="sum-label">Entry Date:</span> <span class="sum-value">${escapeHtml(summary.entry_date)}</span></div>`);

  if (items.length === 0) return '';

  return `
<section class="section summary-section">
  <h2 class="section-label">SUMMARY</h2>
  <div class="summary-grid">
    ${items.join('\n    ')}
  </div>
</section>`;
}

// ── Additional notes ──────────────────────────────────────────────────────────

function renderAdditionalNotes(notes: string): string {
  const v = nonEmpty(notes);
  if (!v) return '';
  return `
<section class="section notes-section">
  <h2 class="section-label">NOTES AND ATTESTATION</h2>
  <div class="notes-text">${escapeHtml(v)}</div>
</section>`;
}

// ── Signatories ───────────────────────────────────────────────────────────────

function renderSignatories(signatories: TranscriptSignatory[]): string {
  if (!signatories || signatories.length === 0) return '';
  const items = signatories
    .filter(s => nonEmpty(s.name) || nonEmpty(s.role))
    .map(s => {
      const name = nonEmpty(s.name) ? `<div class="sig-name">${escapeHtml(s.name)}</div>` : '';
      const role = nonEmpty(s.role) ? `<div class="sig-role">${escapeHtml(s.role)}</div>` : '';
      return `<div class="sig-block">${name}${role}</div>`;
    });
  if (items.length === 0) return '';
  return `
<section class="section signatories-section">
  <h2 class="section-label">SIGNATORIES</h2>
  <div class="sig-row">
    ${items.join('\n    ')}
  </div>
</section>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function buildCss(isLandscape: boolean): string {
  return `
*, *::before, *::after { box-sizing: border-box; }

html, body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 9pt;
  line-height: 1.4;
  background: #fff;
  color: #111;
  margin: 0;
  padding: 0;
}

/* ── Page ── */
${isLandscape ? '@page { size: landscape; }' : '@page { size: letter; }'}

.page {
  width: 100%;
  padding: 0;
}

/* ── Document header ── */
.doc-header {
  text-align: center;
  margin-bottom: 10pt;
}

.institution-name {
  font-size: 11pt;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1.3;
  margin-bottom: 2pt;
}

.institution-sub {
  font-size: 9pt;
  color: #444;
  margin-bottom: 4pt;
}

.doc-title {
  font-size: 14pt;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: 6pt;
  margin-bottom: 4pt;
}

.header-rule {
  border: none;
  border-top: 1.5pt solid #222;
  margin: 6pt auto 0 auto;
  width: 90%;
}

/* ── Student bar ── */
.student-bar {
  border: 0.75pt solid #ccc;
  background: #f8f8f8;
  padding: 5pt 8pt;
  margin-bottom: 10pt;
}

.student-name {
  font-size: 11pt;
  font-weight: bold;
  margin-bottom: 2pt;
}

.student-meta {
  font-size: 8.5pt;
  color: #333;
  margin-bottom: 1pt;
}

.student-program {
  font-size: 8.5pt;
  color: #444;
}

.meta-label {
  color: #666;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.meta-value {
  font-family: 'Courier New', Courier, monospace;
  font-size: 8.5pt;
}

/* ── Section ── */
.section {
  margin-bottom: 10pt;
}

.section-label {
  font-size: 7pt;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #555;
  margin: 0 0 4pt 0;
  padding-bottom: 2pt;
  border-bottom: 0.5pt solid #ccc;
}

/* ── Subjects table ── */
.subjects-section {
  margin-bottom: 12pt;
}

.subjects-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.5pt;
  /* Allow Chromium to break rows across pages naturally */
  page-break-inside: auto;
}

.subjects-table thead {
  /* Repeat headers on each printed page */
  display: table-header-group;
}

.subjects-table th {
  background: #2c3e50;
  color: #fff;
  font-weight: bold;
  padding: 4pt 5pt;
  text-align: left;
  border: 0.5pt solid #1a2533;
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.subjects-table td {
  padding: 3pt 5pt;
  border: 0.5pt solid #ddd;
  vertical-align: top;
}

.subjects-table tr {
  page-break-inside: avoid;
  break-inside: avoid;
}

/* Column sizing */
.th-code,   .td-code   { width: 8%;  white-space: nowrap; }
.th-name,   .td-name   { width: auto; word-break: break-word; }
.th-hours,  .td-hours  { width: 8%;  text-align: center; white-space: nowrap; }
.th-grade,  .td-grade  { width: 9%;  text-align: center; font-weight: bold; white-space: nowrap; }
.th-status, .td-status { width: 13%; white-space: nowrap; }
.th-period, .td-period { width: 12%; white-space: nowrap; }

/* Alternating rows */
.row-even { background: #fff; }
.row-odd  { background: #f5f7f9; }

/* Status coloring */
.status-approved { color: #1a6830; background: #eaf6ed; }
.status-failed   { color: #921f1f; background: #fdf0f0; }
.status-exempt   { color: #555;    background: #f4f4f4; }

.no-subjects {
  font-style: italic;
  color: #666;
  font-size: 9pt;
}

/* ── Summary block ── */
.summary-section {
  border: 0.75pt solid #ccc;
  background: #f9f9f9;
  padding: 6pt 8pt;
}

.summary-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 3pt 20pt;
}

.sum-item {
  font-size: 8.5pt;
}

.sum-label {
  font-weight: bold;
  color: #444;
}

.sum-value {
  color: #111;
}

/* ── Notes ── */
.notes-section {
  border-left: 2pt solid #ccc;
  padding-left: 8pt;
  margin-left: 4pt;
}

.notes-text {
  font-size: 8.5pt;
  font-style: italic;
  color: #333;
  white-space: pre-line;
}

/* ── Signatories ── */
.signatories-section {
  border-top: 0.5pt solid #ccc;
  padding-top: 6pt;
  margin-top: 8pt;
}

.sig-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6pt 24pt;
}

.sig-block {
  text-align: center;
  min-width: 90pt;
}

.sig-name {
  font-size: 8.5pt;
  font-weight: bold;
}

.sig-role {
  font-size: 7.5pt;
  color: #555;
  font-style: italic;
}

/* ── Documentary marks ── */
.doc-marks {
  border-top: 0.5pt solid #ccc;
  padding-top: 6pt;
  margin-top: 8pt;
}

.ve-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8pt;
}

.ve-table td {
  padding: 2.5pt 5pt;
  vertical-align: top;
}

.ve-type {
  font-weight: bold;
  white-space: normal;
  width: 25%;
  color: #333;
  word-break: break-word;
}

.ve-desc {
  color: #444;
}

.ve-page {
  color: #888;
  white-space: nowrap;
  width: 5%;
  text-align: right;
}

/* ── Landscape overrides ── */
${isLandscape ? `
.doc-title { font-size: 13pt; }
.institution-name { font-size: 10pt; }
.subjects-table { font-size: 8pt; }
.subjects-table th { font-size: 7pt; }
.subjects-table td { padding: 2.5pt 4pt; }
.sig-row { justify-content: space-evenly; }
` : ''}
`;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

/**
 * Renders the academic transcript as a self-contained HTML string.
 *
 * Never throws. Falls back to an error document if input is entirely missing.
 */
export function renderAcademicTranscriptHtml(
  data: AcademicTranscript,
  options: AcademicTranscriptRenderOptions = {},
): string {
  try {
    const isLandscape = options.orientation === 'landscape';
    const subjects    = data.subjects ?? [];
    const vis         = analyzeColumns(subjects);

    const body = [
      renderHeader(data),
      renderStudentBar(data),
      renderSubjectsTable(subjects, vis),
      renderSummary(data.summary),
      renderAdditionalNotes(data.additional_notes ?? ''),
      renderSignatories(data.signatories ?? []),
      renderVisualElements(data.visual_elements),
    ].join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
${buildCss(isLandscape)}
  </style>
</head>
<body>
<div class="page">
${body}
</div>
</body>
</html>`;
  } catch {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><style>body{font-family:Arial;font-size:11pt;}</style></head>
<body><p>[Transcript rendering error — see server logs]</p></body>
</html>`;
  }
}
