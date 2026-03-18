/**
 * lib/civilRecordCompactZoneRenderer.ts
 * -----------------------------------------------------------------------------
 * Zone-based compact renderer for one-page civil records.
 *
 * Consumes Anthropic PAGE_METADATA/LAYOUT_ZONES/TRANSLATED_CONTENT_BY_ZONE/
 * RENDERING_HINTS payloads and renders a compact, source-mirroring layout.
 * -----------------------------------------------------------------------------
 */

import type {
  CivilRecordGeneralZoneBlueprint,
  CivilRecordLayoutZone,
  CivilRecordStructuredPage,
  CivilRecordZoneTranslatedContent,
} from '@/types/civilRecordGeneral';

export interface CivilRecordCompactZoneRenderOptions {
  pageCount?: number;
  orientation?: 'portrait' | 'landscape' | 'unknown';
}

type ZoneBucket =
  | 'header'
  | 'title'
  | 'metadata'
  | 'transcription'
  | 'lowerLeft'
  | 'lowerRight'
  | 'bottom'
  | 'leftMargin'
  | 'rightMargin'
  | 'other';

interface ZoneWithContent {
  zone: CivilRecordLayoutZone;
  content: string;
}

interface BucketedZones {
  header: ZoneWithContent[];
  title: ZoneWithContent[];
  metadata: ZoneWithContent[];
  transcription: ZoneWithContent[];
  lowerLeft: ZoneWithContent[];
  lowerRight: ZoneWithContent[];
  bottom: ZoneWithContent[];
  leftMargin: ZoneWithContent[];
  rightMargin: ZoneWithContent[];
  other: ZoneWithContent[];
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

function normalizeZoneBindingId(value: string | undefined | null): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isGenericZoneBindingId(value: string): boolean {
  return /^z?_?\d{1,3}$/.test(value);
}

function normalizeToken(value: string | undefined | null): string {
  return normalizeWhitespace(value).toLowerCase().replace(/[\s-]+/g, '_');
}

function nonEmpty(value: string | undefined | null): string | null {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function buildResolvedContentByZoneId(
  page: CivilRecordStructuredPage,
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
      const zoneId = normalizeWhitespace(entry?.zone_id);
      const normalizedId = normalizeZoneBindingId(entry?.zone_id);
      const content = normalizeWhitespace(entry?.content);
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

function classifyZone(zone: CivilRecordLayoutZone): ZoneBucket {
  const zoneType = normalizeToken(zone.zone_type);
  const position = normalizeToken(zone.relative_position);
  const visualStyle = normalizeToken(zone.visual_style);

  const isLeftMargin =
    position === 'left_margin' ||
    (zoneType === 'side_margin_note' && position.includes('left'));
  if (isLeftMargin) return 'leftMargin';

  const isRightMargin =
    position === 'right_margin' ||
    (zoneType === 'side_margin_note' && position.includes('right'));
  if (isRightMargin) return 'rightMargin';

  if (zoneType === 'title') return 'title';
  if (zoneType === 'header' || zoneType === 'logo_block') return 'header';

  if (
    zoneType === 'metadata_grid' ||
    zoneType === 'table' ||
    visualStyle.includes('compact_grid') ||
    visualStyle.includes('table_like')
  ) {
    return 'metadata';
  }

  if (
    zoneType === 'footer' ||
    zoneType === 'validation_block' ||
    position === 'bottom'
  ) {
    return 'bottom';
  }

  if (position === 'lower_left') return 'lowerLeft';
  if (position === 'lower_right') return 'lowerRight';

  if (
    zoneType === 'paragraph_block' ||
    visualStyle.includes('boxed') ||
    visualStyle.includes('full_width')
  ) {
    return 'transcription';
  }

  if (zoneType === 'signature_block' || zoneType === 'stamp_block' || zoneType === 'seal_block') {
    return position.includes('left') ? 'lowerLeft' : 'lowerRight';
  }

  if (position === 'top' || position.startsWith('upper_')) return 'header';
  if (position === 'center') return 'transcription';

  return 'other';
}

function mergeUnmappedZoneContent(
  knownZones: CivilRecordLayoutZone[],
  contentMap: Map<string, string>,
): ZoneWithContent[] {
  const knownIds = new Set(
    (knownZones ?? []).map((zone) => normalizeWhitespace(zone.zone_id)).filter(Boolean),
  );
  const extras: ZoneWithContent[] = [];

  for (const [zoneId, content] of contentMap.entries()) {
    if (knownIds.has(zoneId) || !nonEmpty(content)) continue;
    extras.push({
      zone: {
        zone_id: zoneId,
        zone_type: 'other',
        relative_position: 'center',
        visual_style: 'full-width',
        compaction_priority: 'high',
      },
      content,
    });
  }

  return extras;
}

function buildBuckets(page: CivilRecordStructuredPage): BucketedZones {
  const buckets: BucketedZones = {
    header: [],
    title: [],
    metadata: [],
    transcription: [],
    lowerLeft: [],
    lowerRight: [],
    bottom: [],
    leftMargin: [],
    rightMargin: [],
    other: [],
  };

  const layoutZones = page.LAYOUT_ZONES ?? [];
  const contentMap = buildResolvedContentByZoneId(page);

  const resolvedZones: ZoneWithContent[] = layoutZones
    .map((zone) => ({
      zone,
      content: contentMap.get(normalizeWhitespace(zone.zone_id)) ?? '',
    }))
    .filter((entry) => nonEmpty(entry.content));

  resolvedZones.push(...mergeUnmappedZoneContent(layoutZones, contentMap));

  for (const resolved of resolvedZones) {
    buckets[classifyZone(resolved.zone)].push(resolved);
  }

  if (buckets.transcription.length === 0 && buckets.other.length > 0) {
    const fallback = [...buckets.other].sort((a, b) => b.content.length - a.content.length)[0];
    buckets.transcription.push(fallback);
    buckets.other = buckets.other.filter((entry) => entry !== fallback);
  }

  return buckets;
}

function asHtmlText(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

function renderParagraphs(content: string, className: string): string {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return `<p class="${className}">${asHtmlText(content)}</p>`;
  }

  return paragraphs
    .map((paragraph) => `<p class="${className}">${asHtmlText(paragraph)}</p>`)
    .join('');
}

function renderZoneBox(title: string, body: string, cssClass: string): string {
  return `<section class="zone-box ${cssClass}">
  <h3 class="zone-box-title">${escapeHtml(title)}</h3>
  ${body}
</section>`;
}

function parseMetadataPairs(text: string): Array<{ label: string; value: string }> {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const pairs: Array<{ label: string; value: string }> = [];

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && colonIndex < line.length - 1) {
      pairs.push({
        label: line.slice(0, colonIndex).trim(),
        value: line.slice(colonIndex + 1).trim(),
      });
      continue;
    }

    const dashMatch = line.match(/^(.{1,80}?)\s+[-\u2013\u2014]\s+(.+)$/);
    if (dashMatch) {
      pairs.push({
        label: dashMatch[1].trim(),
        value: dashMatch[2].trim(),
      });
      continue;
    }

    pairs.push({ label: 'Detail', value: line });
  }

  return pairs;
}

function renderMetadataGrid(zones: ZoneWithContent[]): string {
  const pairs = zones.flatMap((zone) => parseMetadataPairs(zone.content));
  if (pairs.length === 0) return '';

  const cards = pairs
    .map(
      (pair) => `<div class="metadata-item">
  <span class="metadata-label">${escapeHtml(pair.label)}</span>
  <span class="metadata-value">${escapeHtml(pair.value)}</span>
</div>`,
    )
    .join('');

  return renderZoneBox('Registry Metadata', `<div class="metadata-grid">${cards}</div>`, 'metadata-grid-zone');
}

function renderInlineZones(zones: ZoneWithContent[], cssClass: string): string {
  if (zones.length === 0) return '';
  const chips = zones
    .map((zone) => `<div class="inline-zone ${cssClass}">${asHtmlText(zone.content)}</div>`)
    .join('');
  return `<div class="inline-zone-wrap ${cssClass}">${chips}</div>`;
}

function renderMarginNotes(zones: ZoneWithContent[], side: 'left' | 'right'): string {
  if (zones.length === 0) return `<aside class="margin-notes ${side}" aria-hidden="true"></aside>`;
  const notes = zones
    .map(
      (zone) => `<div class="margin-note-item">
  <span class="margin-note-text">${asHtmlText(zone.content)}</span>
</div>`,
    )
    .join('');
  return `<aside class="margin-notes ${side}">${notes}</aside>`;
}

function renderTranscription(zones: ZoneWithContent[]): string {
  if (zones.length === 0) return '';

  const body = zones
    .map((zone) => `<div class="transcription-zone">
  ${renderParagraphs(zone.content, 'transcription-paragraph')}
</div>`)
    .join('');

  return renderZoneBox('Certified Transcription', body, 'transcription-zone-box');
}

function renderLowerZone(title: string, zones: ZoneWithContent[], cssClass: string): string {
  if (zones.length === 0) return '';
  const body = zones
    .map((zone) => renderParagraphs(zone.content, 'lower-zone-line'))
    .join('');
  return renderZoneBox(title, body, cssClass);
}

function renderBottomBand(zones: ZoneWithContent[]): string {
  if (zones.length === 0) return '';
  const lines = zones
    .map((zone) => `<div class="bottom-band-line">${asHtmlText(zone.content)}</div>`)
    .join('');
  return `<footer class="bottom-band">${lines}</footer>`;
}

function parseLineHeight(value: string | undefined): number {
  const parsed = Number.parseFloat((value ?? '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(parsed)) return 1.12;
  return Math.min(1.35, Math.max(1.05, parsed));
}

function parseFontSize(value: string | undefined, fallbackPt: number): string {
  const raw = normalizeWhitespace(value);
  if (!raw) return `${fallbackPt}pt`;
  if (/^[0-9]+(?:\.[0-9]+)?pt$/i.test(raw)) return raw.toLowerCase();

  const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric)) return `${fallbackPt}pt`;
  return `${Math.min(11, Math.max(6.2, numeric)).toFixed(1)}pt`;
}

function renderPage(
  page: CivilRecordStructuredPage,
  pageIndex: number,
): string {
  const buckets = buildBuckets(page);
  const hints = page.RENDERING_HINTS;
  const metadata = page.PAGE_METADATA;
  const spacingProfile = hints?.recommended_spacing_profile === 'normal' ? 'normal' : 'compact';
  const lineHeight = parseLineHeight(hints?.recommended_line_height);
  const sectionFonts = metadata?.suggested_font_size_by_section ?? {};

  const styleVars = [
    `--zone-line-height:${lineHeight}`,
    `--zone-font-family:${metadata?.suggested_font_style === 'sans-serif' ? "'Helvetica Neue', Helvetica, Arial, sans-serif" : "Georgia, 'Times New Roman', serif"}`,
    `--zone-header-size:${parseFontSize(sectionFonts.header, 8.8)}`,
    `--zone-title-size:${parseFontSize(sectionFonts.title, 10.3)}`,
    `--zone-metadata-size:${parseFontSize(sectionFonts.metadata_grid, 8.0)}`,
    `--zone-transcription-size:${parseFontSize(sectionFonts.dense_transcription, 7.8)}`,
    `--zone-lower-size:${parseFontSize(sectionFonts.lower_zones, 7.7)}`,
    `--zone-footer-size:${parseFontSize(sectionFonts.footer_band, 7.0)}`,
    `--zone-margin-size:${parseFontSize(sectionFonts.margin_notes, 6.5)}`,
  ].join(';');

  const headerHtml = renderInlineZones(buckets.header, 'header-inline');
  const titleHtml = renderInlineZones(buckets.title, 'title-inline');
  const metadataHtml = renderMetadataGrid(buckets.metadata);
  const transcriptionHtml = renderTranscription(buckets.transcription);
  const lowerLeftHtml = renderLowerZone('Registry Office', buckets.lowerLeft, 'lower-left-zone');
  const lowerRightHtml = renderLowerZone('Truth / Seal / Charges', buckets.lowerRight, 'lower-right-zone');
  const bottomBandHtml = renderBottomBand(buckets.bottom);
  const otherZonesHtml = buckets.other
    .map((zone) =>
      renderZoneBox(
        zone.zone.zone_id || 'Additional Zone',
        renderParagraphs(zone.content, 'other-zone-line'),
        'other-zone',
      ),
    )
    .join('');

  return `<section class="zone-page spacing-${spacingProfile}" data-page-number="${metadata?.page_number ?? pageIndex + 1}" style="${styleVars}">
  <div class="zone-layout">
    ${renderMarginNotes(buckets.leftMargin, 'left')}
    <div class="zone-main">
      ${headerHtml}
      ${titleHtml}
      ${metadataHtml}
      ${transcriptionHtml}
      <div class="lower-row">
        ${lowerLeftHtml}
        ${lowerRightHtml}
      </div>
      ${otherZonesHtml}
      ${bottomBandHtml}
    </div>
    ${renderMarginNotes(buckets.rightMargin, 'right')}
  </div>
</section>`;
}

function buildCss(orientation: 'portrait' | 'landscape'): string {
  const pageRule =
    orientation === 'landscape'
      ? '@page { size: letter landscape; }'
      : '@page { size: letter portrait; }';

  return `${pageRule}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  color: #0f172a;
}
.document {
  width: 100%;
  padding: 0.01in;
}
.zone-page {
  width: 100%;
  border: 0.8px solid #d9e2ec;
  border-radius: 6px;
  padding: 6px 7px;
  margin: 0 0 4px;
  background: #ffffff;
  break-inside: avoid;
  page-break-inside: avoid;
}
.zone-layout {
  display: grid;
  grid-template-columns: minmax(0.2in, 0.27in) minmax(0, 1fr) minmax(0.2in, 0.27in);
  gap: 4px;
}
.zone-main {
  min-width: 0;
  font-family: var(--zone-font-family);
  line-height: var(--zone-line-height);
}
.inline-zone-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.inline-zone {
  border: 0.7px solid #d8e0ea;
  border-radius: 3px;
  padding: 2px 5px;
  background: #f8fafc;
  font-size: var(--zone-header-size);
}
.title-inline .inline-zone {
  font-size: var(--zone-title-size);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.25px;
  background: #f1f5f9;
}
.zone-box {
  margin-top: 4px;
  border: 0.8px solid #d8e0ea;
  border-radius: 4px;
  padding: 3px 4px;
  background: #ffffff;
}
.zone-box-title {
  margin: 0 0 2px;
  font-size: 7pt;
  text-transform: uppercase;
  letter-spacing: 0.45px;
  color: #334155;
}
.metadata-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
}
.metadata-item {
  border: 0.7px solid #dbe5ef;
  border-radius: 3px;
  padding: 2px 4px;
  background: #fcfdff;
}
.metadata-label {
  display: block;
  font-size: 6.5pt;
  text-transform: uppercase;
  letter-spacing: 0.35px;
  color: #475569;
  font-weight: 700;
}
.metadata-value {
  display: block;
  font-size: var(--zone-metadata-size);
  color: #0f172a;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.transcription-zone-box {
  background: #fbfdff;
}
.transcription-zone-id {
  font-size: 6.4pt;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.35px;
  margin: 0 0 2px;
}
.transcription-paragraph {
  margin: 0 0 2px;
  font-size: var(--zone-transcription-size);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.transcription-paragraph:last-child {
  margin-bottom: 0;
}
.lower-row {
  margin-top: 4px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
}
.lower-zone-line {
  margin: 0 0 2px;
  font-size: var(--zone-lower-size);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.bottom-band {
  margin-top: 4px;
  border: 0.8px solid #d6e0ec;
  border-radius: 4px;
  padding: 2px 4px;
  background: #f8fbff;
}
.bottom-band-line {
  font-size: var(--zone-footer-size);
  line-height: 1.12;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.other-zone-line {
  margin: 0 0 2px;
  font-size: var(--zone-lower-size);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.margin-notes {
  min-height: 100%;
  border: 0.7px dashed #dce5f0;
  border-radius: 3px;
  padding: 2px 1px;
  overflow: hidden;
}
.margin-note-item {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  margin: 0 auto 3px;
  font-size: var(--zone-margin-size);
  line-height: 1.08;
  color: #475569;
  max-height: 100%;
}
.margin-notes.left .margin-note-item {
  transform: rotate(180deg);
}
.spacing-normal .zone-box {
  margin-top: 6px;
  padding: 4px 5px;
}
.spacing-normal .metadata-grid {
  gap: 3px;
}
.spacing-normal .transcription-paragraph {
  margin-bottom: 3px;
}
.page-break {
  break-before: page;
  page-break-before: always;
}
`;
}

function inferBlueprintOrientation(payload: CivilRecordGeneralZoneBlueprint): 'portrait' | 'landscape' {
  if (payload.orientation === 'landscape') return 'landscape';
  const firstPageOrientation = payload.PAGES?.[0]?.PAGE_METADATA?.suggested_orientation;
  return firstPageOrientation === 'landscape' ? 'landscape' : 'portrait';
}

export function renderCivilRecordCompactZoneHtml(
  payload: CivilRecordGeneralZoneBlueprint,
  options: CivilRecordCompactZoneRenderOptions = {},
): string {
  const orientation =
    options.orientation && options.orientation !== 'unknown'
      ? options.orientation
      : inferBlueprintOrientation(payload);

  const pages = payload.PAGES ?? [];

  const htmlPages = pages
    .map((page, index) => `${index > 0 ? '<div class="page-break"></div>' : ''}${renderPage(page, index)}`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(payload.document_subtype || 'Civil Record')}</title>
  <style>${buildCss(orientation)}</style>
</head>
<body>
  <main class="document compact-civil-zone">${htmlPages}</main>
</body>
</html>`;
}
