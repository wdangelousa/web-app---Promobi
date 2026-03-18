/**
 * lib/recommendationLetterRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic premium renderer for recommendation/expert/support letters.
 *
 * Design goals:
 *   - business-letter elegance
 *   - narrative readability for long paragraphs
 *   - highlighted recommender credentials
 *   - clear signature and closing rhythm
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  RecommendationLetter,
  RecommenderCredentialItem,
  RecommendationSignatory,
  VisualElement,
} from '@/types/recommendationLetter';

export interface RecommendationLetterRenderOptions {
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

function renderLetterhead(data: RecommendationLetter): string {
  const title = nonEmpty(data.document_title);
  const letterhead = nonEmpty(data.issuing_letterhead);
  return `
<header class="doc-header">
  ${letterhead ? `<div class="letterhead">${escapeHtml(letterhead)}</div>` : ''}
  ${title ? `<div class="doc-title">${escapeHtml(title)}</div>` : ''}
  <div class="header-rule"></div>
</header>`;
}

function renderDateAndAddress(data: RecommendationLetter): string {
  const date = nonEmpty(data.issue_date);
  const location = nonEmpty(data.issue_location);
  const addressee = nonEmpty(data.addressee);
  const salutation = nonEmpty(data.salutation);

  if (!date && !location && !addressee && !salutation) return '';

  return `
<section class="date-address">
  <div class="date-line">${location ? `${escapeHtml(location)}${date ? ', ' : ''}` : ''}${date ? escapeHtml(date) : ''}</div>
  ${addressee ? `<div class="addressee">${escapeHtml(addressee)}</div>` : ''}
  ${salutation ? `<div class="salutation">${escapeHtml(salutation)}</div>` : ''}
</section>`;
}

function renderRecommenderCredentials(data: RecommendationLetter): string {
  const recommenderName = nonEmpty(data.recommender_name);
  const recommenderTitle = nonEmpty(data.recommender_title);
  const recommenderInstitution = nonEmpty(data.recommender_institution);

  const rows: Array<[string, string]> = [];
  if (recommenderName) rows.push(['Recommender', recommenderName]);
  if (recommenderTitle) rows.push(['Title', recommenderTitle]);
  if (recommenderInstitution) rows.push(['Institution', recommenderInstitution]);

  (data.recommender_credentials ?? []).forEach((item: RecommenderCredentialItem) => {
    if (!nonEmpty(item.label) || !nonEmpty(item.value)) return;
    rows.push([item.label, item.value]);
  });

  if (rows.length === 0) return '';

  const htmlRows = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  return `
<section class="credentials-block">
  <h2 class="section-title">RECOMMENDER CREDENTIALS</h2>
  <table class="kv-table">
    <tbody>${htmlRows}</tbody>
  </table>
</section>`;
}

function renderBeneficiaryStrip(data: RecommendationLetter): string {
  const items: string[] = [];
  if (nonEmpty(data.beneficiary_name)) {
    items.push(`<span class="pill"><strong>Beneficiary:</strong> ${escapeHtml(data.beneficiary_name)}</span>`);
  }
  if (nonEmpty(data.beneficiary_identifier)) {
    items.push(`<span class="pill"><strong>ID:</strong> ${escapeHtml(data.beneficiary_identifier)}</span>`);
  }
  if (nonEmpty(data.beneficiary_role_or_field)) {
    items.push(`<span class="pill"><strong>Field:</strong> ${escapeHtml(data.beneficiary_role_or_field)}</span>`);
  }
  if (items.length === 0) return '';

  return `<section class="beneficiary-strip">${items.join('')}</section>`;
}

function renderEvaluationStatements(lines: string[]): string {
  const statements = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  if (statements.length === 0) return '';

  const htmlItems = statements
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');

  return `
<section class="evaluation-block">
  <h2 class="section-title">KEY EVALUATION STATEMENTS</h2>
  <ul>${htmlItems}</ul>
</section>`;
}

function renderBodyParagraphs(lines: string[]): string {
  const paragraphs = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  if (paragraphs.length === 0) return '';

  const htmlParagraphs = paragraphs
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

  return `
<section class="body-block">
  <h2 class="section-title">LETTER BODY</h2>
  <div class="body-paragraphs">${htmlParagraphs}</div>
</section>`;
}

function renderClosingAndBio(data: RecommendationLetter): string {
  const closing = nonEmpty(data.closing_paragraph);
  const bioMention = nonEmpty(data.attached_bio_or_resume_mention);
  if (!closing && !bioMention) return '';

  return `
<section class="closing-block">
  ${closing ? `<p class="closing-text">${escapeHtml(closing)}</p>` : ''}
  ${bioMention ? `<div class="bio-note"><strong>Attachment Note:</strong> ${escapeHtml(bioMention)}</div>` : ''}
</section>`;
}

function renderSignaturesAndFooter(data: RecommendationLetter): string {
  const signatories = (data.signatories ?? [])
    .filter((entry: RecommendationSignatory) => nonEmpty(entry.name) || nonEmpty(entry.title))
    .map((entry) => {
      return `<div class="signature-card">
  <div class="sig-line"></div>
  ${nonEmpty(entry.name) ? `<div class="sig-name">${escapeHtml(entry.name)}</div>` : ''}
  ${nonEmpty(entry.title) ? `<div class="sig-title">${escapeHtml(entry.title)}</div>` : ''}
  ${nonEmpty(entry.institution_or_company) ? `<div class="sig-org">${escapeHtml(entry.institution_or_company)}</div>` : ''}
  ${nonEmpty(entry.contact_line) ? `<div class="sig-contact">${escapeHtml(entry.contact_line)}</div>` : ''}
</div>`;
    })
    .join('');

  const footer = nonEmpty(data.footer_or_contact_block);
  const refs = (data.attachments_or_references ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');

  if (!signatories && !footer && !refs) return '';

  return `
<section class="signature-footer-block">
  ${signatories ? `<div class="signature-grid">${signatories}</div>` : ''}
  ${footer ? `<div class="footer-line">${escapeHtml(footer)}</div>` : ''}
  ${refs ? `<div class="refs"><strong>Attachments / References:</strong><ul>${refs}</ul></div>` : ''}
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
<section class="marks-block">
  <h2 class="section-title">DOCUMENTARY MARKS</h2>
  <table class="marks-table">
    <thead><tr><th>Type</th><th>Description</th><th>Page</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function buildCss(orientation: 'portrait' | 'landscape'): string {
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
  font-family: Georgia, "Times New Roman", serif;
  color: #111827;
  font-size: 11pt;
  line-height: 1.48;
}
.document {
  width: min(100%, 6.72in);
  margin: 0 auto;
}
.doc-header { margin-bottom: 12px; }
.letterhead {
  font-size: 11.4pt;
  font-weight: 700;
  letter-spacing: 0.22px;
}
.doc-title {
  margin-top: 4px;
  font-size: 12.2pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.55px;
}
.header-rule { border-top: 1px solid #111827; margin-top: 10px; }

.date-address { margin: 8px 0 16px; }
.date-line { text-align: right; font-size: 10pt; color: #374151; margin-bottom: 8px; }
.addressee { margin-bottom: 2px; font-weight: 600; }
.salutation { margin-top: 3px; }

.section-title {
  margin: 0 0 6px;
  font-size: 9.4pt;
  letter-spacing: 0.72px;
  text-transform: uppercase;
  font-weight: 700;
  color: #1f2937;
}

.credentials-block, .evaluation-block, .body-block, .closing-block, .signature-footer-block, .marks-block {
  margin-top: 12px;
  page-break-inside: avoid;
}

.kv-table, .marks-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.3pt;
}
.kv-table th, .kv-table td, .marks-table th, .marks-table td {
  border: 0.8px solid #d1d5db;
  padding: 6px 7px;
  vertical-align: top;
}
.kv-table th, .marks-table th {
  background: #f9fafb;
  text-align: left;
  font-weight: 700;
}
.kv-table th { width: 31%; }
.marks-table td:nth-child(1) { width: 23%; }
.marks-table td:nth-child(3) { width: 11%; text-align: center; }

.beneficiary-strip {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 9.3pt;
  background: #fbfcfd;
}

.evaluation-block ul { margin: 0; padding-left: 18px; }
.evaluation-block li { margin: 0 0 6px; }

.body-paragraphs p {
  margin: 0 0 11px;
  text-align: justify;
  text-indent: 0.22in;
}
.body-paragraphs p:first-child { text-indent: 0; }

.closing-text {
  margin: 0;
  text-align: justify;
}
.bio-note {
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  background: #fafafa;
  font-size: 9.6pt;
}

.signature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.signature-card { padding-top: 24px; }
.sig-line { border-top: 1px solid #111827; margin-bottom: 6px; }
.sig-name { font-weight: 700; }
.sig-title, .sig-org, .sig-contact { margin-top: 2px; font-size: 9.2pt; color: #374151; }

.footer-line {
  margin-top: 10px;
  border-top: 0.8px solid #e5e7eb;
  padding-top: 7px;
  font-size: 9.1pt;
  color: #4b5563;
}
.refs { margin-top: 8px; font-size: 9.2pt; }
.refs ul { margin: 3px 0 0 18px; padding: 0; }
`;
}

export function renderRecommendationLetterHtml(
  data: RecommendationLetter,
  options: RecommendationLetterRenderOptions = {},
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
<body>
  <main class="document">
    ${renderLetterhead(data)}
    ${renderDateAndAddress(data)}
    ${renderRecommenderCredentials(data)}
    ${renderBeneficiaryStrip(data)}
    ${renderEvaluationStatements(data.evaluation_statements)}
    ${renderBodyParagraphs(data.body_paragraphs)}
    ${renderClosingAndBio(data)}
    ${renderSignaturesAndFooter(data)}
    ${renderVisualElements(data.visual_elements)}
  </main>
</body>
</html>`;

  return html;
}
