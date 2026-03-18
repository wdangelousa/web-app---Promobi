/**
 * lib/certificateLandscapeRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic HTML renderer for structured landscape certificate data.
 *
 * Input:  CourseCertificateLandscape (validated JSON from structuredPipeline.ts)
 * Output: Self-contained HTML string, ready for Gotenberg/Chromium rendering.
 *
 * Rendering modes (driven by pageCount):
 *   pageCount === 1 or undefined → single-page layout (most certificates)
 *   pageCount >= 2               → two-page layout with explicit page break;
 *                                  page 1 = core content, page 2 = signatories
 *                                  + documentary marks
 *
 * Orientation (driven by orientation option):
 *   'landscape' → CSS @page landscape hint + data-orientation="landscape"
 *                 attribute, which triggers landscape CSS overrides.
 *                 The kit layer applies the global translated safe-area policy.
 *   'portrait' | 'unknown' | undefined → standard portrait layout (default).
 *
 * Letterhead injection:
 *   structuredPreview.ts injects <img class="letterhead-img"> at the start of
 *   every <div class="page"[^>]*> — the regex in injectLetterheadIntoHtml
 *   handles the data-orientation attribute transparently.
 *
 * Design goals:
 *   - Certificate visual logic, NOT form logic (no label/value rows for core fields)
 *   - Institutionally formal, translation-oriented, not decorative
 *   - Handwritten content rendered honestly: illegible stays illegible
 *   - Deterministic: same input always produces identical output
 *   - Resilient: missing/empty fields are silently omitted; never throws
 *   - Isolated: pure function, no side effects, no DB/network calls
 *
 * This module does NOT affect the legacy pipeline, Workbench,
 * generateDeliveryKit.ts, translationHtmlSanitizer.ts, or the API response.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  CourseCertificateLandscape,
  SignatoryEntry,
  HandwrittenField,
  VisualElement,
} from '@/types/certificateLandscape';

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * pageCount: number of pages in the *original* source document.
 *   1 or undefined → single-page layout
 *   >= 2           → two-page layout with explicit page break
 *
 * orientation: detected orientation of the original source document.
 *   'landscape' → landscape CSS + data-orientation attribute
 *   'portrait' | 'unknown' | undefined → portrait fallback (current behavior)
 */
