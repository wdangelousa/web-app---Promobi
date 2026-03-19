/**
 * lib/eb1EvidencePhotoSheetRenderer.ts
 * -----------------------------------------------------------------------------
 * Generic structured renderer for EB1 evidence photo sheets.
 *
 * This renderer preserves:
 * - page parity (one rendered page per extracted page)
 * - zone order and hierarchy
 * - photo layout modes (single, two-up, two-plus-one)
 * - highlight marker presence
 * - footer identity anchoring
 * -----------------------------------------------------------------------------
 */

import type {
  Eb1EvidenceLayoutZone,
  Eb1EvidenceOrientation,
  Eb1EvidencePhotoSheet,
  Eb1EvidenceStructuredPage,
} from '@/types/eb1EvidencePhotoSheet';

export interface Eb1EvidencePhotoSheetRenderOptions {
  pageCount?: number;
  orientation?: Eb1EvidenceOrientation;
}

type PhotoLayoutMode = 'single' | 'two' | 'two_plus_one';

interface PageRenderMode {
  compactOnePage: boolean;
  photoLayoutMode: PhotoLayoutMode;
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

function buildResolvedContentByZoneId(
  page: Eb1EvidenceStructuredPage,
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

function isPhotoZone(zone: Eb1EvidenceLayoutZone): boolean {
  const type = normalizeZoneBindingId(zone.zone_type);
  const id = normalizeZoneBindingId(zone.zone_id);
  return (
    type.includes('photo') ||
    type.includes('image') ||
    id.includes('photo') ||
    id.includes('gallery')
  );
}

function isHighlightZone(zone: Eb1EvidenceLayoutZone): boolean {
  const type = normalizeZoneBindingId(zone.zone_type);
  const id = normalizeZoneBindingId(zone.zone_id);
  return type.includes('highlight') || type.includes('marker') || id.includes('highlight');
}

function isLikelyTextZone(zone: Eb1EvidenceLayoutZone): boolean {
  const type = normalizeZoneBindingId(zone.zone_type);
  if (!type) return true;
  if (isPhotoZone(zone)) return false;
  if (isHighlightZone(zone)) return false;
  return true;
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
  page: Eb1EvidenceStructuredPage,
  contentByZoneId: Map<string, string>,
  consumedZoneIds: Set<string>,
): string[] {
  const entries: string[] = [];

  for (const zone of page.LAYOUT_ZONES ?? []) {
    const zoneId = normalizeWhitespace(zone.zone_id);
    if (!zoneId || consumedZoneIds.has(zoneId)) continue;
    if (!isLikelyTextZone(zone)) continue;

    const content = nonEmpty(contentByZoneId.get(zoneId));
    if (!content) continue;

    entries.push(content);
    consumedZoneIds.add(zoneId);
  }

  return entries;
}

function parseLineHeight(
  value: string | undefined,
  compactOnePage: boolean,
): number {
  const parsed = Number.parseFloat((value ?? '').replace(/[^0-9.]/g, ''));
  const fallback = compactOnePage ? 1.18 : 1.25;
  if (!Number.isFinite(parsed)) return fallback;
  const max = compactOnePage ? 1.24 : 1.5;
  return Math.min(max, Math.max(1.1, parsed));
}

function parseFontSize(value: string | undefined, fallbackPt: number): string {
  const raw = normalizeWhitespace(value);
  if (!raw) return `${fallbackPt}pt`;
  if (/^[0-9]+(?:\.[0-9]+)?pt$/i.test(raw)) return raw.toLowerCase();

  const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric)) return `${fallbackPt}pt`;
  return `${Math.min(12, Math.max(8, numeric)).toFixed(1)}pt`;
}

function parsePtValue(value: string, fallbackPt: number): number {
  const raw = normalizeWhitespace(value);
  if (!raw) return fallbackPt;
  const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric)) return fallbackPt;
  return numeric;
}

function formatPtValue(value: number): string {
  return `${value.toFixed(1)}pt`;
}

function compactFontSize(
  value: string,
  minPt: number,
  deltaPt: number,
): string {
  const numeric = parsePtValue(value, minPt);
  return formatPtValue(Math.max(minPt, numeric - deltaPt));
}

