/**
 * lib/faithfulTextRenderDiagnostics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Diagnostics for the faithful-text (faithful-light) rendering path.
 *
 * Purpose:
 *   Determine whether 1-page source → 2-page translated output is caused by:
 *     - genuine content overflow        (content_overflow)
 *     - template paragraph spacing      (template_spacing_overflow)
 *     - translator note overhead        (translator_note_overflow)
 *     - verbose bracket annotations     (annotation_overflow)
 *     - page-break CSS in the HTML      (css_page_break_overflow)
 *     - the 2.6in overlay-reserved area (overlay_reserved_area_overflow)
 *
 * Key systematic issues identified in the faithful-light pipeline:
 *   1. buildTranslatedPageHtml (standard mode) has NO p { margin } CSS reset.
 *      Browser/Chromium print default applies: margin: 1em 0 = 20px per
 *      paragraph at body font-size 10px. With many paragraphs this adds up
 *      to a full extra page of whitespace.
 *   2. Standard modality now runs a limited parity-recovery profile (L1–L2).
 *      Overflow can still survive that safe profile, but it no longer blocks
 *      the flow; diagnostics should distinguish limited recovery from disabled
 *      recovery when analyzing residual mismatches.
 *
 * Usage:
 *   const metrics = analyzeFaithfulTextHtml(htmlForKit, {
 *     orientation: 'portrait',
 *     layoutHint: 'certificate',
 *     rendererName: 'faithful_light_safeguard',
 *   });
 *   const classification = classifyFaithfulTextExpansion(metrics, sourcePageCount, translatedPageCount);
 *   // Emit as a single structured log line.
 *
 *   // On 1→2 expansion, save HTML snapshot for offline inspection:
 *   await saveFaithfulTextHtmlSnapshot(htmlForKit, orderId, documentId, translatedPageCount);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ── Safe area constants ───────────────────────────────────────────────────────
// Mirror of translatedPageSafeArea.ts values — kept local to avoid a circular
// import. Update here if the safe area changes.

const SAFE_AREA_PORTRAIT = {
  marginTopIn: 1.85,
  marginBottomIn: 0.75,
  marginLeftIn: 1.0,
  marginRightIn: 0.7,
  paperHeightIn: 11,
  paperWidthIn: 8.5,
} as const;

const SAFE_AREA_LANDSCAPE = {
  marginTopIn: 1.85,
  marginBottomIn: 0.75,
  marginLeftIn: 1.0,
  marginRightIn: 0.7,
  paperHeightIn: 8.5,
  paperWidthIn: 11,
} as const;

// ── Body font size used by buildTranslatedPageHtml ─────────────────────────
// Standard layout: body { font-size: 10px }
// Certificate layout: overrides per-element via buildCertificateLayoutCss

const TEMPLATE_BODY_FONT_SIZE_PX = 10;

// Chromium/print: 1in = 96px (CSS px), 1pt = 1.333px
const PX_PER_IN = 96;

// ── Patterns for translator notes ─────────────────────────────────────────────

const TRANSLATOR_NOTE_PATTERNS = [
  /\[translator['']?s?\s+note/i,
  /\[nota do tradutor/i,
  /\[obs(?:erva[cç][aã]o)?:\s/i,
  /\[note:/i,
  /\[translation note/i,
];

// ── Patterns for bracket annotations (stamps, seals, signatures) ─────────────

const ANNOTATION_PATTERNS = [
  /\[(stamp|seal|signature|carimbos?|assinatura|rubrica|logo|barcode|qr\s*code|watermark|emblem)[:\s][^\]]{0,200}\]/gi,
  /\[illegible[^\]]{0,80}\]/gi,
  /\[handwritten[^\]]{0,80}\]/gi,
];

// ── Page-break CSS patterns ───────────────────────────────────────────────────

const PAGE_BREAK_CSS_PATTERNS = [
  /page-break-before\s*:\s*always/i,
  /page-break-after\s*:\s*always/i,
  /break-before\s*:\s*page/i,
  /break-after\s*:\s*page/i,
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type FaithfulLightRendererName =
  | 'faithful_light_safeguard'
  | 'faithful_light_fallback'
  | 'faithful_light_expansion_retry'
  | string;

export type FaithfulLightLayoutHint = 'standard' | 'certificate';

export type FaithfulTextExpansionCause =
  | 'content_overflow'
  | 'template_spacing_overflow'
  | 'translator_note_overflow'
  | 'annotation_overflow'
  | 'css_page_break_overflow'
  | 'overlay_reserved_area_overflow'
  | 'undetermined';

export interface FaithfulTextHtmlMetrics {
  // ── Content metrics
  bodyTextLength: number;
  annotationTextLength: number;
  paragraphCount: number;
  tableCount: number;
  hrCount: number;
  translatorNotePresent: boolean;
  translatorNoteCharCount: number;
  /** Whether any CSS page-break-after:always / break-before:page was found. */
  cssPageBreakPresent: boolean;

  // ── Template / layout
  rendererName: FaithfulLightRendererName;
  layoutHint: FaithfulLightLayoutHint;
  orientation: 'portrait' | 'landscape';

  // ── Safe area (derived from orientation)
  /** Top margin reserved for letterhead overlay (in). */
  reservedTopAreaIn: number;
  /** Bottom margin reserved for footer overlay (in). */
  reservedBottomAreaIn: number;
  /** Usable content height after subtracting safe area margins (in). */
  estimatedUsableHeightIn: number;
  /** Usable content height in CSS pixels at 96 px/in. */
  estimatedUsableHeightPx: number;

  // ── Rendering assumptions for the standard-mode template
  /** Body font-size as set by the template (px). Always 10 for faithful-light. */
  templateBodyFontSizePx: number;
  /**
   * Estimated paragraph vertical height (line + margins) in px.
   *
   * Standard mode: browser default p { margin: 1em 0 } = 10px top + 10px
   *   bottom at font-size 10px. Line height ≈ font × 1.5 = 15px.
   *   Total per paragraph ≈ 10 + 15 + 10 = 35px.
   *
   * Certificate mode: margin: 2.5pt auto ≈ 3.3px × 2 = 6.7px. Line height
   *   1.5 × 9.5pt ≈ 19px. Total ≈ 6.7 + 19 + 6.7 ≈ 32px. (Better.)
   *
   * NOTE: These are estimates. Actual rendering depends on Chromium internals.
   */
  estimatedParagraphHeightPx: number;

  // ── Height estimates
  /** Rough estimate of total rendered content height in pixels. */
  estimatedContentHeightPx: number;
  /** Estimated content height in inches. */
  estimatedContentHeightIn: number;
  /**
   * Estimated number of pages the content would require at the current
   * template settings. May differ from actual Gotenberg output.
   */
  estimatedPageCount: number;

  // ── Key derived ratios
  /** Ratio of annotation text to total body text (0–1). */
  annotationDensityRatio: number;
  /** Estimated overflow beyond usable area (in). Negative = fits on one page. */
  estimatedOverflowIn: number;
  /**
   * Estimated overhead attributable to paragraph spacing gaps alone (in).
   * = paragraphCount × paragraph_margin_px / PX_PER_IN
   */
  estimatedSpacingOverheadIn: number;
}

