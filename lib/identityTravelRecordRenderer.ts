/**
 * lib/identityTravelRecordRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic premium renderer for compact identity/travel documents.
 *
 * Design goals:
 *   - compact official-record presentation
 *   - clear label/value readability
 *   - photo and machine-readable region awareness
 *   - support for grouped multi-page travel evidence
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  IdentityMachineReadableRegion,
  IdentityPhotoRegion,
  IdentityTravelEvent,
  IdentityTravelMetaItem,
  IdentityTravelRecord,
  IdentityTravelSignatory,
  VisualElement,
} from '@/types/identityTravelRecord';

export interface IdentityTravelRecordRenderOptions {
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

function renderHeader(data: IdentityTravelRecord): string {
  const title = nonEmpty(data.document_title) ?? 'IDENTITY / TRAVEL RECORD';
  const subtype = nonEmpty(data.document_subtype)?.replace(/_/g, ' ');
  const authorityLine = [data.issuing_country, data.issuing_authority]
    .map((v) => nonEmpty(v))
    .filter((v): v is string => Boolean(v))
    .join(' — ');

  return `
<header class="doc-header">
  <div class="title-row">
    <div class="doc-title">${escapeHtml(title)}</div>
    ${subtype ? `<div class="doc-subtype">${escapeHtml(subtype.toUpperCase())}</div>` : ''}
  </div>
  ${authorityLine ? `<div class="authority-line">${escapeHtml(authorityLine)}</div>` : ''}
  <div class="header-rule"></div>
</header>`;
}

function renderIdentityCore(data: IdentityTravelRecord): string {
  const rows: Array<[string, string]> = [
    ['Surname', data.surname],
    ['Given Names', data.given_names],
    ['Full Name Line', data.full_name_line],
    ['Nationality', data.nationality],
    ['Date of Birth', data.date_of_birth],
    ['Place of Birth', data.place_of_birth],
    ['Sex', data.sex],
    ['Document Number', data.document_number],
    ['Secondary Identifier', data.secondary_identifier],
    ['Issue Date', data.issue_date],
    ['Expiration Date', data.expiration_date],
  ].filter(
    (row): row is [string, string] =>
      nonEmpty(row[0]) !== null && nonEmpty(row[1]) !== null,
  );

  const tableRows = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  return `
<section class="section identity-core">
  <h2 class="section-title">IDENTITY DATA</h2>
  <table class="kv-table">
    <tbody>${tableRows}</tbody>
  </table>
</section>`;
}

function renderPhotoRegion(photoRegion: IdentityPhotoRegion | null): string {
  if (!photoRegion) return '';
  const hasAny =
    photoRegion.present ||
    nonEmpty(photoRegion.description) ||
    nonEmpty(photoRegion.caption) ||
    nonEmpty(photoRegion.page);
  if (!hasAny) return '';

  return `
<section class="section photo-region">
  <h2 class="section-title">PHOTO REGION</h2>
  <div class="photo-card">
    <div class="photo-placeholder">Photo Area</div>
    <div class="photo-meta">
      ${nonEmpty(photoRegion.description) ? `<div>${escapeHtml(photoRegion.description)}</div>` : ''}
      ${nonEmpty(photoRegion.caption) ? `<div class="photo-caption">${escapeHtml(photoRegion.caption)}</div>` : ''}
      ${nonEmpty(photoRegion.page) ? `<div class="photo-page">Page ${escapeHtml(photoRegion.page)}</div>` : ''}
      <div class="photo-presence">Present: ${photoRegion.present ? 'Yes' : 'No'}</div>
    </div>
  </div>
</section>`;
}

function renderTravelAdmission(data: IdentityTravelRecord, events: IdentityTravelEvent[]): string {
  const summaryRows: Array<[string, string]> = [
    ['Visa Category', data.visa_category],
    ['Visa Entries', data.visa_entries],
    ['Admission Class', data.admission_class],
    ['Admit Until Date', data.admit_until_date],
    ['Port of Entry', data.port_of_entry],
    ['Entry Date', data.entry_date],
    ['Exit Date', data.exit_date],
  ].filter(
    (row): row is [string, string] =>
      nonEmpty(row[0]) !== null && nonEmpty(row[1]) !== null,
  );

  const summaryTable = summaryRows.length
    ? `<table class="kv-table compact-table"><tbody>${
        summaryRows
          .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
          .join('')
      }</tbody></table>`
    : '';

  const eventRows = (events ?? [])
    .filter((event) => nonEmpty(event.event_type) || nonEmpty(event.date) || nonEmpty(event.location))
    .map((event) => {
      const eventType = nonEmpty(event.event_type) ?? '&mdash;';
      const date = nonEmpty(event.date) ?? '&mdash;';
      const location = nonEmpty(event.location) ?? '&mdash;';
      const klass = nonEmpty(event.class_or_status) ?? '&mdash;';
      const notes = nonEmpty(event.notes) ?? '&mdash;';
      return `<tr>
  <td>${escapeHtml(eventType)}</td>
  <td>${escapeHtml(date)}</td>
  <td>${escapeHtml(location)}</td>
  <td>${escapeHtml(klass)}</td>
  <td>${escapeHtml(notes)}</td>
</tr>`;
    })
    .join('');

  if (!summaryTable && !eventRows) return '';

  return `
<section class="section travel-section">
  <h2 class="section-title">TRAVEL / ADMISSION</h2>
  ${summaryTable}
  ${eventRows ? `<table class="grid-table event-table">
    <thead>
      <tr>
        <th>Event</th>
        <th>Date</th>
        <th>Location</th>
        <th>Class / Status</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${eventRows}</tbody>
  </table>` : ''}
</section>`;
}

function renderMetadataGrid(items: IdentityTravelMetaItem[]): string {
  const rows = (items ?? [])
    .filter((item) => nonEmpty(item.label) && nonEmpty(item.value))
    .map((item) => `<tr><th>${escapeHtml(item.label)}</th><td>${escapeHtml(item.value)}</td></tr>`)
    .join('');
  if (!rows) return '';
  return `
<section class="section meta-section">
  <h2 class="section-title">ADDITIONAL METADATA</h2>
  <table class="kv-table"><tbody>${rows}</tbody></table>
</section>`;
}

function renderMachineReadableRegions(regions: IdentityMachineReadableRegion[]): string {
  const cards = (regions ?? [])
    .filter((region) => nonEmpty(region.description) || (region.lines ?? []).length > 0)
    .map((region) => {
      const label = escapeHtml(region.region_type || 'other');
      const description = nonEmpty(region.description);
      const lines = (region.lines ?? []).map((line) => line.trim()).filter(Boolean);
      const codeBlock = lines.length
        ? `<pre class="code-block">${escapeHtml(lines.join('\n'))}</pre>`
        : '<pre class="code-block code-empty">No extracted line data</pre>';
      const page = nonEmpty(region.page);
      return `<article class="machine-card">
  <div class="machine-label">${label.toUpperCase()}</div>
  ${description ? `<div class="machine-description">${escapeHtml(description)}</div>` : ''}
  ${codeBlock}
  ${page ? `<div class="machine-page">Page ${escapeHtml(page)}</div>` : ''}
</article>`;
    })
    .join('');

  if (!cards) return '';
  return `
<section class="section machine-section">
  <h2 class="section-title">MACHINE-READABLE / CODE REGIONS</h2>
  <div class="machine-grid">${cards}</div>
</section>`;
}

function renderNotes(data: IdentityTravelRecord): string {
  const pageSetNotes = (data.page_set_notes ?? []).map((note) => note.trim()).filter(Boolean);
  const bodyNotes = (data.body_notes ?? []).map((note) => note.trim()).filter(Boolean);

  if (pageSetNotes.length === 0 && bodyNotes.length === 0) return '';

  return `
<section class="section notes-section">
  <h2 class="section-title">DOCUMENT NOTES</h2>
  ${pageSetNotes.length > 0 ? `<div><strong>Page Set Notes:</strong><ul>${pageSetNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>` : ''}
  ${bodyNotes.length > 0 ? `<div><strong>Additional Notes:</strong><ul>${bodyNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>` : ''}
</section>`;
}

function renderAuthorityFooter(data: IdentityTravelRecord): string {
  const signatories = (data.signatories ?? [])
    .filter((entry: IdentityTravelSignatory) => nonEmpty(entry.name) || nonEmpty(entry.role))
    .map((entry) => `<div class="sig-card">
  <div class="sig-line"></div>
  ${nonEmpty(entry.name) ? `<div class="sig-name">${escapeHtml(entry.name)}</div>` : ''}
  ${nonEmpty(entry.role) ? `<div class="sig-role">${escapeHtml(entry.role)}</div>` : ''}
  ${nonEmpty(entry.authority) ? `<div class="sig-authority">${escapeHtml(entry.authority)}</div>` : ''}
</div>`)
    .join('');

  const footer = nonEmpty(data.authority_footer);
  const refs = (data.attachments_or_references ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');

  if (!signatories && !footer && !refs) return '';

  return `
<section class="section authority-section">
  <h2 class="section-title">ISSUING AUTHORITY</h2>
  ${signatories ? `<div class="sig-grid">${signatories}</div>` : ''}
  ${footer ? `<div class="authority-footer">${escapeHtml(footer)}</div>` : ''}
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

function buildCss(orientation: 'portrait' | 'landscape'): string {
  const pageRule =
    orientation === 'landscape'
      ? '@page { size: letter landscape; margin: 0.38in; }'
      : '@page { size: letter portrait; margin: 0.48in; }';

  return `
${pageRule}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Arial, Helvetica, sans-serif;
  color: #111827;
  font-size: 9.8pt;
  line-height: 1.35;
}
.document { width: 100%; }
.doc-header { margin-bottom: 10px; }
.title-row { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
.doc-title { font-size: 12pt; font-weight: 700; letter-spacing: 0.45px; text-transform: uppercase; }
.doc-subtype { font-size: 8.2pt; font-weight: 700; color: #1f2937; border: 1px solid #d1d5db; border-radius: 999px; padding: 2px 9px; }
.authority-line { margin-top: 3px; color: #374151; font-size: 8.9pt; }
.header-rule { border-top: 1px solid #111827; margin-top: 8px; }

.section { margin-top: 10px; page-break-inside: avoid; }
.section-title {
  margin: 0 0 5px;
  font-size: 8.9pt;
  letter-spacing: 0.75px;
  text-transform: uppercase;
  font-weight: 700;
  color: #1f2937;
}

.kv-table, .grid-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.9pt;
}
.kv-table th, .kv-table td, .grid-table th, .grid-table td {
  border: 0.8px solid #d1d5db;
  padding: 4px 6px;
  vertical-align: top;
}
.kv-table th, .grid-table th {
  background: #f8fafc;
  text-align: left;
  font-weight: 700;
}
.kv-table th { width: 35%; }
.compact-table { margin-bottom: 8px; }

.photo-card {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px;
  border: 0.9px solid #d1d5db;
  border-radius: 8px;
  padding: 8px;
  background: #fbfcfd;
}
.photo-placeholder {
  min-height: 120px;
  border: 1px dashed #cbd5e1;
  background: linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 8.6pt;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.photo-meta { font-size: 8.8pt; }
.photo-caption { margin-top: 3px; color: #374151; }
.photo-page { margin-top: 3px; color: #4b5563; }
.photo-presence { margin-top: 5px; font-weight: 700; }

.event-table { margin-top: 8px; }

.machine-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.machine-card {
  border: 0.9px solid #d1d5db;
  border-radius: 8px;
  padding: 8px;
  background: #fcfcfd;
}
.machine-label { font-size: 8.4pt; font-weight: 700; letter-spacing: 0.6px; }
.machine-description { margin-top: 3px; font-size: 8.7pt; color: #374151; }
.code-block {
  margin: 6px 0 0;
  padding: 6px 7px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #f8fafc;
  font-family: "Courier New", Courier, monospace;
  font-size: 8.2pt;
  line-height: 1.3;
  white-space: pre-wrap;
  word-break: break-all;
}
.code-empty { color: #6b7280; font-style: italic; }
.machine-page { margin-top: 4px; font-size: 8.3pt; color: #6b7280; }

ul { margin: 4px 0 0 18px; padding: 0; }
li { margin: 0 0 4px; }

.sig-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.sig-card { padding-top: 16px; }
.sig-line { border-top: 1px solid #111827; margin-bottom: 5px; }
.sig-name { font-weight: 700; }
.sig-role, .sig-authority { margin-top: 2px; color: #374151; font-size: 8.7pt; }
.authority-footer {
  margin-top: 9px;
  border-top: 0.8px solid #e5e7eb;
  padding-top: 7px;
  color: #4b5563;
  font-size: 8.8pt;
}
.references { margin-top: 7px; font-size: 8.8pt; }

.marks-table td:nth-child(1) { width: 22%; }
.marks-table td:nth-child(3) { width: 10%; text-align: center; }

.layout-landscape .machine-grid,
.layout-landscape .sig-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;
}

export function renderIdentityTravelRecordHtml(
  data: IdentityTravelRecord,
  options: IdentityTravelRecordRenderOptions = {},
): string {
  const orientation =
    options.orientation === 'landscape' ? 'landscape' : 'portrait';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>${buildCss(orientation)}</style>
</head>
<body class="layout-${orientation}">
  <main class="document">
    ${renderHeader(data)}
    ${renderIdentityCore(data)}
    ${renderPhotoRegion(data.photo_region)}
    ${renderTravelAdmission(data, data.travel_events)}
    ${renderMetadataGrid(data.metadata_grid)}
    ${renderMachineReadableRegions(data.machine_readable_regions)}
    ${renderNotes(data)}
    ${renderAuthorityFooter(data)}
    ${renderVisualElements(data.visual_elements)}
  </main>
</body>
</html>`;

  return html;
}
