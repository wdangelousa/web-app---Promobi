/**
 * lib/publicationMediaRecordRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic premium renderer for publication/media evidence.
 *
 * Layout goals:
 *   - editorial hierarchy instead of legal-letter look
 *   - subtype-aware framing (cover/article/clipping/metadata)
 *   - long-form readability with balanced paragraph rhythm
 *   - clear secondary blocks for captions/references/footnotes
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  PublicationBodySection,
  PublicationImageRegion,
  PublicationMediaRecord,
  PublicationMetadataItem,
  VisualElement,
} from '@/types/publicationMediaRecord';

export interface PublicationMediaRecordRenderOptions {
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

function isCoverSubtype(data: PublicationMediaRecord): boolean {
  return data.document_subtype === 'book_cover' || data.document_subtype === 'article_cover';
}

function prefersColumns(
  data: PublicationMediaRecord,
  orientation: 'portrait' | 'landscape',
): boolean {
  if (orientation === 'landscape') return true;
  return (
    data.document_subtype === 'full_article' ||
    data.document_subtype === 'magazine_page' ||
    data.document_subtype === 'newspaper_clipping'
  );
}

function renderMasthead(data: PublicationMediaRecord): string {
  const publicationTitle = nonEmpty(data.publication_title);
  const articleTitle = nonEmpty(data.article_title);
  const subtitle = nonEmpty(data.subtitle);
  const headerText = nonEmpty(data.header_text);

  const title = articleTitle ?? publicationTitle ?? 'PUBLICATION / MEDIA EVIDENCE';
  const eyebrow = publicationTitle && articleTitle ? publicationTitle : headerText;

  return `
<header class="masthead ${isCoverSubtype(data) ? 'cover-masthead' : ''}">
  ${eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
  <h1 class="title">${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
  <div class="rule"></div>
</header>`;
}

function renderMetaChips(data: PublicationMediaRecord): string {
  const chips: string[] = [];
  if (nonEmpty(data.source_publication)) {
    chips.push(`<span><strong>Source:</strong> ${escapeHtml(data.source_publication)}</span>`);
  }
  if (nonEmpty(data.author_byline)) {
    chips.push(`<span><strong>Byline:</strong> ${escapeHtml(data.author_byline)}</span>`);
  } else if ((data.author_names ?? []).length > 0) {
    chips.push(`<span><strong>Authors:</strong> ${escapeHtml(data.author_names.join('; '))}</span>`);
  }
  if (nonEmpty(data.publication_date)) {
    chips.push(`<span><strong>Date:</strong> ${escapeHtml(data.publication_date)}</span>`);
  }
  if (nonEmpty(data.issue_or_edition)) {
    chips.push(`<span><strong>Edition:</strong> ${escapeHtml(data.issue_or_edition)}</span>`);
  }
  if (nonEmpty(data.volume) || nonEmpty(data.issue_number)) {
    chips.push(
      `<span><strong>Vol/Issue:</strong> ${escapeHtml(
        `${data.volume || '-'} / ${data.issue_number || '-'}`,
      )}</span>`,
    );
  }
  if (nonEmpty(data.source_location)) {
    chips.push(`<span><strong>Location:</strong> ${escapeHtml(data.source_location)}</span>`);
  }

  if (chips.length === 0) return '';
  return `<section class="meta-chips">${chips.map((c) => `<div class="chip">${c}</div>`).join('')}</section>`;
}

function renderMetadataPanel(items: PublicationMetadataItem[], data: PublicationMediaRecord): string {
  const rows: Array<[string, string]> = [];

  if (nonEmpty(data.footer_text)) rows.push(['Footer', data.footer_text!]);
  for (const item of items ?? []) {
    if (!nonEmpty(item.label) || !nonEmpty(item.value)) continue;
    rows.push([item.label, item.value]);
  }

  if (rows.length === 0) return '';

  const htmlRows = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  return `
<section class="meta-panel">
  <h2 class="section-title">PUBLICATION METADATA</h2>
  <table class="meta-table"><tbody>${htmlRows}</tbody></table>
</section>`;
}

function renderAbstract(data: PublicationMediaRecord): string {
  const abstract = nonEmpty(data.abstract_or_opening_summary);
  const quote = nonEmpty(data.opening_quote);
  if (!abstract && !quote) return '';
  return `
<section class="abstract-block">
  <h2 class="section-title">ABSTRACT / OPENING SUMMARY</h2>
  ${abstract ? `<p>${escapeHtml(abstract)}</p>` : ''}
  ${quote ? `<blockquote>${escapeHtml(quote)}</blockquote>` : ''}
</section>`;
}

function renderImageRegions(imageRegions: PublicationImageRegion[]): string {
  const items = (imageRegions ?? []).filter(
    (it) => nonEmpty(it.label) || nonEmpty(it.description) || nonEmpty(it.caption),
  );
  if (items.length === 0) return '';

  const cards = items
    .map((it) => {
      const label = nonEmpty(it.label);
      const description = nonEmpty(it.description) ?? 'Image region';
      const caption = nonEmpty(it.caption);
      const page = nonEmpty(it.page);
      return `<article class="image-region">
  <div class="image-placeholder">Image Placeholder</div>
  <div class="image-meta">
    ${label ? `<div class="image-label">${escapeHtml(label)}</div>` : ''}
    <div class="image-description">${escapeHtml(description)}</div>
    ${caption ? `<div class="image-caption">${escapeHtml(caption)}</div>` : ''}
    ${page ? `<div class="image-page">Page ${escapeHtml(page)}</div>` : ''}
  </div>
</article>`;
    })
    .join('');

  return `
<section class="image-region-block">
  <h2 class="section-title">IMAGE / FIGURE REGIONS</h2>
  <div class="image-region-grid">${cards}</div>
</section>`;
}

function renderBody(data: PublicationMediaRecord, useColumns: boolean): string {
  const sections = (data.body_sections ?? []).filter(
    (section: PublicationBodySection) =>
      nonEmpty(section.heading) || (section.paragraphs ?? []).some((p) => nonEmpty(p)),
  );
  const plainParagraphs = (data.body_paragraphs ?? []).map((p) => p.trim()).filter(Boolean);

  if (sections.length === 0 && plainParagraphs.length === 0) return '';

  const sectionHtml = sections
    .map((section) => {
      const heading = nonEmpty(section.heading);
      const paragraphs = (section.paragraphs ?? [])
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join('');

      return `<article class="body-section">
  ${heading ? `<h3>${escapeHtml(heading)}</h3>` : ''}
  ${paragraphs}
</article>`;
    })
    .join('');

  const paragraphHtml = plainParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');

  return `
<section class="body-block">
  <h2 class="section-title">ARTICLE BODY</h2>
  <div class="article-flow ${useColumns ? 'columns' : 'single-column'}">
    ${sectionHtml}
    ${paragraphHtml}
  </div>
</section>`;
}

function renderListBlock(title: string, items: string[], className: string): string {
  const lines = (items ?? []).map((v) => v.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  const htmlItems = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  return `
<section class="${className}">
  <h2 class="section-title">${escapeHtml(title)}</h2>
  <ul>${htmlItems}</ul>
</section>`;
}

function renderParticipants(data: PublicationMediaRecord): string {
  return renderListBlock(
    'INTERVIEW PARTICIPANTS',
    data.interview_participants ?? [],
    'participants-block',
  );
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

function buildCss(
  orientation: 'portrait' | 'landscape',
  isCover: boolean,
  useColumns: boolean,
): string {
  const pageRule =
    orientation === 'landscape'
      ? '@page { size: letter landscape; margin: 0.46in; }'
      : '@page { size: letter portrait; margin: 0.56in; }';

  return `
${pageRule}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Georgia, "Times New Roman", serif;
  color: #111827;
  font-size: 10.9pt;
  line-height: 1.45;
}
.document {
  width: ${orientation === 'landscape' ? '100%' : 'min(100%, 6.9in)'};
  margin: 0 auto;
}

.masthead { margin-bottom: 10px; }
.cover-masthead { margin-top: 0.18in; margin-bottom: 0.2in; }
.eyebrow {
  font-size: 9.5pt;
  text-transform: uppercase;
  letter-spacing: 0.85px;
  color: #4b5563;
}
.title {
  margin: 5px 0 0;
  font-size: ${isCover ? '23pt' : '18pt'};
  line-height: ${isCover ? '1.12' : '1.18'};
  letter-spacing: 0.22px;
  font-weight: 700;
}
.subtitle {
  margin: 7px 0 0;
  font-size: ${isCover ? '12.4pt' : '11.2pt'};
  color: #374151;
}
.rule { border-top: 1px solid #111827; margin-top: 10px; }

.meta-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 12px;
}
.chip {
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 9.1pt;
  background: #f8fafc;
}

.section-title {
  margin: 0 0 6px;
  font-size: 9.1pt;
  letter-spacing: 0.76px;
  text-transform: uppercase;
  font-weight: 700;
  color: #1f2937;
}

.meta-panel, .abstract-block, .body-block, .image-region-block,
.captions-block, .references-block, .footnotes-block, .participants-block,
.attachments-block, .marks-block {
  margin-top: 12px;
  page-break-inside: avoid;
}

.meta-table, .marks-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.2pt;
}
.meta-table th, .meta-table td, .marks-table th, .marks-table td {
  border: 0.8px solid #d1d5db;
  padding: 6px 7px;
  vertical-align: top;
}
.meta-table th, .marks-table th {
  text-align: left;
  font-weight: 700;
  background: #f9fafb;
}
.meta-table th { width: 30%; }
.marks-table td:nth-child(1) { width: 24%; }
.marks-table td:nth-child(3) { width: 10%; text-align: center; }

.abstract-block p { margin: 0; text-align: justify; }
.abstract-block blockquote {
  margin: 8px 0 0;
  padding: 8px 12px;
  border-left: 3px solid #9ca3af;
  background: #f9fafb;
  color: #1f2937;
}

.article-flow.columns {
  column-count: ${useColumns ? '2' : '1'};
  column-gap: 0.26in;
}
.article-flow p {
  margin: 0 0 10px;
  text-align: justify;
}
.article-flow h3 {
  margin: 0 0 5px;
  font-size: 10.4pt;
  break-after: avoid;
}
.body-section {
  break-inside: avoid;
  margin-bottom: 6px;
}

.image-region-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.image-region {
  border: 0.9px solid #d1d5db;
  border-radius: 8px;
  overflow: hidden;
  background: #fbfcfd;
}
.image-placeholder {
  min-height: 78px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9pt;
  color: #6b7280;
  border-bottom: 0.9px dashed #d1d5db;
  background: linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%);
}
.image-meta { padding: 7px 8px; font-size: 9pt; }
.image-label { font-weight: 700; }
.image-description { margin-top: 3px; }
.image-caption { margin-top: 4px; color: #374151; }
.image-page { margin-top: 4px; font-size: 8.6pt; color: #6b7280; }

ul { margin: 0; padding-left: 18px; }
li { margin: 0 0 5px; }
`;
}

export function renderPublicationMediaRecordHtml(
  data: PublicationMediaRecord,
  options: PublicationMediaRecordRenderOptions = {},
): string {
  const orientation =
    options.orientation === 'landscape' ? 'landscape' : 'portrait';
  const coverSubtype = isCoverSubtype(data);
  const useColumns = prefersColumns(data, orientation);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>${buildCss(orientation, coverSubtype, useColumns)}</style>
</head>
<body>
  <main class="document">
    ${renderMasthead(data)}
    ${renderMetaChips(data)}
    ${renderMetadataPanel(data.metadata_lines, data)}
    ${renderAbstract(data)}
    ${renderImageRegions(data.image_regions)}
    ${renderBody(data, useColumns)}
    ${renderParticipants(data)}
    ${renderListBlock('CAPTIONS', data.captions ?? [], 'captions-block')}
    ${renderListBlock('CITATIONS / REFERENCES', data.citations_or_references ?? [], 'references-block')}
    ${renderListBlock('FOOTNOTES', data.footnotes ?? [], 'footnotes-block')}
    ${renderListBlock('ATTACHMENTS / REFERENCES', data.attachments_or_references ?? [], 'attachments-block')}
    ${renderVisualElements(data.visual_elements)}
  </main>
</body>
</html>`;

  return html;
}