export interface FaithfulTextExpansionDiagnostic extends FaithfulTextHtmlMetrics {
  orderId: number | string;
  documentId: number | string;
  sourcePageCount: number;
  translatedPageCount: number;
  /** Root cause classification for this 1→N expansion. */
  rootCauseClassification: FaithfulTextExpansionCause;
  /**
   * Secondary cause when the primary is not conclusive or a contributing
   * factor exists alongside the primary.
   */
  secondaryCauseClassification: FaithfulTextExpansionCause | null;
  /**
   * Known systematic issue flags for this render path.
   *   paragraph_margin_reset_missing — standard-mode template has no p { margin }
   *   parity_recovery_limited_profile — modality=standard only uses L1–L2 recovery
   */
  knownSystematicIssues: string[];
  /** Path to the saved HTML snapshot, if captured. */
  htmlSnapshotPath: string | null;
}

// ── HTML analysis ─────────────────────────────────────────────────────────────

/**
 * Strips all HTML tags and decodes common entities to extract raw text.
 */
function extractPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extracts and sums text length for all bracket annotation matches in the HTML.
 */
function measureAnnotationText(html: string): number {
  let total = 0;
  const plainText = extractPlainText(html);
  for (const pattern of ANNOTATION_PATTERNS) {
    const matches = [...plainText.matchAll(pattern)];
    for (const m of matches) {
      total += m[0].length;
    }
  }
  return total;
}

/**
 * Detects translator notes and returns their approximate character count.
 */
