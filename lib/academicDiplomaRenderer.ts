/**
 * lib/academicDiplomaRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic HTML renderer for structured academic diploma and degree
 * certificate data.
 *
 * Input:  AcademicDiplomaCertificate (validated JSON from previewStructuredKit)
 * Output: Self-contained HTML string, ready for Gotenberg/Chromium rendering.
 *
 * Rendering modes (driven by pageCount):
 *   pageCount === 1 or undefined → single-page layout
 *   pageCount >= 2               → two-page layout with explicit page break;
 *                                  page 1 = diploma body, page 2 = supplementary
 *                                  content, additional visual elements
 *
 * Orientation (driven by orientation option):
 *   'landscape' → CSS @page landscape hint + data-orientation="landscape"
 *                 attribute, triggering landscape CSS overrides.
 *                 Gotenberg must be called with landscape paper dimensions.
 *   'portrait' | 'unknown' | undefined → portrait layout (default).
 *
 * Design goals:
 *   - Document-like, institutional visual rhythm — not decorative
 *   - Recipient name and degree title visually prominent
 *   - Conferral statement rendered as indented formal text
 *   - Registration numbers in a clean labeled grid
 *   - Signatories in a consistent row layout
 *   - Multi-page: supplementary content on page 2 as structured text
 *   - Deterministic: same input → identical output
 *   - Resilient: missing/empty fields silently omitted; never throws
 *   - Isolated: pure function, no side effects
 *
 * This module does NOT affect the legacy pipeline, Workbench,
 * generateDeliveryKit.ts, translationHtmlSanitizer.ts, or the API response.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  AcademicDiplomaCertificate,
  AcademicSignatory,
  RegistrationNumber,
  VisualElement,
} from '@/types/academicDiploma';

// ── Public types ──────────────────────────────────────────────────────────────

export interface AcademicDiplomaRenderOptions {
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

// ── Visual elements section ───────────────────────────────────────────────────

const VISUAL_ELEMENT_LABELS: Record<string, string> = {
  letterhead:          'Letterhead',
  seal:                'Official Seal',
  embossed_seal:       'Embossed Seal',
  dry_seal:            'Dry Seal',
  stamp:               'Official Stamp',
  signature:           'Signature',
  electronic_signature:'Electronic Signature',
  initials:            'Initials',
  watermark:           'Watermark',
  qr_code:             'QR Code',
  barcode:             'Barcode',
  official_logo:       'Official Logo',
  handwritten_note:    'Handwritten Note',
  margin_annotation:   'Margin Annotation',
  revenue_stamp:       'Revenue Stamp',
  notarial_mark:       'Notarial Mark',
  other_official_mark: 'Official Mark',
};

function normaliseElementType(raw: string): string {
  const normalised = (raw ?? '').toLowerCase().replace(/[^a-z_]/g, '_');
  return VISUAL_ELEMENT_LABELS[normalised] ?? 'Official Mark';
}

function renderVisualElements(
  elements: VisualElement[] | undefined,
  pageFilter?: string,
): string {
  if (!elements || elements.length === 0) return '';
  const filtered = pageFilter
    ? elements.filter(e => (e.page ?? '1') === pageFilter)
    : elements;
  if (filtered.length === 0) return '';

  const rows = filtered.map(el => {
    const typeLabel = normaliseElementType(el.type);
    const desc      = escapeHtml(el.description);
    const text      = nonEmpty(el.text);
    return `      <tr>
        <td class="ve-type">${escapeHtml(typeLabel)}</td>
        <td class="ve-desc">${desc}${text ? ` — <span class="ve-text">${escapeHtml(text)}</span>` : ''}</td>
      </tr>`;
  }).join('\n');

  return `
  <section class="section documentary-marks">
    <h2 class="section-label">DOCUMENTARY MARKS</h2>
    <table class="ve-table">
      <tbody>
${rows}
      </tbody>
    </table>
  </section>`;
}

// ── Registration numbers section ──────────────────────────────────────────────

function renderRegistrationNumbers(numbers: RegistrationNumber[]): string {
  if (!numbers || numbers.length === 0) return '';
  const items = numbers
    .filter(n => nonEmpty(n.value))
    .map(n => `<span class="reg-item"><span class="reg-label">${escapeHtml(n.label)}:</span> <span class="reg-value">${escapeHtml(n.value)}</span></span>`)
    .join('\n      ');
  if (!items) return '';
  return `
  <section class="section reg-section">
    <div class="reg-row">
      ${items}
    </div>
  </section>`;
}

// ── Signatories section ───────────────────────────────────────────────────────

function renderSignatories(signatories: AcademicSignatory[]): string {
  if (!signatories || signatories.length === 0) return '';
  const items = signatories
    .filter(s => nonEmpty(s.name) || nonEmpty(s.role))
    .map(s => {
      const name = nonEmpty(s.name) ? `<div class="sig-name">${escapeHtml(s.name)}</div>` : '';
      const role = nonEmpty(s.role) ? `<div class="sig-role">${escapeHtml(s.role)}</div>` : '';
      const inst = nonEmpty(s.institution) ? `<div class="sig-inst">${escapeHtml(s.institution)}</div>` : '';
      return `<div class="sig-block">${name}${role}${inst}</div>`;
    })
    .join('\n      ');
  if (!items) return '';
  return `
  <section class="section signatories">
    <h2 class="section-label">SIGNATORIES</h2>
    <div class="sig-row">
      ${items}
    </div>
  </section>`;
}

// ── Page markers ──────────────────────────────────────────────────────────────

function renderPageMarkers(markers: string[]): string {
  if (!markers || markers.length === 0) return '';
  const items = markers
    .filter(m => nonEmpty(m))
    .map(m => `<span class="page-marker">${escapeHtml(m)}</span>`)
    .join(' &nbsp;·&nbsp; ');
  if (!items) return '';
  return `<div class="page-markers">${items}</div>`;
}

// ── Page 1: diploma body ──────────────────────────────────────────────────────

function renderPage1(
  data: AcademicDiplomaCertificate,
  isLandscape: boolean,
): string {
  const diplomaTitle   = nonEmpty(data.diploma_title);
  const documentLabel  = nonEmpty(data.document_label);
  const institution    = nonEmpty(data.issuing_institution);
  const subheading     = nonEmpty(data.institution_subheading);
  const recipient      = nonEmpty(data.recipient_name);
  const degreeTitle    = nonEmpty(data.degree_title);
  const program        = nonEmpty(data.program_or_course);
  const conferral      = nonEmpty(data.conferral_statement);
  const conferralDate  = nonEmpty(data.conferral_date);
  const issueDate      = nonEmpty(data.issue_date);
  const location       = nonEmpty(data.location);
  const authNotes      = nonEmpty(data.authentication_notes);
  const markers        = (data.page_markers ?? []).filter(m => nonEmpty(m));

  // Date / location line
  const dateParts: string[] = [];
  if (conferralDate) dateParts.push(conferralDate);
  if (issueDate && issueDate !== conferralDate) dateParts.push(`Issued: ${issueDate}`);
  if (location) dateParts.push(location);
  const dateLocationLine = dateParts.join(' &nbsp;&bull;&nbsp; ');

  return `<div class="page${isLandscape ? ' landscape-page' : ''}" data-orientation="${isLandscape ? 'landscape' : 'portrait'}">

  <!-- ── Header ── -->
  <header class="diploma-header">
    ${institution ? `<div class="institution-name">${escapeHtml(institution)}</div>` : ''}
    ${subheading   ? `<div class="institution-sub">${escapeHtml(subheading)}</div>` : ''}
    ${diplomaTitle ? `<div class="diploma-title">${escapeHtml(diplomaTitle)}</div>` : ''}
    ${documentLabel ? `<div class="document-label">${escapeHtml(documentLabel)}</div>` : ''}
    <div class="header-rule"></div>
  </header>

  <!-- ── Recipient & degree ── -->
  <section class="section recipient-section">
    <div class="confers-to">hereby confers upon</div>
    ${recipient ? `<div class="recipient-name">${escapeHtml(recipient)}</div>` : ''}
    <div class="degree-of">the degree of</div>
    ${degreeTitle ? `<div class="degree-title">${escapeHtml(degreeTitle)}</div>` : ''}
    ${program && program !== degreeTitle ? `<div class="program-name">${escapeHtml(program)}</div>` : ''}
  </section>

  <!-- ── Conferral statement ── -->
  ${conferral ? `
  <section class="section conferral-section">
    <blockquote class="conferral-text">${escapeHtml(conferral)}</blockquote>
  </section>` : ''}

  <!-- ── Date / location ── -->
  ${dateLocationLine ? `
  <section class="section date-section">
    <div class="date-location">${dateLocationLine}</div>
  </section>` : ''}

  <!-- ── Registration numbers ── -->
  ${renderRegistrationNumbers(data.registration_numbers ?? [])}

  <!-- ── Authentication notes ── -->
  ${authNotes ? `
  <section class="section auth-section">
    <div class="auth-notes">${escapeHtml(authNotes)}</div>
  </section>` : ''}

  <!-- ── Signatories ── -->
  ${renderSignatories(data.signatories ?? [])}

  <!-- ── Documentary marks (page 1) ── -->
  ${renderVisualElements(data.visual_elements, '1')}

  <!-- ── Page markers ── -->
  ${markers.length > 0 ? renderPageMarkers(markers) : ''}

</div>`;
}

// ── Page 2: supplementary content ────────────────────────────────────────────

function renderPage2(
  data: AcademicDiplomaCertificate,
  isLandscape: boolean,
): string {
  const suppNotes = nonEmpty(data.supplementary_notes);
  const page2Elements = (data.visual_elements ?? []).filter(e => (e.page ?? '1') === '2');
  if (!suppNotes && page2Elements.length === 0) return '';

  return `
<div class="page-break"></div>

<div class="page${isLandscape ? ' landscape-page' : ''}" data-orientation="${isLandscape ? 'landscape' : 'portrait'}">

  <header class="supp-header">
    <div class="supp-label">ACADEMIC RECORD SUPPLEMENT</div>
    <div class="header-rule"></div>
  </header>

  ${suppNotes ? `
  <section class="section supp-section">
    <div class="supp-text">${escapeHtml(suppNotes)}</div>
  </section>` : ''}

  ${page2Elements.length > 0 ? renderVisualElements(page2Elements) : ''}

</div>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function buildCss(isLandscape: boolean): string {
  return `
    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      line-height: 1.5;
      background: #fff;
      color: #111;
      margin: 0;
      padding: 0;
    }

    /* ── Page container ── */
    .page {
      width: 100%;
      padding: 0;
    }

    /* ── Header ── */
    .diploma-header {
      text-align: center;
      margin-bottom: 16pt;
    }

    .institution-name {
      font-size: 13pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      line-height: 1.3;
      margin-bottom: 3pt;
    }

    .institution-sub {
      font-size: 10pt;
      color: #444;
      margin-bottom: 6pt;
    }

    .diploma-title {
      font-size: 20pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-top: 10pt;
      margin-bottom: 3pt;
    }

    .document-label {
      font-size: 11pt;
      color: #333;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4pt;
    }

    .header-rule {
      border: none;
      border-top: 1.5pt solid #222;
      margin: 8pt auto 0 auto;
      width: 80%;
    }

    /* ── Sections ── */
    .section {
      margin-bottom: 12pt;
    }

    .section-label {
      font-size: 8pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #666;
      margin: 0 0 5pt 0;
      padding-bottom: 2pt;
      border-bottom: 0.5pt solid #ddd;
    }

    /* ── Recipient / degree ── */
    .recipient-section {
      text-align: center;
      margin-top: 14pt;
      margin-bottom: 14pt;
    }

    .confers-to {
      font-size: 9.5pt;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 4pt;
    }

    .recipient-name {
      font-size: 17pt;
      font-weight: bold;
      border-bottom: 1pt solid #999;
      display: inline-block;
      padding-bottom: 3pt;
      margin-bottom: 8pt;
      letter-spacing: 0.02em;
    }

    .degree-of {
      font-size: 9pt;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 3pt;
    }

    .degree-title {
      font-size: 13pt;
      font-weight: bold;
      letter-spacing: 0.02em;
      margin-bottom: 4pt;
    }

    .program-name {
      font-size: 10pt;
      color: #444;
      font-style: italic;
    }

    /* ── Conferral statement ── */
    .conferral-section {
      border-left: 2pt solid #bbb;
      padding-left: 10pt;
      margin-left: 8pt;
    }

    .conferral-text {
      font-size: 10pt;
      font-style: italic;
      color: #222;
      line-height: 1.6;
      margin: 0;
      padding: 0;
    }

    /* ── Date / location ── */
    .date-section {
      text-align: center;
      border-top: 0.5pt solid #ddd;
      padding-top: 7pt;
    }

    .date-location {
      font-size: 9.5pt;
      color: #444;
    }

    /* ── Registration numbers ── */
    .reg-section {
      border-top: 0.5pt solid #ddd;
      padding-top: 7pt;
    }

    .reg-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6pt 18pt;
      justify-content: center;
    }

    .reg-item {
      font-size: 9pt;
      white-space: nowrap;
    }

    .reg-label {
      color: #666;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .reg-value {
      font-family: 'Courier New', Courier, monospace;
      font-size: 9pt;
      color: #111;
    }

    /* ── Authentication notes ── */
    .auth-section {
      text-align: center;
    }

    .auth-notes {
      font-size: 8.5pt;
      color: #555;
      font-style: italic;
    }

    /* ── Signatories ── */
    .signatories {
      border-top: 0.5pt solid #ddd;
      padding-top: 8pt;
      margin-top: 12pt;
    }

    .sig-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8pt 24pt;
      justify-content: center;
    }

    .sig-block {
      text-align: center;
      min-width: 100pt;
    }

    .sig-name {
      font-size: 9.5pt;
      font-weight: bold;
      line-height: 1.3;
    }

    .sig-role {
      font-size: 8.5pt;
      color: #555;
      font-style: italic;
    }

    .sig-inst {
      font-size: 8pt;
      color: #777;
    }

    /* ── Documentary marks ── */
    .documentary-marks {
      border-top: 0.5pt solid #ddd;
      padding-top: 8pt;
      margin-top: 12pt;
    }

    .ve-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }

    .ve-table td {
      padding: 3pt 6pt;
      vertical-align: top;
    }

    .ve-type {
      font-weight: bold;
      white-space: nowrap;
      width: 28%;
      color: #333;
    }

    .ve-desc {
      color: #444;
    }

    .ve-text {
      font-style: italic;
      color: #666;
    }

    /* ── Page markers ── */
    .page-markers {
      text-align: center;
      font-size: 8pt;
      color: #888;
      margin-top: 10pt;
      letter-spacing: 0.04em;
    }

    .page-marker {
      font-size: 8pt;
      color: #999;
    }

    /* ── Page break ── */
    .page-break {
      page-break-after: always;
      break-after: page;
    }

    /* ── Supplementary page ── */
    .supp-header {
      text-align: center;
      margin-bottom: 14pt;
    }

    .supp-label {
      font-size: 10pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #333;
      margin-bottom: 4pt;
    }

    .supp-text {
      font-size: 10pt;
      line-height: 1.6;
      white-space: pre-line;
    }

    /* ── Landscape overrides ── */
    ${isLandscape ? `
    @page { size: landscape; }

    .landscape-page {
      /* Landscape: reduce font slightly for wider content */
    }

    .diploma-title {
      font-size: 18pt;
    }

    .recipient-name {
      font-size: 15pt;
    }

    .diploma-header {
      margin-bottom: 12pt;
    }

    .sig-row {
      justify-content: space-evenly;
    }
    ` : ''}
  `;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

/**
 * Renders the academic diploma / degree certificate as a self-contained HTML string.
 *
 * Never throws. Falls back to an empty-body document if the input is completely
 * missing, so the caller always gets a safe result.
 */
export function renderAcademicDiplomaHtml(
  data: AcademicDiplomaCertificate,
  options: AcademicDiplomaRenderOptions = {},
): string {
  try {
    const pageCount  = options.pageCount;
    const isLandscape = options.orientation === 'landscape';
    const useMultiPage = typeof pageCount === 'number' && pageCount >= 2;

    const page1Html = renderPage1(data, isLandscape);
    const page2Html = useMultiPage ? renderPage2(data, isLandscape) : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
${buildCss(isLandscape)}
  </style>
</head>
<body>
${page1Html}
${page2Html}
</body>
</html>`;
  } catch {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><style>body{font-family:Arial;font-size:11pt;}</style></head>
<body><p>[Diploma rendering error — see server logs]</p></body>
</html>`;
  }
}
