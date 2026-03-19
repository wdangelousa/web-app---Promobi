/**
 * lib/lettersAndStatementsRenderer.ts
 * -----------------------------------------------------------------------------
 * Generic structured renderer for letters and declarations.
 * -----------------------------------------------------------------------------
 */

import type {
  LettersAndStatements,
  LettersStatementsLayoutZone,
  LettersStatementsOrientation,
  LettersStatementsStructuredPage,
} from '@/types/lettersAndStatements';

export interface LettersAndStatementsRenderOptions {
  pageCount?: number;
  orientation?: LettersStatementsOrientation;
}

function escapeHtml(value: string | undefined | null): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeWhitespace(value: string | undefined | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function nonEmpty(value: string | undefined | null): string | null {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeZoneBindingId(value: string | undefined | null): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isGenericZoneBindingId(value: string): boolean {
  return /^z?_?\d{1,3}$/.test(value);
}

function isLikelyNonTextZone(zone: LettersStatementsLayoutZone): boolean {
  const signal = normalizeZoneBindingId(
    `${zone.zone_id} ${zone.zone_type} ${zone.visual_style}`,
  );
  return (
    signal.includes('logo') ||
    signal.includes('seal') ||
    signal.includes('stamp') ||
    signal.includes('watermark') ||
    signal.includes('barcode') ||
    signal.includes('qr') ||
    signal.includes('photo') ||
    signal.includes('image')
  );
}

function buildResolvedContentByZoneId(
  page: LettersStatementsStructuredPage,
): Map<string, string> {
  const map = new Map<string, string>();

  const layoutZones = (page.LAYOUT_ZONES ?? [])
    .map((zone, index) => {
      const zoneId = normalizeWhitespace(zone.zone_id);
      const normalizedId = normalizeZoneBindingId(zone.zone_id);
      if (!zoneId || !normalizedId) return null;
      return { index, zoneId, normalizedId };
    })
    .filter((zone): zone is { index: number; zoneId: string; normalizedId: string } => zone !== null);

  const translatedEntries = (page.TRANSLATED_CONTENT_BY_ZONE ?? [])
    .map((entry, index) => {
      const zoneId = normalizeWhitespace(entry.zone_id);
      const normalizedId = normalizeZoneBindingId(entry.zone_id);
      const content = normalizeWhitespace(entry.content);
      if (!zoneId || !normalizedId || !content) return null;
      return { index, zoneId, normalizedId, content };
    })
    .filter((entry): entry is {
      index: number;
      zoneId: string;
      normalizedId: string;
      content: string;
    } => entry !== null);

  const append = (zoneId: string, content: string): void => {
    const current = map.get(zoneId) ?? '';
    map.set(zoneId, current ? `${current}\n${content}` : content);
  };

  const layoutByNormalizedId = new Map<string, number[]>();
  for (const zone of layoutZones) {
    const existing = layoutByNormalizedId.get(zone.normalizedId) ?? [];
    existing.push(zone.index);
    layoutByNormalizedId.set(zone.normalizedId, existing);
  }

  const consumedTranslated = new Set<number>();
  const consumedLayout = new Set<number>();

  for (const entry of translatedEntries) {
    const candidates = layoutByNormalizedId.get(entry.normalizedId) ?? [];
    const matchedLayout = candidates.find((candidate) => !consumedLayout.has(candidate));
    if (matchedLayout === undefined) continue;
    const layoutZone = layoutZones.find((zone) => zone.index === matchedLayout);
    if (!layoutZone) continue;
    consumedTranslated.add(entry.index);
    consumedLayout.add(layoutZone.index);
    append(layoutZone.zoneId, entry.content);
  }

  const unmatchedLayout = layoutZones.filter((zone) => !consumedLayout.has(zone.index));
  const unmatchedGenericTranslated = translatedEntries.filter(
    (entry) =>
      !consumedTranslated.has(entry.index) &&
      isGenericZoneBindingId(entry.normalizedId),
  );

  const fallbackMappings = Math.min(unmatchedLayout.length, unmatchedGenericTranslated.length);
  for (let i = 0; i < fallbackMappings; i += 1) {
    const layoutZone = unmatchedLayout[i];
    const translatedEntry = unmatchedGenericTranslated[i];
    consumedTranslated.add(translatedEntry.index);
    consumedLayout.add(layoutZone.index);
    append(layoutZone.zoneId, translatedEntry.content);
  }

  for (const entry of translatedEntries) {
    if (consumedTranslated.has(entry.index)) continue;
    append(entry.zoneId, entry.content);
  }

  return map;
}

function findContentByPreferredIds(
  contentByZoneId: Map<string, string>,
  preferredIds: string[],
): string {
  for (const id of preferredIds) {
    const content = contentByZoneId.get(id);
    if (content) return content;
  }
  return '';
}

function collectRemainingTextZones(
  page: LettersStatementsStructuredPage,
  contentByZoneId: Map<string, string>,
  consumedZoneIds: Set<string>,
): string[] {
  const entries: string[] = [];
  for (const zone of page.LAYOUT_ZONES ?? []) {
    const zoneId = normalizeWhitespace(zone.zone_id);
    if (!zoneId || consumedZoneIds.has(zoneId)) continue;
    if (isLikelyNonTextZone(zone)) continue;

    const content = nonEmpty(contentByZoneId.get(zoneId));
    if (!content) continue;
    entries.push(content);
    consumedZoneIds.add(zoneId);
  }
  return entries;
}

function parseLineHeight(value: string | undefined, compactOnePage: boolean): number {
  const parsed = Number.parseFloat((value ?? '').replace(/[^0-9.]/g, ''));
  const fallback = compactOnePage ? 1.18 : 1.3;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(compactOnePage ? 1.24 : 1.45, Math.max(1.08, parsed));
}

function parseFontSize(value: string | undefined, fallbackPt: number): string {
  const raw = normalizeWhitespace(value);
  if (!raw) return `${fallbackPt}pt`;
  if (/^[0-9]+(?:\.[0-9]+)?pt$/i.test(raw)) return raw.toLowerCase();
  const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric)) return `${fallbackPt}pt`;
  return `${Math.min(13, Math.max(8, numeric)).toFixed(1)}pt`;
}