function resolvePhotoLayoutMode(page: Eb1EvidenceStructuredPage): PhotoLayoutMode {
  const hint = normalizeZoneBindingId(
    `${page.RENDERING_HINTS?.recommended_photo_layout_mode ?? ''} ` +
      `${page.RENDERING_HINTS?.whether_images_must_remain_side_by_side_or_stacked ?? ''}`,
  );
  const zoneIds = new Set(
    (page.LAYOUT_ZONES ?? []).map((zone) => normalizeZoneBindingId(zone.zone_id)),
  );

  const hasSingle = zoneIds.has('z_single_photo');
  const hasTwoPlusOne = zoneIds.has('z_top_photo_gallery') || zoneIds.has('z_bottom_center_photo');
  const hasGallery = zoneIds.has('z_photo_gallery') || zoneIds.has('z_top_photo_gallery');

  if (
    hasTwoPlusOne ||
    hint.includes('top_row_2_up') ||
    hint.includes('2_up') ||
    hint.includes('bottom_centered') ||
    hint.includes('top_side_by_side_with_bottom_centered')
  ) {
    return 'two_plus_one';
  }

  if (
    hasGallery ||
    hint.includes('two_column') ||
    hint.includes('side_by_side') ||
    hint.includes('two_photo')
  ) {
    return 'two';
  }

  if (hasSingle) return 'single';
  return 'single';
}

function collectPhotoDescriptions(page: Eb1EvidenceStructuredPage): string[] {
  const elements = page.NON_TEXTUAL_ELEMENTS ?? [];
  const photoLines = elements
    .map((line) => normalizeWhitespace(line))
    .filter((line) => /photo|photograph|image/i.test(line));

  if (photoLines.length > 0) return photoLines;

  return ['[Photo: preserved visual photo block]'];
}

function collectHighlightMarkerCount(page: Eb1EvidenceStructuredPage): number {
  const fromZones = (page.LAYOUT_ZONES ?? []).filter((zone) => isHighlightZone(zone)).length;
  const fromText = (page.NON_TEXTUAL_ELEMENTS ?? []).filter((line) => /arrow|highlight/i.test(line)).length;
  return Math.max(fromZones, fromText);
}

function renderPhotoCard(
  index: number,
  text: string,
  marker: boolean,
  compactOnePage: boolean,
): string {
  return `<article class="photo-card${compactOnePage ? ' compact-photo-card' : ''}">
  ${marker ? '<div class="highlight-marker" aria-label="highlight marker">▼</div>' : ''}
  <div class="photo-placeholder">PHOTO ${index + 1}</div>
  <div class="photo-caption">${escapeHtml(text)}</div>
</article>`;
}

function renderPhotoStage(
  page: Eb1EvidenceStructuredPage,
  mode: PageRenderMode,
): string {
  const photos = collectPhotoDescriptions(page);
  const markerCount = collectHighlightMarkerCount(page);

  if (mode.photoLayoutMode === 'two_plus_one') {
    const topLeft = photos[0] ?? '[Photo: left top photo]';
    const topRight = photos[1] ?? '[Photo: right top photo]';
    const bottom = photos[2] ?? '[Photo: bottom centered photo]';

    return `<section class="photo-stage two-plus-one">
  <div class="photo-row">
    ${renderPhotoCard(0, topLeft, markerCount >= 1, mode.compactOnePage)}
    ${renderPhotoCard(1, topRight, markerCount >= 2, mode.compactOnePage)}
  </div>
  <div class="photo-bottom">
    ${renderPhotoCard(2, bottom, markerCount >= 3, mode.compactOnePage)}
  </div>
</section>`;
  }

  if (mode.photoLayoutMode === 'two') {
    const left = photos[0] ?? '[Photo: left photo]';
    const right = photos[1] ?? '[Photo: right photo]';

    return `<section class="photo-stage two-up">
  <div class="photo-row">
    ${renderPhotoCard(0, left, markerCount >= 1, mode.compactOnePage)}
    ${renderPhotoCard(1, right, markerCount >= 2, mode.compactOnePage)}
  </div>
</section>`;
  }

  const single = photos[0] ?? '[Photo: single centered photo]';
  return `<section class="photo-stage single">
  <div class="photo-single-wrap">
    ${renderPhotoCard(0, single, markerCount >= 1, mode.compactOnePage)}
  </div>
</section>`;
}

function renderNonTextLegend(
  page: Eb1EvidenceStructuredPage,
  compactOnePage: boolean,
): string {
  const elements = (page.NON_TEXTUAL_ELEMENTS ?? [])
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  if (elements.length === 0) return '';

  if (compactOnePage) {
    return `<section class="non-text-legend compact">
  <div class="non-text-inline">${escapeHtml(elements.join(' • '))}</div>
</section>`;
  }

  const items = elements
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');

  return `<section class="non-text-legend">
  <h3>NON-TEXTUAL ELEMENTS PRESERVED</h3>
  <ul>${items}</ul>
</section>`;
}

