/**
 * lib/editorialNewsPagesRenderer.ts
 * -----------------------------------------------------------------------------
 * Generic structured renderer for flexible editorial/news pages.
 *
 * Handles:
 * - print news clippings
 * - web article pages
 * - web print views (with furniture)
 * - editorial metadata / cover pages
 * -----------------------------------------------------------------------------
 */

import type {
  EditorialNewsLayoutZone,
  EditorialNewsModelKey,
  EditorialNewsOrientation,
  EditorialNewsPages,
  EditorialNewsStructuredPage,
} from '@/types/editorialNewsPages';

export interface EditorialNewsPagesRenderOptions {
  pageCount?: number;
  orientation?: EditorialNewsOrientation;
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

function isLikelyPhotoZone(zone: EditorialNewsLayoutZone): boolean {
  const signal = normalizeZoneBindingId(
    `${zone.zone_id} ${zone.zone_type} ${zone.visual_style}`,
  );
  return (
    signal.includes('photo') ||
    signal.includes('image') ||
    signal.includes('hero_image') ||
    signal.includes('gallery') ||
    signal.includes('figure')
  );
}

function isLikelyFurnitureZone(zone: EditorialNewsLayoutZone): boolean {
  const signal = normalizeZoneBindingId(
    `${zone.zone_id} ${zone.zone_type}`,
  );
  return (
    signal.includes('site_navigation') ||
    signal.includes('cookie_notice') ||
    signal.includes('footer_links') ||
    signal.includes('related_content') ||
    signal.includes('url_timestamp')
  );
}

function buildResolvedContentByZoneId(
  page: EditorialNewsStructuredPage,
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
  page: EditorialNewsStructuredPage,
  contentByZoneId: Map<string, string>,
  consumedZoneIds: Set<string>,
  options: {
    includeFurniture?: boolean;
    includePhotoZones?: boolean;
  } = {},
): string[] {
  const entries: string[] = [];

  for (const zone of page.LAYOUT_ZONES ?? []) {
    const zoneId = normalizeWhitespace(zone.zone_id);
    if (!zoneId || consumedZoneIds.has(zoneId)) continue;
    if (!options.includePhotoZones && isLikelyPhotoZone(zone)) continue;
    if (!options.includeFurniture && isLikelyFurnitureZone(zone)) continue;

    const content = nonEmpty(contentByZoneId.get(zoneId));
    if (!content) continue;
    entries.push(content);
    consumedZoneIds.add(zoneId);
  }

  return entries;
}

function parseLineHeight(value: string | undefined, compactOnePage: boolean): number {
  const parsed = Number.parseFloat((value ?? '').replace(/[^0-9.]/g, ''));
  const fallback = compactOnePage ? 1.18 : 1.28;
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

function collectPhotoDescriptions(page: EditorialNewsStructuredPage): string[] {
  const nonText = page.NON_TEXTUAL_ELEMENTS ?? [];
  const photoLike = nonText
    .map((line) => normalizeWhitespace(line))
    .filter((line) => /photo|image|figure|illustration|gallery/i.test(line));
  if (photoLike.length > 0) return photoLike;
  return [];
}

function inferPageModelKey(page: EditorialNewsStructuredPage): EditorialNewsModelKey {
  const hintSignal = normalizeZoneBindingId(
    `${page.PAGE_METADATA?.suggested_model_key ?? ''} ${page.RENDERING_HINTS?.recommended_layout_mode ?? ''}`,
  );
  const zoneSignals = new Set(
    (page.LAYOUT_ZONES ?? []).map((zone) => normalizeZoneBindingId(zone.zone_id)),
  );

  if (
    hintSignal.includes('print_news_clipping') ||
    hintSignal.includes('multi_column') ||
    zoneSignals.has('z_photo_gallery')
  ) {
    return 'print_news_clipping';
  }
  if (
    hintSignal.includes('web_news_printview') ||
    zoneSignals.has('z_cookie_notice') ||
    zoneSignals.has('z_site_navigation') ||
    zoneSignals.has('z_footer_links')
  ) {
    return 'web_news_printview';
  }
  if (
    hintSignal.includes('editorial_article_cover_or_metadata') ||
    zoneSignals.has('z_doi_block') ||
    zoneSignals.has('z_metadata_block') ||
    zoneSignals.has('z_abstract_block')
  ) {
    return 'editorial_article_cover_or_metadata';
  }
  if (hintSignal.includes('web_news_article')) {
    return 'web_news_article';
  }
  return 'editorial_news_generic_structured';
}

function renderPhotoBlock(page: EditorialNewsStructuredPage, compactOnePage: boolean): string {
  const photos = collectPhotoDescriptions(page);
  if (photos.length === 0) return '';

  const cards = photos
    .slice(0, 4)
    .map(
      (text, index) => `<article class="photo-card${compactOnePage ? ' compact' : ''}">
  <div class="photo-placeholder">PHOTO ${index + 1}</div>
  <div class="photo-caption">${escapeHtml(text)}</div>
</article>`,
    )
    .join('');

  const className = photos.length >= 2 ? 'photo-grid two-up' : 'photo-grid single';
  return `<section class="photo-block">
  <h2 class="section-label">PHOTO / FIGURE BLOCK</h2>
  <div class="${className}">${cards}</div>
</section>`;
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
  page: EditorialNewsStructuredPage,
  index: number,
  options: {
    compactOnePage: boolean;
    columnsPreferred: boolean;
  },
): string {
  const contentByZoneId = buildResolvedContentByZoneId(page);
  const consumed = new Set<string>();

  const publicationHeader = findContentByPreferredIds(contentByZoneId, ['z_publication_header']);
  if (publicationHeader) consumed.add('z_publication_header');
  const sectionLabel = findContentByPreferredIds(contentByZoneId, ['z_section_label']);
  if (sectionLabel) consumed.add('z_section_label');
  const headline = findContentByPreferredIds(contentByZoneId, ['z_headline']);
  if (headline) consumed.add('z_headline');
  const subheadline = findContentByPreferredIds(contentByZoneId, ['z_subheadline']);
  if (subheadline) consumed.add('z_subheadline');
  const byline = findContentByPreferredIds(contentByZoneId, ['z_byline']);
  if (byline) consumed.add('z_byline');
  const locationDate = findContentByPreferredIds(contentByZoneId, ['z_location_date']);
  if (locationDate) consumed.add('z_location_date');
  const articleBody = findContentByPreferredIds(contentByZoneId, ['z_article_body']);
  if (articleBody) consumed.add('z_article_body');
  const caption = findContentByPreferredIds(contentByZoneId, ['z_caption']);
  if (caption) consumed.add('z_caption');
  const metadataBlock = findContentByPreferredIds(contentByZoneId, ['z_metadata_block']);
  if (metadataBlock) consumed.add('z_metadata_block');
  const doiBlock = findContentByPreferredIds(contentByZoneId, ['z_doi_block']);
  if (doiBlock) consumed.add('z_doi_block');
  const abstractBlock = findContentByPreferredIds(contentByZoneId, ['z_abstract_block']);
  if (abstractBlock) consumed.add('z_abstract_block');
  const urlTimestamp = findContentByPreferredIds(contentByZoneId, ['z_url_timestamp']);
  if (urlTimestamp) consumed.add('z_url_timestamp');
  const cookieNotice = findContentByPreferredIds(contentByZoneId, ['z_cookie_notice']);
  if (cookieNotice) consumed.add('z_cookie_notice');
  const siteNavigation = findContentByPreferredIds(contentByZoneId, ['z_site_navigation']);
  if (siteNavigation) consumed.add('z_site_navigation');
  const relatedContent = findContentByPreferredIds(contentByZoneId, ['z_related_content']);
  if (relatedContent) consumed.add('z_related_content');
  const footerLinks = findContentByPreferredIds(contentByZoneId, ['z_footer_links']);
  if (footerLinks) consumed.add('z_footer_links');

  const additionalMainText = collectRemainingTextZones(page, contentByZoneId, consumed, {
    includeFurniture: false,
  });
  const additionalFurnitureText = collectRemainingTextZones(page, contentByZoneId, consumed, {
    includeFurniture: true,
  });

  const inferredKey = inferPageModelKey(page);
  const hints = page.RENDERING_HINTS;
  const metadata = page.PAGE_METADATA;
  const fonts = metadata.suggested_font_size_by_section ?? {};
  const lineHeight = parseLineHeight(
    hints?.recommended_line_height,
    options.compactOnePage,
  );
  const baseHeadlineSize = parseFontSize(fonts.z_headline, 14);
  const baseSubheadlineSize = parseFontSize(fonts.z_subheadline, 11);
  const baseBylineSize = parseFontSize(fonts.z_byline, 9.5);
  const baseBodySize = parseFontSize(fonts.z_article_body, 10.2);
  const headlineSize = options.compactOnePage
    ? compactFontSize(baseHeadlineSize, 11.8, 0.7)
    : baseHeadlineSize;
  const subheadlineSize = options.compactOnePage
    ? compactFontSize(baseSubheadlineSize, 9.5, 0.5)
    : baseSubheadlineSize;
  const bylineSize = options.compactOnePage
    ? compactFontSize(baseBylineSize, 8.6, 0.3)
    : baseBylineSize;
  const bodySize = options.compactOnePage
    ? compactFontSize(baseBodySize, 9.2, 0.4)
    : baseBodySize;

  const styleVars = [
    `--news-line-height:${lineHeight}`,
    `--news-headline-size:${headlineSize}`,
    `--news-subheadline-size:${subheadlineSize}`,
    `--news-byline-size:${bylineSize}`,
    `--news-body-size:${bodySize}`,
    `--news-page-min-height:${options.compactOnePage ? '7.84in' : '8.05in'}`,
  ].join(';');

  const bodyRows = [
    nonEmpty(articleBody) ?? '',
    ...additionalMainText,
  ].filter(Boolean);
  const bodyHtml = bodyRows.length > 0
    ? bodyRows
        .map((row) => `<p>${escapeHtml(row)}</p>`)
        .join('')
    : '<p>[illegible]</p>';

  const furnitureRows = [
    nonEmpty(siteNavigation),
    nonEmpty(cookieNotice),
    nonEmpty(urlTimestamp),
    nonEmpty(relatedContent),
    nonEmpty(footerLinks),
    ...additionalFurnitureText,
  ].filter((row): row is string => Boolean(row));

  const metadataRows = [
    nonEmpty(metadataBlock),
    nonEmpty(doiBlock),
    nonEmpty(abstractBlock),
    nonEmpty(caption),
  ].filter((row): row is string => Boolean(row));

  const useColumns =
    options.columnsPreferred ||
    inferredKey === 'print_news_clipping' ||
    normalizeZoneBindingId(hints?.recommended_layout_mode).includes('two_column') ||
    normalizeZoneBindingId(hints?.recommended_layout_mode).includes('multi_column');

  return `<section class="news-page${options.compactOnePage ? ' compact' : ''}" data-page-number="${metadata.page_number ?? index + 1}" data-model-key="${inferredKey}" style="${styleVars}">
  <header class="news-header">
    ${publicationHeader ? `<div class="publication-header">${escapeHtml(publicationHeader)}</div>` : ''}
    ${sectionLabel ? `<div class="section-chip">${escapeHtml(sectionLabel)}</div>` : ''}
    <h1 class="headline">${escapeHtml(nonEmpty(headline) ?? 'EDITORIAL NEWS PAGE')}</h1>
    ${subheadline ? `<p class="subheadline">${escapeHtml(subheadline)}</p>` : ''}
    ${(byline || locationDate) ? `<p class="byline">${escapeHtml([byline, locationDate].filter(Boolean).join(' | '))}</p>` : ''}
  </header>

  ${renderPhotoBlock(page, options.compactOnePage)}

  <section class="article-body">
    <h2 class="section-label">ARTICLE BODY</h2>
    <div class="article-flow${useColumns ? ' columns' : ''}">
      ${bodyHtml}
    </div>
  </section>

  ${renderListBlock('METADATA / ABSTRACT / DOI / CAPTIONS', metadataRows, 'meta-block')}
  ${renderListBlock('WEB FURNITURE / RELATED CONTENT', furnitureRows, 'furniture-block')}
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
.news-page {
  width: 100%;
  min-height: var(--news-page-min-height, 8.05in);
  border: 0.7px solid #dce4f0;
  border-radius: 4px;
  padding: 0.16in 0.18in;
  display: flex;
  flex-direction: column;
  gap: 0.1in;
  line-height: var(--news-line-height);
}
.news-header { display: block; }
.publication-header {
  font-size: 8.8pt;
  letter-spacing: 0.2px;
  color: #4b5563;
  text-transform: uppercase;
}
.section-chip {
  margin-top: 0.02in;
  display: inline-block;
  border: 0.8px solid #cbd5e1;
  border-radius: 999px;
  padding: 0.01in 0.08in;
  font-size: 8.4pt;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: #334155;
}
.headline {
  margin: 0.04in 0 0.03in;
  font-size: var(--news-headline-size);
  line-height: 1.15;
  font-weight: 700;
}
.subheadline {
  margin: 0 0 0.03in;
  font-size: var(--news-subheadline-size);
  color: #1f2937;
}
.byline {
  margin: 0;
  font-size: var(--news-byline-size);
  font-weight: 600;
  color: #374151;
}
.section-label {
  margin: 0 0 0.03in;
  font-size: 8.2pt;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #374151;
}
.article-body p {
  margin: 0 0 0.04in;
  font-size: var(--news-body-size);
  text-align: justify;
  white-space: pre-wrap;
}
.article-flow.columns {
  column-count: 2;
  column-gap: 0.25in;
}
.photo-block {
  border: 0.8px solid #d7e0eb;
  border-radius: 4px;
  padding: 0.05in 0.06in;
  background: #fbfdff;
}
.photo-grid {
  display: grid;
  gap: 0.08in;
}
.photo-grid.single { grid-template-columns: 1fr; }
.photo-grid.two-up { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.photo-card {
  border: 0.8px solid #d6dfeb;
  border-radius: 4px;
  background: #fff;
  padding: 0.05in;
}
.photo-card.compact { padding: 0.04in; }
.photo-placeholder {
  min-height: 1.22in;
  max-height: 1.62in;
  aspect-ratio: 4 / 3;
  border: 0.8px dashed #b8c7dd;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8.5pt;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: #4b5563;
}
.photo-caption {
  margin-top: 0.03in;
  font-size: 7.8pt;
  line-height: 1.12;
  color: #1f2937;
  white-space: pre-wrap;
}
.meta-block, .furniture-block, .non-text-block {
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
  font-size: 8pt;
  line-height: 1.14;
}
.news-page.compact {
  padding: 0.13in 0.14in;
  gap: 0.075in;
}
.news-page.compact .headline {
  margin-top: 0.03in;
  margin-bottom: 0.02in;
}
.news-page.compact .article-body p {
  margin-bottom: 0.03in;
}
.news-page.compact .photo-placeholder {
  min-height: 1.04in;
  max-height: 1.3in;
}
.page-break {
  break-before: page;
  page-break-before: always;
}
`;
}

function inferOrientation(payload: EditorialNewsPages): 'portrait' | 'landscape' {
  if (payload.orientation === 'landscape') return 'landscape';
  const firstPageHint = payload.PAGES?.[0]?.PAGE_METADATA?.suggested_orientation;
  return firstPageHint === 'landscape' ? 'landscape' : 'portrait';
}

export function renderEditorialNewsPagesHtml(
  payload: EditorialNewsPages,
  options: EditorialNewsPagesRenderOptions = {},
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
      const inferredKey = inferPageModelKey(page);
      const columnsPreferred =
        inferredKey === 'print_news_clipping' ||
        inferredKey === 'web_news_printview';
      return `${index > 0 ? '<div class="page-break"></div>' : ''}${renderPage(page, index, {
        compactOnePage,
        columnsPreferred,
      })}`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Editorial News Pages</title>
  <style>${buildCss(pageOrientation)}</style>
</head>
<body>
  <main class="document editorial-news-pages">${htmlPages}</main>
</body>
</html>`;
}