function compactFontSize(value: string, minPt: number, deltaPt: number): string {
  const numeric = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  const safe = Number.isFinite(numeric) ? numeric : minPt;
  return `${Math.max(minPt, safe - deltaPt).toFixed(1)}pt`;
}

function renderListBlock(title: string, lines: string[], className: string): string {
  const rows = lines.map((line) => nonEmpty(line)).filter((line): line is string => Boolean(line));
  if (rows.length === 0) return '';
  return `<section class="${className}">
  <h2 class="section-label">${escapeHtml(title)}</h2>
  <ul>${rows.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
</section>`;
}

function renderPage(
  page: LettersStatementsStructuredPage,
  index: number,
  options: { compactOnePage: boolean },
): string {
  const contentByZoneId = buildResolvedContentByZoneId(page);
  const consumed = new Set<string>();

  const letterhead = findContentByPreferredIds(contentByZoneId, ['z_letterhead_logo']);
  if (letterhead) consumed.add('z_letterhead_logo');
  const institutionHeader = findContentByPreferredIds(contentByZoneId, ['z_institution_header']);
  if (institutionHeader) consumed.add('z_institution_header');
  const documentTitle = findContentByPreferredIds(contentByZoneId, ['z_document_title']);
  if (documentTitle) consumed.add('z_document_title');
  const subtitle = findContentByPreferredIds(contentByZoneId, ['z_subtitle']);
  if (subtitle) consumed.add('z_subtitle');
  const recipientSalutation = findContentByPreferredIds(contentByZoneId, ['z_recipient_or_salutation']);
  if (recipientSalutation) consumed.add('z_recipient_or_salutation');
  const bodyText = findContentByPreferredIds(contentByZoneId, ['z_body_text']);
  if (bodyText) consumed.add('z_body_text');
  const dateLocation = findContentByPreferredIds(contentByZoneId, ['z_date_location']);
  if (dateLocation) consumed.add('z_date_location');
  const closing = findContentByPreferredIds(contentByZoneId, ['z_closing']);
  if (closing) consumed.add('z_closing');
  const signatureBlock = findContentByPreferredIds(contentByZoneId, ['z_signature_block']);
  if (signatureBlock) consumed.add('z_signature_block');
  const signerIdentity = findContentByPreferredIds(contentByZoneId, ['z_signer_identity']);
  if (signerIdentity) consumed.add('z_signer_identity');
  const footerContact = findContentByPreferredIds(contentByZoneId, ['z_footer_contact']);
  if (footerContact) consumed.add('z_footer_contact');
  const attachedResume = findContentByPreferredIds(contentByZoneId, ['z_attached_resume_section']);
  if (attachedResume) consumed.add('z_attached_resume_section');

  const additionalText = collectRemainingTextZones(page, contentByZoneId, consumed);

  const hints = page.RENDERING_HINTS;
  const metadata = page.PAGE_METADATA;
  const fonts = metadata.suggested_font_size_by_section ?? {};
  const lineHeight = parseLineHeight(
    hints?.recommended_line_height,
    options.compactOnePage,
  );
  const baseTitleSize = parseFontSize(fonts.z_document_title, 12);
  const baseBodySize = parseFontSize(fonts.z_body_text, 10.6);
  const baseSignatureSize = parseFontSize(fonts.z_signature_block, 9.8);
  const titleSize = options.compactOnePage
    ? compactFontSize(baseTitleSize, 10.8, 0.6)
    : baseTitleSize;
  const bodySize = options.compactOnePage
    ? compactFontSize(baseBodySize, 9.2, 0.4)
    : baseBodySize;
  const signatureSize = options.compactOnePage
    ? compactFontSize(baseSignatureSize, 8.9, 0.3)
    : baseSignatureSize;

  const styleVars = [
    `--letter-line-height:${lineHeight}`,
    `--letter-title-size:${titleSize}`,
    `--letter-body-size:${bodySize}`,
    `--letter-signature-size:${signatureSize}`,
    `--letter-page-min-height:${options.compactOnePage ? '7.84in' : '8.06in'}`,
  ].join(';');

  const bodyLines = [
    nonEmpty(bodyText) ?? '',
    ...additionalText,
  ].filter(Boolean);
  const bodyHtml = bodyLines.length > 0
    ? bodyLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
    : '<p>[illegible]</p>';

  const signatureLines = [
    nonEmpty(signatureBlock),
    nonEmpty(signerIdentity),
  ].filter((line): line is string => Boolean(line));

  return `<section class="letter-page${options.compactOnePage ? ' compact' : ''}" data-page-number="${metadata.page_number ?? index + 1}" style="${styleVars}">
  <header class="letter-header">
    ${letterhead ? `<div class="letterhead-line">${escapeHtml(letterhead)}</div>` : ''}
    ${institutionHeader ? `<div class="institution-header">${escapeHtml(institutionHeader)}</div>` : ''}
    <h1 class="document-title">${escapeHtml(nonEmpty(documentTitle) ?? 'LETTER / DECLARATION')}</h1>
    ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
  </header>

  ${(dateLocation || recipientSalutation) ? `<section class="letter-prelude">
    ${dateLocation ? `<p class="date-location">${escapeHtml(dateLocation)}</p>` : ''}
    ${recipientSalutation ? `<p class="recipient">${escapeHtml(recipientSalutation)}</p>` : ''}
  </section>` : ''}

  <section class="letter-body">
    <h2 class="section-label">BODY TEXT</h2>
    <div class="body-flow">${bodyHtml}</div>
  </section>

  ${closing ? `<section class="closing-block">
    <h2 class="section-label">CLOSING</h2>
    <p>${escapeHtml(closing)}</p>
  </section>` : ''}

  ${renderListBlock('SIGNATURE BLOCK', signatureLines, 'signature-block')}
  ${footerContact ? `<section class="footer-contact">
    <h2 class="section-label">FOOTER / CONTACT</h2>
    <p>${escapeHtml(footerContact)}</p>
  </section>` : ''}
  ${attachedResume ? `<section class="attached-resume">
    <h2 class="section-label">ATTACHED RESUME / CV SECTION</h2>
    <p>${escapeHtml(attachedResume)}</p>
  </section>` : ''}
  ${renderListBlock('NON-TEXTUAL ELEMENTS PRESERVED', page.NON_TEXTUAL_ELEMENTS ?? [], 'non-text-block')}
</section>`;
}