export interface CertificateLandscapeRenderOptions {
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


// ── Documentary marks ─────────────────────────────────────────────────────────

/** Maps raw element type values to normalized display labels. */
const VISUAL_LABEL_MAP: Record<string, string> = {
  letterhead:           'Letterhead',
  seal:                 'Seal',
  embossed_seal:        'Embossed seal',
  dry_seal:             'Dry seal',
  stamp:                'Stamp',
  signature:            'Signature',
  electronic_signature: 'Electronic signature',
  initials:             'Initials',
  watermark:            'Watermark',
  qr_code:              'QR code',
  barcode:              'Barcode',
  official_logo:        'Official logo',
  logo:                 'Official logo',
  handwritten_note:     'Handwritten note',
  margin_annotation:    'Margin annotation',
  notarial_mark:        'Notarial mark',
  other_official_mark:  'Other official mark',
};

/** Lower number = higher rendering priority. */
const VISUAL_TYPE_PRIORITY: Record<string, number> = {
  signature:            1,
  electronic_signature: 1,
  seal:                 2,
  embossed_seal:        2,
  dry_seal:             2,
  stamp:                3,
  qr_code:              4,
  barcode:              4,
  letterhead:           5,
  official_logo:        5,
  logo:                 5,
  watermark:            6,
  handwritten_note:     7,
  margin_annotation:    7,
  notarial_mark:        8,
  initials:             9,
  other_official_mark:  10,
};

// Documentary marks must never be truncated — full text required for USCIS fidelity.

function toDisplayLabel(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatMarkLine(el: VisualElement): string {
  const rawType = (el.type || 'other_official_mark').toLowerCase().replace(/[-\s]+/g, '_');
  const label   = VISUAL_LABEL_MAP[rawType] ?? toDisplayLabel(rawType);
  const desc    = (el.description || '').trim();
  const isLegNote = el.text === 'illegible' || el.text === 'partially legible';

  let content: string;
  if (desc) {
    const descLower = desc.toLowerCase();
    const alreadyNoted = descLower.includes('illegible') || descLower.includes('partially legible');
    content = (isLegNote && !alreadyNoted) ? `${desc} (${el.text})` : desc;
  } else if (el.text) {
    content = el.text.trim();
  } else {
    content = 'present';
  }
  return `${label}: ${content}`;
}

function renderVisualMarks(elements: VisualElement[] | undefined): string {
  if (!elements || elements.length === 0) return '';
  const sorted = [...elements]
    .sort((a, b) => {
      const pa = VISUAL_TYPE_PRIORITY[(a.type || '').toLowerCase()] ?? 99;
      const pb = VISUAL_TYPE_PRIORITY[(b.type || '').toLowerCase()] ?? 99;
      return pa - pb;
    });
  const items = sorted
    .map(el => `<div class="mark-item">\u2022 ${escapeHtml(formatMarkLine(el))}</div>`)
    .join('');
  return (
    `<div class="marks-section">` +
    `<div class="marks-section-label">Documentary Marks</div>` +
    items +
    `</div>`
  );
}

// ── Section renderers ─────────────────────────────────────────────────────────

function renderHeader(data: CourseCertificateLandscape): string {
  const title       = (data.certificate_title ?? '').trim() || 'CERTIFICATE';
  const institution = (data.issuing_institution ?? '').trim();
  const sub         = (data.institution_subheading ?? '').trim();
  return (
    `<div class="cert-header">` +
    `<div class="cert-title">${escapeHtml(title)}</div>` +
    (institution ? `<div class="institution-name">${escapeHtml(institution)}</div>` : '') +
    (sub         ? `<div class="institution-sub">${escapeHtml(sub)}</div>`          : '') +
    `</div>`
  );
}

function renderRecipient(data: CourseCertificateLandscape): string {
  const name   = (data.recipient_name ?? '').trim();
  const source = data.recipient_name_source ?? 'unknown';

  // Legibility-based rendering: never present illegible text as normal content.
  const isIllegible = name === 'illegible' || name === 'partially legible' || !name;
  const nameClass   = isIllegible ? 'recipient-name illegible' : 'recipient-name';
  const nameDisplay = isIllegible
    ? (name ? `[${escapeHtml(name)} \u2014 handwritten entry]` : '[recipient name unavailable]')
    : escapeHtml(name);

  // Compact handwritten indicator: shown only when name IS legible but was handwritten.
  const hwNote = !isIllegible && (source === 'handwritten' || source === 'mixed')
    ? `<div class="recipient-hw-note">(${source === 'mixed' ? 'mixed: printed/handwritten' : 'handwritten'})</div>`
    : '';

  return (
    `<div class="recipient-section">` +
    `<div class="recipient-bridge">This certifies that</div>` +
    `<div class="${nameClass}">${nameDisplay}</div>` +
    hwNote +
    `</div>`
  );
}

function renderContent(data: CourseCertificateLandscape): string {
  const statement = (data.completion_statement ?? '').trim();
  const course    = (data.course_or_program_name ?? '').trim();
  const workload  = (data.workload_or_hours ?? '').trim();
  const date      = (data.issue_date ?? '').trim();
  const location  = (data.location ?? '').trim();

  const statementHtml = statement
    ? `<div class="completion-statement">${escapeHtml(statement)}</div>`
    : '';

  const courseHtml = course
    ? `<div class="course-name-row">${escapeHtml(course)}</div>`
    : '';

  // Detail row: workload — date — location (only items present are rendered)
  const detailItems = [workload, date, location]
    .filter(Boolean)
    .map(v => `<span class="detail-item">${escapeHtml(v)}</span>`);
  const detailHtml = detailItems.length > 0
    ? `<div class="detail-row">${detailItems.join('<span class="detail-sep"> \u2014 </span>')}</div>`
    : '';

  if (!statementHtml && !courseHtml && !detailHtml) return '';

  return (
    `<div class="content-section">` +
    statementHtml + courseHtml + detailHtml +
    `</div>`
  );
}

/**
 * Renders handwritten fields beyond recipient_name.
 * Each field shows legibility status honestly; illegible values are visually
 * distinguished (italic, muted) so reviewers can spot them immediately.
 */
function renderHandwrittenFields(fields: HandwrittenField[]): string {
  if (!fields || fields.length === 0) return '';
  const rows = fields.map(f => {
    const label = (f.field || 'field')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    const value       = (f.value || '').trim();
    const isIllegible = f.legibility === 'illegible' || f.legibility === 'partially legible';
    const valueClass  = isIllegible ? 'hw-fv illegible-val' : 'hw-fv';
    const displayVal  = isIllegible
      ? escapeHtml(value || f.legibility || 'illegible')
      : escapeHtml(value);
    return (
      `<div class="hw-field-row">` +
      `<span class="hw-fl">${escapeHtml(label)}:</span>` +
      `<span class="${valueClass}">${displayVal}</span>` +
      `</div>`
    );
  }).join('');
  return (
    `<div class="hw-fields">` +
    `<div class="hw-fields-label">Handwritten Fields</div>` +
    rows +
    `</div>`
  );
}

function renderSignatories(signatories: SignatoryEntry[]): string {
  if (!signatories || signatories.length === 0) return '';
  const items = signatories.map(s => {
    const nameHtml = (s.name ?? '').trim()
      ? `<div class="sig-name">${escapeHtml(s.name.trim())}</div>`
      : '';
    const roleHtml = (s.role ?? '').trim()
      ? `<div class="sig-role">${escapeHtml(s.role.trim())}</div>`
      : '';
    const instHtml = (s.institution ?? '').trim()
      ? `<div class="sig-institution">${escapeHtml(s.institution!.trim())}</div>`
      : '';
    return (
      `<div class="signatory">` +
      `<div class="sig-line"></div>` +
      nameHtml + roleHtml + instHtml +
      `</div>`
    );
  }).join('');
  return (
    `<div class="signatories-section">` +
    `<div class="signatories-grid">${items}</div>` +
    `</div>`
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
// Note: @page rule is injected dynamically by renderCertificateLandscapeHtml
// based on the orientation option, so it is NOT included here.

const RENDERER_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 9pt;
  line-height: 1.4;
  color: #1a1a1a;
  background: #fff;
}

/* ── Page containers ────────────────────────────────────────────────────────
   Portrait (default): US Letter portrait, 8.5 × 11in physical.
   Outer margins come from the global translated safe-area policy in the kit
   layer. This renderer only controls inner layout rhythm.

   Landscape: US Letter landscape, 11 × 8.5in physical.
   The same policy applies; min-height remains tuned to avoid blank expansion. */

.page {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0.15in 0.25in 0.25in;
}
.page[data-orientation="landscape"] {
  padding: 0.2in 0.2in 0.15in;
}

/* Page break: forces a new PDF page. */
.page-break { break-after: page; page-break-after: always; }

/* ── Letterhead image (injected by structuredPreview.ts) ─────────────────── */
.letterhead-img {
  display: block;
  width: 100%;
  max-height: 0.9in;
  margin-bottom: 8pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
.page[data-orientation="landscape"] .letterhead-img {
  max-height: 0.65in;
  margin-bottom: 5pt;
}

/* ── Certificate header ───────────────────────────────────────────────────── */
.cert-header {
  text-align: center;
  border-bottom: 1.5pt solid #000;
  padding-bottom: 6pt;
  margin-bottom: 10pt;
}
.page[data-orientation="landscape"] .cert-header {
  padding-bottom: 4pt;
  margin-bottom: 6pt;
}
.cert-title {
  font-size: 13pt;
  font-weight: bold;
  letter-spacing: 0.08em;
  margin-bottom: 3pt;
}
.page[data-orientation="landscape"] .cert-title {
  font-size: 12pt;
  margin-bottom: 2pt;
}
.institution-name {
  font-size: 9.5pt;
  font-weight: bold;
  color: #222;
  margin-bottom: 1.5pt;
}
.institution-sub {
  font-size: 7.5pt;
  color: #555;
}

/* ── Recipient section ────────────────────────────────────────────────────── */
.recipient-section {
  text-align: center;
  margin-top: 6pt;
  margin-bottom: 10pt;
}
.page[data-orientation="landscape"] .recipient-section {
  margin-top: 4pt;
  margin-bottom: 7pt;
}
.recipient-bridge {
  font-size: 8.5pt;
  font-style: italic;
  color: #444;
  margin-bottom: 5pt;
}
.recipient-name {
  font-size: 14pt;
  font-weight: bold;
  letter-spacing: 0.03em;
  display: inline-block;
  border-bottom: 0.75pt solid #555;
  padding-bottom: 1pt;
  min-width: 3in;
}
.page[data-orientation="landscape"] .recipient-name {
  font-size: 13pt;
}
.recipient-name.illegible {
  font-style: italic;
  font-weight: normal;
  color: #888;
  font-size: 10pt;
}
.recipient-hw-note {
  font-size: 7pt;
  color: #888;
  font-style: italic;
  margin-top: 2pt;
}

/* ── Content section ──────────────────────────────────────────────────────── */
.content-section {
  text-align: center;
  flex: 1;
  margin-bottom: 6pt;
}
.page[data-orientation="landscape"] .content-section {
  margin-bottom: 4pt;
}
.completion-statement {
  font-size: 8.5pt;
  line-height: 1.5;
  color: #111;
  margin-bottom: 7pt;
  max-width: 88%;
  margin-left: auto;
  margin-right: auto;
}
.page[data-orientation="landscape"] .completion-statement {
  font-size: 8pt;
  line-height: 1.4;
  margin-bottom: 5pt;
}
.course-name-row {
  font-size: 8.5pt;
  font-weight: bold;
  color: #222;
  margin-bottom: 4pt;
}
.detail-row {
  font-size: 7.5pt;
  color: #555;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2pt;
  flex-wrap: wrap;
  margin-top: 3pt;
}
.detail-item { white-space: nowrap; }
.detail-sep  { color: #bbb; }

/* ── Handwritten fields (beyond recipient_name) ──────────────────────────── */
.hw-fields {
  font-size: 7pt;
  color: #555;
  border-top: 0.5pt dashed #ccc;
  padding-top: 3pt;
  margin-bottom: 5pt;
}
.hw-fields-label {
  font-size: 6pt;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2pt;
}
.hw-field-row {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 4pt;
  margin-bottom: 1pt;
}
.hw-fl { font-weight: bold; white-space: nowrap; }
.hw-fv { word-break: break-word; }
.hw-fv.illegible-val { font-style: italic; color: #999; }

/* ── Signatories ──────────────────────────────────────────────────────────── */
/* margin-top: auto pushes the section to the bottom of the flex column. */
.signatories-section {
  margin-top: auto;
  border-top: 0.75pt solid #555;
  padding-top: 6pt;
}
.page[data-orientation="landscape"] .signatories-section {
  padding-top: 4pt;
}
.signatories-grid {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-around;
  gap: 8pt 16pt;
}
.signatory {
  text-align: center;
  min-width: 1.0in;
  max-width: 2.2in;
}
.sig-line {
  border-top: 0.75pt solid #333;
  margin-bottom: 3pt;
  width: 100%;
}
.sig-name {
  font-size: 7.5pt;
  font-weight: bold;
  line-height: 1.3;
  word-break: break-word;
}
.sig-role {
  font-size: 6.5pt;
  color: #555;
  line-height: 1.3;
}
.sig-institution {
  font-size: 6pt;
  color: #888;
  font-style: italic;
  line-height: 1.3;
}

/* ── Documentary marks ────────────────────────────────────────────────────── */
.marks-section {
  margin-top: 4pt;
  border-top: 0.5pt solid #ddd;
  padding-top: 2pt;
}
.page[data-orientation="landscape"] .marks-section {
  margin-top: 3pt;
}
.marks-section-label {
  font-size: 6pt;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1.5pt;
}
.mark-item {
  font-size: 6.5pt;
  color: #666;
  margin-bottom: 0.8pt;
  line-height: 1.3;
  word-break: break-word;
}
.page[data-orientation="landscape"] .mark-item {
  font-size: 6pt;
}

@media print {
  .page-break { break-after: page; page-break-after: always; }
}
`;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Renders a validated CourseCertificateLandscape into a deterministic HTML string.
 *
 * Mode selection:
 *   pageCount 1 or undefined → single-page (all content on one page)
 *   pageCount >= 2           → page 1: header + recipient + content + hw-fields;
 *                              page 2: signatories + documentary marks
 *
 * Orientation:
 *   'landscape' → CSS @page landscape + data-orientation="landscape" on .page divs
 *   'portrait' | 'unknown' | undefined → CSS @page portrait (default)
 */
export function renderCertificateLandscapeHtml(
  data: CourseCertificateLandscape,
  options: CertificateLandscapeRenderOptions = {},
): string {
  const { pageCount, orientation } = options;
  const isLandscape  = orientation === 'landscape';
  const isMultiPage  = typeof pageCount === 'number' && pageCount >= 2;

  // data-orientation attribute triggers landscape CSS overrides.
  // Using an attribute (not a class) preserves the exact <div class="page">
  // string prefix that injectLetterheadIntoHtml matches.
  const pageAttr = isLandscape ? ' data-orientation="landscape"' : '';

  // Build sections — empty string for absent/empty fields.
  const header      = renderHeader(data);
  const recipient   = renderRecipient(data);
  const content     = renderContent(data);
  const hwFields    = (data.handwritten_fields?.length ?? 0) > 0
    ? renderHandwrittenFields(data.handwritten_fields)
    : '';
  const signatories = (data.signatories?.length ?? 0) > 0
    ? renderSignatories(data.signatories)
    : '';
  const marks = renderVisualMarks(data.visual_elements);

  // @page CSS hint: respected when HTML is opened in a browser.
  // Gotenberg ignores this (preferCssPageSize=false) and uses its own
  // paperWidth/paperHeight settings — see structuredPreview.ts.
  const pageCss = isLandscape
    ? '@page { size: letter landscape; }'
    : '@page { size: letter portrait; }';

  let bodyContent: string;

  if (!isMultiPage) {
    // Single-page: all sections together; signatories pushed to bottom via
    // margin-top: auto on .signatories-section (flex column layout).
    bodyContent = (
      `<div class="page"${pageAttr}>` +
      header + recipient + content + hwFields + signatories + marks +
      `</div>`
    );
  } else {
    // Multi-page: split at signatories to preserve 1:1 page-count behavior.
    bodyContent = (
      `<div class="page"${pageAttr}>` +
      header + recipient + content + hwFields +
      `</div>` +
      `<div class="page-break"></div>` +
      `<div class="page"${pageAttr}>` +
      signatories + marks +
      `</div>`
    );
  }

  return (
    `<!DOCTYPE html>\n` +
    `<html lang="en">\n` +
    `<head>\n` +
    `  <meta charset="UTF-8" />\n` +
    `  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n` +
    `  <title>${escapeHtml(data.certificate_title || 'Certificate')}</title>\n` +
    `  <style>${pageCss}${RENDERER_CSS}</style>\n` +
    `</head>\n` +
    `<body>\n` +
    `  ${bodyContent}\n` +
    `</body>\n` +
    `</html>`
  );
}
