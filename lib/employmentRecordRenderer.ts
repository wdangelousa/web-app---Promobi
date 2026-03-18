/**
 * lib/employmentRecordRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic premium renderer for employment-related records.
 *
 * Supports:
 *   - letter-style employment documents
 *   - certificate-style employment statements
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  EmploymentRecord,
  EmploymentSignatory,
  EmploymentTimelineEntry,
} from '@/types/employmentRecord';
import type { VisualElement } from '@/types/employmentRecord';

export interface EmploymentRecordRenderOptions {
  pageCount?: number;
  orientation?: 'portrait' | 'landscape' | 'unknown';
  forceSignatureOnNewPage?: boolean;
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

function renderHeader(data: EmploymentRecord): string {
  const company = nonEmpty(data.issuing_company);
  const dept = nonEmpty(data.company_department);
  const idLine = nonEmpty(data.company_identification);
  const title = nonEmpty(data.document_title) ?? 'EMPLOYMENT RECORD';
  const subject = nonEmpty(data.document_subject);
  const subtype = nonEmpty(data.document_subtype)?.replace(/_/g, ' ');

  return `
<header class="doc-header">
  ${company ? `<div class="company-name">${escapeHtml(company)}</div>` : ''}
  ${dept ? `<div class="company-dept">${escapeHtml(dept)}</div>` : ''}
  ${idLine ? `<div class="company-idline">${escapeHtml(idLine)}</div>` : ''}
  <div class="title-row">
    <div class="doc-title">${escapeHtml(title)}</div>
    ${subtype ? `<div class="doc-subtype">${escapeHtml(subtype.toUpperCase())}</div>` : ''}
  </div>
  ${subject ? `<div class="doc-subject"><span>Subject:</span> ${escapeHtml(subject)}</div>` : ''}
  <div class="header-rule"></div>
</header>`;
}

function renderIssueBlock(data: EmploymentRecord): string {
  const date = nonEmpty(data.issue_date);
  const location = nonEmpty(data.issue_location);
  const addressee = nonEmpty(data.addressee);
  const salutation = nonEmpty(data.salutation);

  const leftRows: string[] = [];
  if (addressee) leftRows.push(`<div class="issue-left-row"><strong>To:</strong> ${escapeHtml(addressee)}</div>`);
  if (salutation) leftRows.push(`<div class="issue-left-row">${escapeHtml(salutation)}</div>`);

  const rightRows: string[] = [];
  if (location) rightRows.push(`<div class="issue-right-row"><strong>Location:</strong> ${escapeHtml(location)}</div>`);
  if (date) rightRows.push(`<div class="issue-right-row"><strong>Date:</strong> ${escapeHtml(date)}</div>`);

  if (leftRows.length === 0 && rightRows.length === 0) return '';

  return `
<section class="issue-block">
  <div class="issue-left">${leftRows.join('')}</div>
  <div class="issue-right">${rightRows.join('')}</div>
</section>`;
}

function renderIdentitySection(data: EmploymentRecord): string {
  const rows = [
    ['Employee Name', data.employee_name],
    ['Employee ID', data.employee_id],
    ['National ID', data.employee_national_id],
    ['Role / Title', data.job_title],
    ['Employment Status', data.employment_status],
    ['Start Date', data.employment_start_date],
    ['End Date', data.employment_end_date],
  ].filter(([, value]) => nonEmpty(value));

  if (rows.length === 0) return '';

  const htmlRows = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  return `
<section class="section identity-section">
  <h2 class="section-title">EMPLOYEE IDENTIFICATION</h2>
  <table class="kv-table">
    <tbody>${htmlRows}</tbody>
  </table>
</section>`;
}

function renderTimeline(timeline: EmploymentTimelineEntry[]): string {
  if (!timeline || timeline.length === 0) return '';

  const rows = timeline
    .map((item) => {
      const role = nonEmpty(item.role_or_title) ?? '&mdash;';
      const start = nonEmpty(item.start_date) ?? '&mdash;';
      const end = nonEmpty(item.end_date) ?? '&mdash;';
      const summary = nonEmpty(item.responsibilities_summary) ?? '&mdash;';
      return `<tr>
  <td>${escapeHtml(role)}</td>
  <td>${escapeHtml(start)}</td>
  <td>${escapeHtml(end)}</td>
  <td>${escapeHtml(summary)}</td>
</tr>`;
    })
    .join('');

  return `
<section class="section timeline-section">
  <h2 class="section-title">EMPLOYMENT TIMELINE</h2>
  <table class="timeline-table">
    <thead>
      <tr>
        <th>Role / Title</th>
        <th>Start</th>
        <th>End</th>
        <th>Responsibilities Summary</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function renderDuties(items: string[]): string {
  const clean = (items ?? []).map((it) => it.trim()).filter(Boolean);
  if (clean.length === 0) return '';

  const li = clean.map((it) => `<li>${escapeHtml(it)}</li>`).join('');
  return `
<section class="section duties-section">
  <h2 class="section-title">ROLE AND RESPONSIBILITIES</h2>
  <ul class="duties-list">${li}</ul>
</section>`;
}

function renderSalaryBlock(data: EmploymentRecord): string {
  if (!data.salary) return '';

  const salaryRows = [
    ['Base Amount', data.salary.base_amount],
    ['Currency', data.salary.currency],
    ['Pay Period', data.salary.pay_period],
    ['Total Compensation', data.salary.total_compensation],
    ['Benefits / Notes', data.salary.benefits_or_notes],
  ].filter(([, value]) => nonEmpty(value));

  if (salaryRows.length === 0) return '';

  const htmlRows = salaryRows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  return `
<section class="section salary-section">
  <h2 class="section-title">SALARY AND COMPENSATION</h2>
  <table class="kv-table salary-table">
    <tbody>${htmlRows}</tbody>
  </table>
</section>`;
}

function renderBodyParagraphs(paragraphs: string[]): string {
  const clean = (paragraphs ?? []).map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  const html = clean.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  return `
<section class="section body-section">
  <h2 class="section-title">DECLARATION</h2>
  <div class="body-paragraphs">${html}</div>
</section>`;
}

function renderCertificateStyleStatement(data: EmploymentRecord): string {
  const employee = nonEmpty(data.employee_name);
  const role = nonEmpty(data.job_title);
  const start = nonEmpty(data.employment_start_date);
  const end = nonEmpty(data.employment_end_date);
  const status = nonEmpty(data.employment_status);

  const fragments = [
    employee ? `This certifies that <strong>${escapeHtml(employee)}</strong>` : null,
    role ? `served as <strong>${escapeHtml(role)}</strong>` : null,
    start || end
      ? `during the period <strong>${escapeHtml(start ?? 'N/A')}</strong> to <strong>${escapeHtml(end ?? 'Present')}</strong>`
      : null,
    status ? `with status <strong>${escapeHtml(status)}</strong>` : null,
  ].filter(Boolean);

  if (fragments.length === 0) return '';
  return `
<section class="section certificate-statement">
  <div class="certificate-box">${fragments.join(', ')}.</div>
</section>`;
}

function renderVisualElements(elements: VisualElement[] | undefined): string {
  if (!elements || elements.length === 0) return '';
  const rows = elements.map((el) => {
    const type = escapeHtml(el.type ?? 'other_official_mark');
    const desc = escapeHtml(el.description ?? '');
    const text = nonEmpty(el.text);
    const page = nonEmpty(el.page);
    return `<tr>
  <td>${type}</td>
  <td>${desc}${text ? ` — <em>${escapeHtml(text)}</em>` : ''}</td>
  <td>${page ? escapeHtml(page) : ''}</td>
</tr>`;
  }).join('');

  return `
<section class="section marks-section">
  <h2 class="section-title">DOCUMENTARY MARKS</h2>
  <table class="marks-table">
    <thead><tr><th>Type</th><th>Description</th><th>Page</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function renderSignatureSection(
  data: EmploymentRecord,
  signatureOnNewPage: boolean,
): string {
  const signatories: EmploymentSignatory[] =
    data.signatories && data.signatories.length > 0
      ? data.signatories
      : [{
          name: data.issuer_name,
          role: data.issuer_role,
          department: data.issuer_department,
        }];

  const valid = signatories
    .filter((s) => nonEmpty(s.name) || nonEmpty(s.role) || nonEmpty(s.department))
    .map((s) => `<div class="sig-card">
  <div class="sig-line"></div>
  ${nonEmpty(s.name) ? `<div class="sig-name">${escapeHtml(s.name)}</div>` : ''}
  ${nonEmpty(s.role) ? `<div class="sig-role">${escapeHtml(s.role)}</div>` : ''}
  ${nonEmpty(s.department) ? `<div class="sig-dept">${escapeHtml(s.department)}</div>` : ''}
</div>`)
    .join('');

  const issuerContact = nonEmpty(data.issuer_contact);
  const footer = nonEmpty(data.company_footer);
  const refs = (data.attachments_or_references ?? [])
    .map((ref) => ref.trim())
    .filter(Boolean)
    .map((ref) => `<li>${escapeHtml(ref)}</li>`)
    .join('');

  return `
<section class="section signature-section ${signatureOnNewPage ? 'signature-new-page' : ''}">
  <h2 class="section-title">ISSUER SIGNATURE</h2>
  <div class="sig-grid">${valid}</div>
  ${issuerContact ? `<div class="issuer-contact"><strong>Contact:</strong> ${escapeHtml(issuerContact)}</div>` : ''}
  ${refs ? `<div class="references"><strong>Attachments / References:</strong><ul>${refs}</ul></div>` : ''}
  ${footer ? `<div class="company-footer">${escapeHtml(footer)}</div>` : ''}
</section>`;
}

function isCertificateStyle(data: EmploymentRecord): boolean {
  if (data.document_subtype === 'work_certificate') return true;
  const title = (data.document_title ?? '').toLowerCase();
  const hasCertificateTitle = title.includes('certificate');
  return hasCertificateTitle && !nonEmpty(data.addressee);
}

function buildCss(
  orientation: 'portrait' | 'landscape',
  certificateStyle: boolean,
): string {
  const pageRule =
    orientation === 'landscape'
      ? '@page { size: letter landscape; margin: 0.42in; }'
      : '@page { size: letter portrait; margin: 0.52in; }';

  return `
${pageRule}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Arial, Helvetica, sans-serif;
  color: #111827;
  font-size: 11pt;
  line-height: 1.38;
}
.document {
  width: 100%;
  ${certificateStyle ? 'padding: 0.16in 0.08in;' : 'padding: 0.08in 0.02in;'}
}
.doc-header { margin-bottom: 14px; }
.company-name { font-size: 16pt; font-weight: 700; letter-spacing: 0.2px; }
.company-dept { font-size: 10.5pt; color: #374151; margin-top: 2px; }
.company-idline { font-size: 9pt; color: #4b5563; margin-top: 2px; }
.title-row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-top: 11px; }
.doc-title { font-size: 13pt; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
.doc-subtype { font-size: 8.5pt; font-weight: 700; color: #374151; border: 1px solid #d1d5db; border-radius: 999px; padding: 2px 10px; }
.doc-subject { margin-top: 6px; font-size: 10pt; }
.doc-subject span { font-weight: 700; }
.header-rule { border-top: 1.2px solid #111827; margin-top: 10px; }

.issue-block { display: flex; justify-content: space-between; gap: 16px; margin: 8px 0 14px; }
.issue-left, .issue-right { flex: 1; font-size: 10pt; }
.issue-right { text-align: right; }
.issue-left-row, .issue-right-row { margin-bottom: 3px; }

.section { margin-top: 10px; page-break-inside: avoid; }
.section-title {
  font-size: 9.6pt;
  letter-spacing: 0.65px;
  font-weight: 700;
  margin: 0 0 5px;
  color: #1f2937;
  text-transform: uppercase;
}

.kv-table, .timeline-table, .marks-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5pt;
}
.kv-table th, .kv-table td,
.timeline-table th, .timeline-table td,
.marks-table th, .marks-table td {
  border: 0.8px solid #d1d5db;
  padding: 5px 7px;
  vertical-align: top;
}
.kv-table th, .timeline-table th, .marks-table th {
  background: #f9fafb;
  color: #111827;
  font-weight: 700;
  text-align: left;
}
.kv-table th { width: 35%; }
.salary-table { background: #fbfdff; }

.timeline-table td:nth-child(2),
.timeline-table td:nth-child(3) { width: 16%; white-space: nowrap; }

.duties-list { margin: 0; padding: 0 0 0 18px; }
.duties-list li { margin: 0 0 5px; }

.body-paragraphs p { margin: 0 0 8px; text-align: justify; }

.certificate-statement .certificate-box {
  border: 1px solid #d1d5db;
  background: #fafafa;
  padding: 12px;
  text-align: center;
  font-size: 11pt;
  line-height: 1.5;
}

.signature-section { margin-top: 18px; }
.signature-new-page { page-break-before: always; }
.sig-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}
.sig-card { padding-top: 24px; }
.sig-line { border-top: 1px solid #111827; margin-bottom: 6px; }
.sig-name { font-weight: 700; font-size: 10pt; }
.sig-role, .sig-dept { font-size: 9.2pt; color: #374151; margin-top: 2px; }
.issuer-contact { margin-top: 11px; font-size: 9.2pt; }
.references { margin-top: 10px; font-size: 9.2pt; }
.references ul { margin: 4px 0 0 18px; padding: 0; }
.company-footer { margin-top: 10px; font-size: 8.8pt; color: #4b5563; border-top: 0.8px solid #e5e7eb; padding-top: 7px; }

.marks-table td:nth-child(1) { width: 22%; }
.marks-table td:nth-child(3) { width: 12%; text-align: center; }

.layout-landscape .kv-table th { width: 28%; }
.layout-landscape .sig-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;
}

export function renderEmploymentRecordHtml(
  data: EmploymentRecord,
  options: EmploymentRecordRenderOptions = {},
): string {
  const orientation =
    options.orientation === 'landscape' ? 'landscape' : 'portrait';

  const certificateStyle = isCertificateStyle(data);

  const contentSizeScore =
    (data.body_paragraphs?.length ?? 0) +
    (data.duties_and_responsibilities?.length ?? 0) +
    (data.employment_timeline?.length ?? 0);

  const signatureOnNewPage =
    options.forceSignatureOnNewPage ??
    ((options.pageCount ?? 1) >= 2 || contentSizeScore >= 11);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>${buildCss(orientation, certificateStyle)}</style>
</head>
<body class="layout-${orientation}">
  <main class="document">
    ${renderHeader(data)}
    ${renderIssueBlock(data)}
    ${certificateStyle ? renderCertificateStyleStatement(data) : ''}
    ${renderIdentitySection(data)}
    ${renderTimeline(data.employment_timeline)}
    ${renderDuties(data.duties_and_responsibilities)}
    ${renderSalaryBlock(data)}
    ${renderBodyParagraphs(data.body_paragraphs)}
    ${renderVisualElements(data.visual_elements)}
    ${renderSignatureSection(data, signatureOnNewPage)}
  </main>
</body>
</html>`;

  return html;
}