function detectTranslatorNotes(html: string): { present: boolean; charCount: number } {
  const plainText = extractPlainText(html);
  let charCount = 0;
  let present = false;
  for (const pattern of TRANSLATOR_NOTE_PATTERNS) {
    const match = pattern.exec(plainText);
    if (match) {
      present = true;
      // Estimate note runs to the next heading or end of sentence (~150 chars)
      const snippet = plainText.slice(match.index, match.index + 200);
      charCount = Math.max(charCount, snippet.length);
    }
  }
  return { present, charCount };
}

/**
 * Analyzes the HTML produced by buildTranslatedPageHtml and returns
 * quantitative metrics used to diagnose 1→N page expansion.
 */
export function analyzeFaithfulTextHtml(
  html: string,
  options: {
    orientation?: 'portrait' | 'landscape';
    layoutHint?: FaithfulLightLayoutHint;
    rendererName?: FaithfulLightRendererName;
  } = {},
): FaithfulTextHtmlMetrics {
  const orientation = options.orientation ?? 'portrait';
  const layoutHint = options.layoutHint ?? 'standard';
  const rendererName = options.rendererName ?? 'unknown';

  const safeArea = orientation === 'landscape' ? SAFE_AREA_LANDSCAPE : SAFE_AREA_PORTRAIT;

  // ── Content extraction ───────────────────────────────────────────────────
  const plainText = extractPlainText(html);
  const bodyTextLength = plainText.length;

  const paragraphCount = (html.match(/<p[\s>]/gi) ?? []).length;
  const tableCount = (html.match(/<table[\s>]/gi) ?? []).length;
  const hrCount = (html.match(/<hr[\s/>]/gi) ?? []).length;

  const annotationTextLength = measureAnnotationText(html);
  const { present: translatorNotePresent, charCount: translatorNoteCharCount } =
    detectTranslatorNotes(html);

  const cssPageBreakPresent = PAGE_BREAK_CSS_PATTERNS.some((p) => p.test(html));

  // ── Safe area geometry ───────────────────────────────────────────────────
  const reservedTopAreaIn = safeArea.marginTopIn;
  const reservedBottomAreaIn = safeArea.marginBottomIn;
  const estimatedUsableHeightIn =
    safeArea.paperHeightIn - reservedTopAreaIn - reservedBottomAreaIn;
  const estimatedUsableHeightPx = estimatedUsableHeightIn * PX_PER_IN;

  // ── Per-paragraph height estimation ─────────────────────────────────────
  // Standard mode: body font-size=10px, no p { margin } CSS reset.
  //   Browser default: margin: 1em 0 = 10px top + 10px bottom.
  //   Line height: 1.5 × 10px = 15px.
  //   Effective per-paragraph height ≈ 10 + 15 + 10 = 35px.
  //
  // Certificate mode: p { margin: 2.5pt auto; font-size: 9.5pt; line-height: 1.5 }
  //   margin ≈ 3.3px top + 3.3px bottom.
  //   Line height: 1.5 × 9.5pt × 1.333px/pt ≈ 19px.
  //   Effective per-paragraph height ≈ 3.3 + 19 + 3.3 ≈ 26px.
  const templateBodyFontSizePx = TEMPLATE_BODY_FONT_SIZE_PX;

  let estimatedParagraphHeightPx: number;
  let estimatedSpacingGapPx: number;

  if (layoutHint === 'certificate') {
    // 2.5pt × 1.333 px/pt × 2 sides + line
    const certFontPx = 9.5 * (4 / 3); // 9.5pt → px
    const certLinePx = certFontPx * 1.5;
    const certMarginPx = 2.5 * (4 / 3) * 2; // both sides
    estimatedParagraphHeightPx = certMarginPx + certLinePx;
    estimatedSpacingGapPx = certMarginPx;
  } else {
    // Standard: browser default p margin
    const lineHeightPx = templateBodyFontSizePx * 1.5;
    const defaultMarginPx = templateBodyFontSizePx * 2; // 1em top + 1em bottom
    estimatedParagraphHeightPx = lineHeightPx + defaultMarginPx;
    estimatedSpacingGapPx = defaultMarginPx;
  }

  // ── Content height estimate ──────────────────────────────────────────────
  // Paragraphs + tables (rough estimate: 50px per table row, assume 3 rows avg)
  const tableEstimatePx = tableCount * 3 * 20; // 20px per row
  const estimatedContentHeightPx =
    paragraphCount * estimatedParagraphHeightPx + tableEstimatePx;
  const estimatedContentHeightIn = estimatedContentHeightPx / PX_PER_IN;
  const estimatedPageCount = Math.ceil(
    estimatedContentHeightPx / estimatedUsableHeightPx,
  );

  // ── Key ratios ───────────────────────────────────────────────────────────
  const annotationDensityRatio =
    bodyTextLength > 0 ? annotationTextLength / bodyTextLength : 0;

  const estimatedOverflowIn = estimatedContentHeightIn - estimatedUsableHeightIn;

  const estimatedSpacingOverheadIn =
    (paragraphCount * estimatedSpacingGapPx) / PX_PER_IN;

  return {
    bodyTextLength,
    annotationTextLength,
    paragraphCount,
    tableCount,
    hrCount,
    translatorNotePresent,
    translatorNoteCharCount,
    cssPageBreakPresent,
    rendererName,
    layoutHint,
    orientation,
    reservedTopAreaIn,
    reservedBottomAreaIn,
    estimatedUsableHeightIn,
    estimatedUsableHeightPx,
    templateBodyFontSizePx,
    estimatedParagraphHeightPx,
    estimatedContentHeightPx,
    estimatedContentHeightIn,
    estimatedPageCount,
    annotationDensityRatio,
    estimatedOverflowIn,
    estimatedSpacingOverheadIn,
  };
}