function renderPage(
  page: Eb1EvidenceStructuredPage,
  pageIndex: number,
  mode: PageRenderMode,
): string {
  const contentByZoneId = buildResolvedContentByZoneId(page);
  const consumedZoneIds = new Set<string>();

  const title = findContentByPreferredIds(contentByZoneId, ['z_evidence_title']);
  if (title) consumedZoneIds.add('z_evidence_title');

  const paragraph = findContentByPreferredIds(contentByZoneId, ['z_explanatory_paragraph']);
  if (paragraph) consumedZoneIds.add('z_explanatory_paragraph');

  const footer = findContentByPreferredIds(contentByZoneId, ['z_footer_identity']);
  if (footer) consumedZoneIds.add('z_footer_identity');

  const additionalText = collectRemainingTextZones(page, contentByZoneId, consumedZoneIds);

  const metadata = page.PAGE_METADATA;
  const hints = page.RENDERING_HINTS;
  const spacingProfile =
    mode.compactOnePage || hints?.recommended_spacing_profile === 'compact'
      ? 'compact'
      : 'normal';
  const lineHeight = parseLineHeight(
    hints?.recommended_line_height,
    mode.compactOnePage,
  );
  const fonts = metadata?.suggested_font_size_by_section ?? {};
  const baseTitleSize = parseFontSize(fonts.z_evidence_title, 11);
  const baseBodySize = parseFontSize(fonts.z_explanatory_paragraph, 11);
  const baseFooterSize = parseFontSize(fonts.z_footer_identity, 11);
  const titleSize = mode.compactOnePage
    ? compactFontSize(baseTitleSize, 9.8, 0.5)
    : baseTitleSize;
  const bodySize = mode.compactOnePage
    ? compactFontSize(baseBodySize, 9.6, 0.6)
    : baseBodySize;
  const footerSize = mode.compactOnePage
    ? compactFontSize(baseFooterSize, 9.4, 0.4)
    : baseFooterSize;

  const styleVars = [
    `--evidence-line-height:${lineHeight}`,
    `--evidence-title-size:${titleSize}`,
    `--evidence-body-size:${bodySize}`,
    `--evidence-footer-size:${footerSize}`,
    `--evidence-page-min-height:${mode.compactOnePage ? '7.86in' : '8.02in'}`,
  ].join(';');

  const titleFallback = nonEmpty(title) ?? 'EVIDENCE';
  const paragraphHtml = nonEmpty(paragraph)
    ? `<p class="evidence-paragraph">${escapeHtml(paragraph)}</p>`
    : '<p class="evidence-paragraph">[illegible]</p>';

  const additionalHtml = additionalText
    .map((text) => `<p class="evidence-extra">${escapeHtml(text)}</p>`)
    .join('');

  const footerText = nonEmpty(footer) ?? '[illegible]';

  return `<section class="evidence-page spacing-${spacingProfile}${mode.compactOnePage ? ' one-page-compact' : ''} layout-${mode.photoLayoutMode}" data-page-number="${metadata?.page_number ?? pageIndex + 1}" style="${styleVars}">
  <header class="evidence-header">
    <h1 class="evidence-title">${escapeHtml(titleFallback)}</h1>
    ${paragraphHtml}
    ${additionalHtml}
  </header>

  ${renderPhotoStage(page, mode)}
  ${renderNonTextLegend(page, mode.compactOnePage)}

  <footer class="evidence-footer">${escapeHtml(footerText)}</footer>
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
  font-family: Arial, Helvetica, sans-serif;
  color: #111827;
  background: #fff;
}
.document {
  width: 100%;
}
.evidence-page {
  width: 100%;
  min-height: var(--evidence-page-min-height, 8.02in);
  border: 0.7px solid #dde5f0;
  border-radius: 4px;
  padding: 0.16in 0.18in;
  display: flex;
  flex-direction: column;
  gap: 0.1in;
  line-height: var(--evidence-line-height);
}
.evidence-header {
  display: block;
}
.evidence-title {
  margin: 0 0 0.05in;
  font-size: var(--evidence-title-size);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2px;
}
.evidence-paragraph,
.evidence-extra {
  margin: 0 0 0.045in;
  font-size: var(--evidence-body-size);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.photo-stage {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.075in;
  align-items: center;
}
.photo-row {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.12in;
}
.photo-bottom,
.photo-single-wrap {
  width: 56%;
}
.photo-card {
  border: 0.8px solid #d6dfeb;
  border-radius: 4px;
  background: #fafcff;
  padding: 0.06in;
  position: relative;
  min-height: 1.68in;
  display: flex;
  flex-direction: column;
  gap: 0.045in;
}
.photo-placeholder {
  width: 100%;
  min-height: 1.18in;
  max-height: 1.66in;
  aspect-ratio: 4 / 3;
  border: 0.8px dashed #b9c7dc;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #4b5563;
  letter-spacing: 0.5px;
}
.photo-caption {
  margin-top: 0.02in;
  font-size: 8.4pt;
  color: #1f2937;
  line-height: 1.18;
  white-space: pre-wrap;
}
.highlight-marker {
  position: absolute;
  top: -0.14in;
  left: 0.1in;
  color: #f59e0b;
  font-weight: 800;
  font-size: 15pt;
  line-height: 1;
}
.non-text-legend {
  border: 0.8px solid #dce4ef;
  border-radius: 4px;
  background: #f9fbff;
  padding: 0.06in 0.08in;
}
.non-text-legend h3 {
  margin: 0 0 0.03in;
  font-size: 7.8pt;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #374151;
}
.non-text-legend ul {
  margin: 0;
  padding-left: 0.18in;
}
.non-text-legend li {
  margin: 0 0 0.02in;
  font-size: 8pt;
  line-height: 1.15;
}
.non-text-legend.compact {
  padding: 0.035in 0.055in;
}
.non-text-inline {
  font-size: 7.4pt;
  line-height: 1.08;
  color: #334155;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.evidence-footer {
  margin-top: auto;
  font-size: var(--evidence-footer-size);
  font-weight: 500;
  text-align: left;
}
.spacing-compact .photo-card {
  min-height: 1.52in;
}
.spacing-compact .evidence-paragraph,
.spacing-compact .evidence-extra {
  margin-bottom: 0.032in;
}
.evidence-page.one-page-compact {
  padding: 0.13in 0.14in;
  gap: 0.075in;
}
.evidence-page.one-page-compact .evidence-title {
  margin-bottom: 0.035in;
}
.evidence-page.one-page-compact .evidence-paragraph,
.evidence-page.one-page-compact .evidence-extra {
  margin-bottom: 0.028in;
}
.evidence-page.one-page-compact.layout-single .photo-single-wrap {
  width: 58%;
}
.evidence-page.one-page-compact.layout-single .photo-card {
  min-height: 2.12in;
}
.evidence-page.one-page-compact.layout-single .photo-placeholder {
  min-height: 1.82in;
  max-height: 2.12in;
}
.evidence-page.one-page-compact.layout-two .photo-card {
  min-height: 1.5in;
}
.evidence-page.one-page-compact.layout-two .photo-placeholder {
  min-height: 1.16in;
  max-height: 1.34in;
}
.evidence-page.one-page-compact.layout-two_plus_one .photo-row .photo-card {
  min-height: 1.36in;
}
.evidence-page.one-page-compact.layout-two_plus_one .photo-row .photo-placeholder {
  min-height: 1.01in;
  max-height: 1.17in;
}
.evidence-page.one-page-compact.layout-two_plus_one .photo-bottom {
  width: 52%;
}
.evidence-page.one-page-compact.layout-two_plus_one .photo-bottom .photo-card {
  min-height: 1.52in;
}
.evidence-page.one-page-compact.layout-two_plus_one .photo-bottom .photo-placeholder {
  min-height: 1.16in;
  max-height: 1.34in;
}
.evidence-page.one-page-compact .photo-caption {
  font-size: 7.4pt;
  line-height: 1.08;
}
.evidence-page.one-page-compact .highlight-marker {
  top: -0.11in;
  left: 0.08in;
  font-size: 13pt;
}
.evidence-page.one-page-compact .non-text-inline {
  font-size: 6.9pt;
  line-height: 1.04;
}
.page-break {
  break-before: page;
  page-break-before: always;
}
`;
}

function inferOrientation(
  payload: Eb1EvidencePhotoSheet,
): 'portrait' | 'landscape' {
  if (payload.orientation === 'landscape') return 'landscape';
  const firstPageOrientation = payload.PAGES?.[0]?.PAGE_METADATA?.suggested_orientation;
  return firstPageOrientation === 'landscape' ? 'landscape' : 'portrait';
}

export function renderEb1EvidencePhotoSheetHtml(
  payload: Eb1EvidencePhotoSheet,
  options: Eb1EvidencePhotoSheetRenderOptions = {},
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
      const mode: PageRenderMode = {
        compactOnePage,
        photoLayoutMode: resolvePhotoLayoutMode(page),
      };
      return `${index > 0 ? '<div class="page-break"></div>' : ''}${renderPage(page, index, mode)}`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EB1 Evidence Photo Sheet</title>
  <style>${buildCss(pageOrientation)}</style>
</head>
<body>
  <main class="document eb1-evidence-photo-sheet">${htmlPages}</main>
</body>
</html>`;
}