function buildCss(orientation: 'portrait' | 'landscape'): string {
  const pageRule =
    orientation === 'landscape'
      ? '@page { size: letter landscape; margin: 0.22in 0.28in; }'
      : '@page { size: letter portrait; margin: 0.28in 0.34in; }';

  return `${pageRule}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Georgia, "Times New Roman", serif;
  color: #111827;
  background: #fff;
}
.document {
  width: 100%;
}
.letter-page {
  width: 100%;
  min-height: var(--letter-page-min-height, 8.06in);
  border: 0.7px solid #dce4f0;
  border-radius: 4px;
  padding: 0.16in 0.18in;
  display: flex;
  flex-direction: column;
  gap: 0.1in;
  line-height: var(--letter-line-height);
}
.letter-header { display: block; }
.letterhead-line {
  font-size: 9pt;
  text-transform: uppercase;
  letter-spacing: 0.25px;
  color: #4b5563;
}
.institution-header {
  margin-top: 0.02in;
  font-size: 9.6pt;
  font-weight: 600;
}
.document-title {
  margin: 0.04in 0 0.03in;
  font-size: var(--letter-title-size);
  line-height: 1.15;
  font-weight: 700;
}
.subtitle {
  margin: 0;
  font-size: 10.2pt;
  color: #374151;
}
.date-location {
  margin: 0 0 0.02in;
  text-align: right;
  font-size: 9pt;
  color: #374151;
}
.recipient {
  margin: 0;
  font-size: 9.6pt;
  font-weight: 600;
}
.section-label {
  margin: 0 0 0.03in;
  font-size: 8.2pt;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #374151;
}
.body-flow p,
.closing-block p,
.footer-contact p,
.attached-resume p {
  margin: 0 0 0.04in;
  font-size: var(--letter-body-size);
  text-align: justify;
  white-space: pre-wrap;
}
.signature-block,
.footer-contact,
.attached-resume,
.non-text-block {
  border: 0.8px solid #dce4ef;
  border-radius: 4px;
  padding: 0.05in 0.07in;
  background: #fafcff;
}
ul {
  margin: 0;
  padding-left: 0.16in;
}
li {
  margin: 0 0 0.02in;
  font-size: var(--letter-signature-size);
  line-height: 1.14;
}
.letter-page.compact {
  padding: 0.13in 0.14in;
  gap: 0.075in;
}
.letter-page.compact .document-title {
  margin-top: 0.03in;
  margin-bottom: 0.02in;
}
.letter-page.compact .body-flow p {
  margin-bottom: 0.03in;
}
.page-break {
  break-before: page;
  page-break-before: always;
}
`;
}

function inferOrientation(payload: LettersAndStatements): 'portrait' | 'landscape' {
  if (payload.orientation === 'landscape') return 'landscape';
  const firstPageHint = payload.PAGES?.[0]?.PAGE_METADATA?.suggested_orientation;
  return firstPageHint === 'landscape' ? 'landscape' : 'portrait';
}

export function renderLettersAndStatementsHtml(
  payload: LettersAndStatements,
  options: LettersAndStatementsRenderOptions = {},
): string {
  const orientation =
    options.orientation && options.orientation !== 'unknown'
      ? options.orientation
      : inferOrientation(payload);
  const pageOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
  const pages = payload.PAGES ?? [];
  const compactOnePage =
    options.pageCount === 1 &&
    pages.length === 1 &&
    pageOrientation === 'portrait';

  const htmlPages = pages
    .map((page, index) => {
      return `${index > 0 ? '<div class="page-break"></div>' : ''}${renderPage(page, index, {
        compactOnePage,
      })}`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Letters And Statements</title>
  <style>${buildCss(pageOrientation)}</style>
</head>
<body>
  <main class="document letters-and-statements">${htmlPages}</main>
</body>
</html>`;
}