// ── Root-cause classification ─────────────────────────────────────────────────

/**
 * Classifies the most likely root cause of a 1→N page expansion in the
 * faithful-text rendering path.
 *
 * Classification heuristics (evaluated in priority order):
 *
 *  1. css_page_break_overflow     — explicit page-break CSS detected
 *  2. translator_note_overflow    — translator note present AND note is large
 *  3. annotation_overflow         — bracket annotations are > 15% of body text
 *  4. overlay_reserved_area_overflow
 *                                 — content fits without safe area margins but
 *                                   not within the 8.4in usable zone
 *  5. template_spacing_overflow   — paragraph spacing alone accounts for > 1in
 *                                   of the estimated overflow (standard mode)
 *  6. content_overflow            — the text itself is the primary driver
 *  7. undetermined                — metrics are inconclusive
 */
export function classifyFaithfulTextExpansion(
  metrics: FaithfulTextHtmlMetrics,
  sourcePageCount: number,
  translatedPageCount: number,
): { primary: FaithfulTextExpansionCause; secondary: FaithfulTextExpansionCause | null } {
  const causes: FaithfulTextExpansionCause[] = [];

  if (metrics.cssPageBreakPresent) {
    causes.push('css_page_break_overflow');
  }

  if (metrics.translatorNotePresent && metrics.translatorNoteCharCount > 80) {
    causes.push('translator_note_overflow');
  }

  if (metrics.annotationDensityRatio > 0.15) {
    causes.push('annotation_overflow');
  }

  // Overlay reserved area: if content would fit without the 2.6in reserved
  // top+bottom margin — i.e., content height < full page height.
  const safeArea =
    metrics.orientation === 'landscape' ? SAFE_AREA_LANDSCAPE : SAFE_AREA_PORTRAIT;
  const fullPageHeightIn = safeArea.paperHeightIn;
  if (
    metrics.estimatedContentHeightIn < fullPageHeightIn &&
    metrics.estimatedContentHeightIn > metrics.estimatedUsableHeightIn
  ) {
    causes.push('overlay_reserved_area_overflow');
  }

  // Template spacing: paragraph margins alone account for > 0.5in of overflow
  // in standard mode (where browser default margins apply).
  if (
    metrics.layoutHint === 'standard' &&
    metrics.estimatedSpacingOverheadIn > 0.5 &&
    metrics.estimatedOverflowIn > 0
  ) {
    causes.push('template_spacing_overflow');
  }

  if (causes.length === 0) {
    // Fallback: if content height clearly exceeds usable area
    if (metrics.estimatedOverflowIn > 0) {
      causes.push('content_overflow');
    } else {
      causes.push('undetermined');
    }
  } else if (!causes.includes('content_overflow') && metrics.estimatedOverflowIn > 0) {
    // Content is also a contributing factor
    causes.push('content_overflow');
  }

  const primary = causes[0];
  const secondary = causes.length > 1 ? causes[1] : null;
  return { primary, secondary };
}

// ── HTML snapshot capture ─────────────────────────────────────────────────────

const SNAPSHOT_DIR = join(process.cwd(), '.artifacts', 'faithful-text-snapshots');

/**
 * Saves the faithful-text HTML to disk for offline inspection.
 * Only called when sourcePageCount === 1 and translatedPageCount > 1.
 *
 * Written to:
 *   .artifacts/faithful-text-snapshots/
 *     order-{orderId}-doc-{docId}-{timestamp}-{renderer}.html
 *
 * Returns the absolute path, or null if the write failed.
 */
export function saveFaithfulTextHtmlSnapshot(
  html: string,
  orderId: number | string,
  documentId: number | string,
  translatedPageCount: number,
  rendererName: string,
): string | null {
  try {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeRenderer = rendererName.replace(/[^a-z0-9_-]/gi, '_');
    const filename = `order-${orderId}-doc-${documentId}-${timestamp}-${safeRenderer}-1to${translatedPageCount}.html`;
    const filePath = join(SNAPSHOT_DIR, filename);
    writeFileSync(filePath, html, 'utf8');
    return filePath;
  } catch {
    return null;
  }
}

// ── Composite diagnostic builder ──────────────────────────────────────────────

/**
 * Builds and emits a single structured log line covering all faithful-text
 * render diagnostic dimensions for a single document render attempt.
 *
 * Call this after the kit buffer result is available (so translatedPageCount
 * is known). Pass translatedPageCount=null if the render failed before
 * a page count could be obtained.
 *
 * The log line is tagged `faithful_text_render_diagnostic` for easy filtering.
 */
export function emitFaithfulTextRenderDiagnostic(
  logPrefix: string,
  params: {
    orderId: number | string;
    documentId: number | string;
    documentType: string;
    modality: string;
    sourcePageCount: number | null | undefined;
    translatedPageCount: number | null | undefined;
    htmlMetrics: FaithfulTextHtmlMetrics;
    htmlSnapshotPath: string | null;
    knownSystematicIssues: string[];
    rootCauseClassification: FaithfulTextExpansionCause;
    secondaryCauseClassification: FaithfulTextExpansionCause | null;
  },
): void {
  const {
    orderId,
    documentId,
    documentType,
    modality,
    sourcePageCount,
    translatedPageCount,
    htmlMetrics,
    htmlSnapshotPath,
    knownSystematicIssues,
    rootCauseClassification,
    secondaryCauseClassification,
  } = params;

  const isExpansion =
    typeof sourcePageCount === 'number' &&
    typeof translatedPageCount === 'number' &&
    translatedPageCount > sourcePageCount;

  console.log(
    `${logPrefix} — faithful_text_render_diagnostic: ` +
    `orderId=${orderId} ` +
    `docId=${documentId} ` +
    `documentType=${documentType} ` +
    `modality=${modality} ` +
    `sourcePageCount=${sourcePageCount ?? 'n/a'} ` +
    `translatedPageCount=${translatedPageCount ?? 'n/a'} ` +
    `isExpansion=${isExpansion} ` +
    // ── HTML content metrics
    `bodyTextLength=${htmlMetrics.bodyTextLength} ` +
    `paragraphCount=${htmlMetrics.paragraphCount} ` +
    `tableCount=${htmlMetrics.tableCount} ` +
    `hrCount=${htmlMetrics.hrCount} ` +
    `annotationTextLength=${htmlMetrics.annotationTextLength} ` +
    `annotationDensityRatio=${htmlMetrics.annotationDensityRatio.toFixed(3)} ` +
    `translatorNotePresent=${htmlMetrics.translatorNotePresent} ` +
    `translatorNoteCharCount=${htmlMetrics.translatorNoteCharCount} ` +
    `cssPageBreakPresent=${htmlMetrics.cssPageBreakPresent} ` +
    // ── Template / layout
    `rendererName=${htmlMetrics.rendererName} ` +
    `layoutHint=${htmlMetrics.layoutHint} ` +
    `orientation=${htmlMetrics.orientation} ` +
    `templateBodyFontSizePx=${htmlMetrics.templateBodyFontSizePx} ` +
    `estimatedParagraphHeightPx=${htmlMetrics.estimatedParagraphHeightPx.toFixed(1)} ` +
    // ── Safe area / geometry
    `reservedTopAreaIn=${htmlMetrics.reservedTopAreaIn} ` +
    `reservedBottomAreaIn=${htmlMetrics.reservedBottomAreaIn} ` +
    `estimatedUsableHeightIn=${htmlMetrics.estimatedUsableHeightIn.toFixed(2)} ` +
    `estimatedUsableHeightPx=${htmlMetrics.estimatedUsableHeightPx.toFixed(0)} ` +
    // ── Height estimates
    `estimatedContentHeightPx=${htmlMetrics.estimatedContentHeightPx.toFixed(0)} ` +
    `estimatedContentHeightIn=${htmlMetrics.estimatedContentHeightIn.toFixed(2)} ` +
    `estimatedPageCount=${htmlMetrics.estimatedPageCount} ` +
    `estimatedOverflowIn=${htmlMetrics.estimatedOverflowIn.toFixed(2)} ` +
    `estimatedSpacingOverheadIn=${htmlMetrics.estimatedSpacingOverheadIn.toFixed(2)} ` +
    // ── Classification
    `rootCauseClassification=${rootCauseClassification} ` +
    `secondaryCauseClassification=${secondaryCauseClassification ?? 'none'} ` +
    `knownSystematicIssues=[${knownSystematicIssues.join(',')}] ` +
    `htmlSnapshotPath=${htmlSnapshotPath ?? 'none'}`,
  );
}

// ── Convenience wrapper ───────────────────────────────────────────────────────

/**
 * Full analysis → classify → snapshot → log, in one call.
 *
 * Call this in generateDeliveryKit.ts after htmlForKit is built and after
 * the kit build result is available. Pass translatedPageCount=null if the
 * build failed before a page count was determined.
 */
export function runFaithfulTextDiagnostics(
  logPrefix: string,
  params: {
    orderId: number | string;
    documentId: number | string;
    documentType: string;
    modality: string;
    sourcePageCount: number | null | undefined;
    translatedPageCount: number | null | undefined;
    htmlForKit: string;
    orientation: 'portrait' | 'landscape';
    layoutHint: FaithfulLightLayoutHint;
    rendererName: FaithfulLightRendererName;
  },
): FaithfulTextHtmlMetrics {
  const {
    orderId,
    documentId,
    documentType,
    modality,
    sourcePageCount,
    translatedPageCount,
    htmlForKit,
    orientation,
    layoutHint,
    rendererName,
  } = params;

  const htmlMetrics = analyzeFaithfulTextHtml(htmlForKit, {
    orientation,
    layoutHint,
    rendererName,
  });

  const isExpansion =
    typeof sourcePageCount === 'number' &&
    typeof translatedPageCount === 'number' &&
    translatedPageCount > sourcePageCount;

  // Root-cause classification only runs when we have an actual expansion to analyze.
  let rootCause: FaithfulTextExpansionCause = 'undetermined';
  let secondaryCause: FaithfulTextExpansionCause | null = null;
  if (isExpansion && typeof sourcePageCount === 'number' && typeof translatedPageCount === 'number') {
    const classification = classifyFaithfulTextExpansion(htmlMetrics, sourcePageCount, translatedPageCount);
    rootCause = classification.primary;
    secondaryCause = classification.secondary;
  }

  // Systematic issues: always flag for faithful-light renders.
  const knownSystematicIssues: string[] = [];
  if (layoutHint === 'standard') {
    knownSystematicIssues.push('paragraph_margin_reset_missing');
  }
  if (modality === 'standard') {
    knownSystematicIssues.push('parity_recovery_limited_profile');
  }

  // HTML snapshot: save when source=1 and translated > 1.
  let htmlSnapshotPath: string | null = null;
  if (
    sourcePageCount === 1 &&
    typeof translatedPageCount === 'number' &&
    translatedPageCount > 1
  ) {
    htmlSnapshotPath = saveFaithfulTextHtmlSnapshot(
      htmlForKit,
      orderId,
      documentId,
      translatedPageCount,
      rendererName,
    );
  }

  emitFaithfulTextRenderDiagnostic(logPrefix, {
    orderId,
    documentId,
    documentType,
    modality,
    sourcePageCount,
    translatedPageCount,
    htmlMetrics,
    htmlSnapshotPath,
    knownSystematicIssues,
    rootCauseClassification: rootCause,
    secondaryCauseClassification: secondaryCause,
  });

  return htmlMetrics;
}
