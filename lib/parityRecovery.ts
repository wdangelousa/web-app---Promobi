/**
 * lib/parityRecovery.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Parity-recovery ladder for translated preview / delivery HTML renders.
 *
 * When a translated PDF has more pages than the source, this module provides
 * a deterministic sequence of CSS/HTML transforms that attempt to compress
 * the output back to the source page count without degrading documentary
 * meaning.
 *
 * Recovery ladder (each level is additive):
 *   Level 1 — safe reflow          tighten spacing, reduce cell padding,
 *                                   remove consecutive blank lines
 *   Level 2 — typographic compress reduce font size within safe minimums,
 *                                   compress column padding
 *   Level 3 — annotation compaction shorten verbose bracketed non-text
 *                                   descriptions (stamps, seals, signatures)
 *   Level 4 — aggressive reflow    maximum CSS compaction within safe bounds,
 *                                   last resort before terminal failure
 *
 * Recovery profiles:
 *   standard_recovery — best-effort overflow handling for standard modality.
 *                       Attempts Levels 1–2 only and does NOT block when the
 *                       output still overflows after those safe transforms.
 *   faithful_recovery — strict overflow handling for faithful modality.
 *                       Attempts Levels 1–4 and blocks on terminal failure.
 *
 * Modality contract:
 *   'standard'     — parity recovery IS activated in best-effort mode
 *                    (Levels 1–2 only, non-blocking on failure).
 *   'faithful'     — parity recovery IS activated in strict mode
 *                    (Levels 1–4, terminal failure remains blocking).
 *   'external_pdf' — parity is handled upstream; this module is not invoked.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum font size (px) permitted during typographic compression (Level 2). */
export const PARITY_MIN_FONT_SIZE_PX = 8;

/**
 * Maximum number of recovery levels available.
 * Faithful recovery uses the full ladder. Standard recovery uses the capped
 * profile defined in `PARITY_RECOVERY_PROFILE_MAX_LEVEL.standard_recovery`.
 */
export const PARITY_MAX_RECOVERY_LEVEL = 4;

export const PARITY_RECOVERY_PROFILE_MAX_LEVEL = {
  standard_recovery: 2,
  faithful_recovery: PARITY_MAX_RECOVERY_LEVEL,
} as const;

/** Minimum line-height permitted at the most aggressive recovery level (Level 4). */
export const PARITY_MIN_LINE_HEIGHT = 1.05;

/** Minimum table/cell padding (px) permitted at the most aggressive recovery level (Level 4). */
export const PARITY_MIN_CELL_PADDING_PX = 1;

/**
 * Minimum character count for a bracket annotation's inner text to be eligible
 * for compaction by `compactAnnotations` in aggressive mode (dense profile / L3
 * recovery). Shorter brackets are always left unchanged regardless of content.
 */
export const PARITY_MAX_ANNOTATION_INNER_LENGTH = 20;

/**
 * Minimum character count for compact-mode annotation pre-compaction.
 * Higher than `PARITY_MAX_ANNOTATION_INNER_LENGTH` so that only the most
 * verbose bracket annotations are collapsed in the compact initial render
 * profile — moderately verbose descriptions are preserved at this tier.
 */
export const COMPACT_ANNOTATION_COMPACTION_THRESHOLD = 35;

/**
 * Prompt note appended to faithful-recovery prompts only.
 * Standard recovery remains best-effort and relies on the safe L1–L2 ladder
 * instead of extra prompt pressure because overflow does not block that mode.
 */
export const FAITHFUL_PARITY_PROMPT_NOTE = `
LAYOUT CONSTRAINT — PAGE COUNT PRESERVATION:
This document must fit within the same number of pages as the original.
To help achieve this:
- Keep translated labels concise; prefer short equivalents when meaning is fully preserved.
- Shorten bracketed non-text descriptions: use [Stamp], [Seal], [Signature], [Initial],
  [Fingerprint], [Photo], [Barcode], or [Illegible] instead of verbose descriptions.
- Do not turn annotations into explanatory prose.
- Avoid unnecessary expansion of abbreviations, acronyms, or proper nouns.
- Preserve all legally relevant textual content without omission.
`.trim();

// ── Types ─────────────────────────────────────────────────────────────────────

export type ParityRecoveryLevel = 1 | 2 | 3 | 4;
export type ParityRecoveryProfile =
  | keyof typeof PARITY_RECOVERY_PROFILE_MAX_LEVEL;

/**
 * Controls how aggressively bracket annotations are pre-compacted in the
 * initial render profile before the first Gotenberg pass.
 *
 *   none        — no pre-compaction (balanced profile)
 *   moderate    — compact only very verbose annotations (> COMPACT_ANNOTATION_COMPACTION_THRESHOLD chars)
 *   aggressive  — compact all annotations above PARITY_MAX_ANNOTATION_INNER_LENGTH chars (dense profile)
 */
export type AnnotationCompactionMode = 'none' | 'moderate' | 'aggressive';

/**
 * Render quality tier assigned after a parity recovery run.
 *
 *   high               — first render achieved parity, or only L1 safe-reflow was needed.
 *   acceptable         — L2 or L3 recovery resolved parity without flagged risk combinations.
 *   review_recommended — terminal failure, or risk combination present (dense+L3/L4,
 *                        fallback+aggressive, or sensitive family+aggressive compression).
 */
export type RenderQualityTier = 'high' | 'acceptable' | 'review_recommended';

/**
 * Document families where aggressive compression or terminal failure warrants
 * a review recommendation, due to the legal significance of every rendered character.
 */
export const SENSITIVE_DOCUMENT_FAMILIES: readonly string[] = [
  'civil_records',
  'uscis_dos_forms_notices',
  'identity_travel',
  'investment_source_of_funds',
] as const;

/**
 * Semantic outcome label for a parity recovery run.
 * Emitted in logs and structured diagnostics to support monitoring and alerting.
 *
 *   parity_resolved_light      — Level 1 (safe reflow only)
 *   parity_resolved_moderate   — Level 2 or 3 (typographic compression / annotation compaction)
 *   parity_resolved_aggressive — Level 4 (maximum CSS compaction)
 *   parity_failed_terminal     — All levels exhausted; parity not achieved
 */
export type ParityResolutionLabel =
  | 'parity_resolved_light'
  | 'parity_resolved_moderate'
  | 'parity_resolved_aggressive'
  | 'parity_failed_terminal';

export interface ParityRecoveryAttempt {
  level: ParityRecoveryLevel;
  sourcePageCount: number;
  translatedPageCountBefore: number;
  /** null when the Gotenberg call for this level failed. */
  translatedPageCountAfter: number | null;
  resolved: boolean;
}

export interface ParityRecoveryDiagnostics {
  sourcePageCount: number;
  initialTranslatedPageCount: number;
  finalTranslatedPageCount: number;
  overflowPagesInitial: number;
  attempts: ParityRecoveryAttempt[];
  parityResolved: boolean;
  recoveryLevelUsed: ParityRecoveryLevel | null;
  /** Semantic resolution label for structured logging and alerting. */
  resolutionLabel: ParityResolutionLabel;
}

export interface PageLayoutBudget {
  orientation: 'portrait' | 'landscape';
  paperWidthIn: number;
  paperHeightIn: number;
  marginTopIn: number;
  marginRightIn: number;
  marginBottomIn: number;
  marginLeftIn: number;
  usableWidthIn: number;
  usableHeightIn: number;
  /** Estimated usable height per source page (usableHeightIn / sourcePageCount). */
  usableHeightPerSourcePageIn: number;
}

/**
 * Pre-render layout hints derived from a page layout budget.
 *
 * Passed to structured renderers as a Phase 2 preparation step — used by
 * `buildInitialRenderProfile` to select a density-driven baseline CSS profile
 * (balanced / compact / dense) that is applied before the first Gotenberg render.
 * Reduces reliance on the !important recovery ladder by pre-optimising layout.
 *
 * Hint values are 3-tier, aligned with `buildInitialRenderProfile` thresholds:
 *   dense tier   (usableHeightPerSourcePageIn < 3.0 in)
 *   compact tier (3.0–5.5 in)
 *   balanced tier (≥ 5.5 in)
 */
export interface PreRenderLayoutHints {
  /** Budget derived from source page count and orientation. */
  budget: PageLayoutBudget;
  /**
   * Suggested initial font size for body text (px).
   * Computed from budget density; renderers may use this as a starting point.
   */
  suggestedFontSizePx: number;
  /** Suggested initial line-height for body text. */
  suggestedLineHeight: number;
  /** Suggested table cell padding (px). */
  suggestedCellPaddingPx: number;
}

// ── Page layout budget ────────────────────────────────────────────────────────

/**
 * Computes a per-page usable area budget from the source page count and the
 * known translated safe-area margins. Used to guide layout decisions and log
 * estimated overflow during parity recovery diagnostics.
 */
export function buildPageLayoutBudget(
  sourcePageCount: number,
  orientation: 'portrait' | 'landscape',
): PageLayoutBudget {
  const isLandscape = orientation === 'landscape';
  const paperWidthIn = isLandscape ? 11 : 8.5;
  const paperHeightIn = isLandscape ? 8.5 : 11;
  const marginTopIn = 1.85;
  const marginRightIn = 0.7;
  const marginBottomIn = 0.75;
  const marginLeftIn = 1.0;
  const usableWidthIn = paperWidthIn - marginLeftIn - marginRightIn;
  const usableHeightIn = paperHeightIn - marginTopIn - marginBottomIn;
  const count = sourcePageCount > 0 ? sourcePageCount : 1;
  return {
    orientation,
    paperWidthIn,
    paperHeightIn,
    marginTopIn,
    marginRightIn,
    marginBottomIn,
    marginLeftIn,
    usableWidthIn,
    usableHeightIn,
    usableHeightPerSourcePageIn: usableHeightIn / count,
  };
}

// ── CSS recovery generators ───────────────────────────────────────────────────

/**
 * Level 1: Safe reflow.
 * Tightens paragraph and list spacing, reduces table cell padding, removes
 * consecutive blank lines. Preserves font size and visual identity.
 */
function buildLevel1RecoveryCss(): string {
  return `<style id="parity-recovery-l1">
/* parity recovery — level 1: safe reflow */
p { margin-top: 0.15em !important; margin-bottom: 0.15em !important; }
li { margin-top: 0.05em !important; margin-bottom: 0.05em !important; }
br + br { display: none !important; }
td, th { padding: 2px 3px !important; }
table { margin-top: 2px !important; margin-bottom: 2px !important; }
.section, [class*="section"] { margin-bottom: 4px !important; }
h1, h2, h3, h4 { margin-top: 4px !important; margin-bottom: 2px !important; }
body { line-height: 1.2 !important; }
</style>`;
}

/**
 * Level 2: Safe typographic compression.
 * Reduces font size within the configured minimum, compresses column padding
 * further. Applied in addition to Level 1.
 */
function buildLevel2RecoveryCss(): string {
  const sz = PARITY_MIN_FONT_SIZE_PX + 1;
  return `<style id="parity-recovery-l2">
/* parity recovery — level 2: typographic compression */
body { font-size: ${sz}px !important; line-height: 1.15 !important; }
td, th { font-size: ${sz}px !important; padding: 1px 2px !important; }
p, li, span { font-size: ${sz}px !important; }
.header-titulos h1 { font-size: 13px !important; }
.header-titulos p { font-size: 10px !important; }
</style>`;
}

/**
 * Level 4: Aggressive reflow.
 * Maximum CSS compaction within safe bounds. Applied in addition to Levels 1–3.
 * Uses PARITY_MIN_FONT_SIZE_PX, PARITY_MIN_LINE_HEIGHT, and
 * PARITY_MIN_CELL_PADDING_PX constants to enforce safety floors.
 */
function buildLevel4RecoveryCss(): string {
  const sz = PARITY_MIN_FONT_SIZE_PX;
  const lh = PARITY_MIN_LINE_HEIGHT;
  const cp = PARITY_MIN_CELL_PADDING_PX;
  return `<style id="parity-recovery-l4">
/* parity recovery — level 4: aggressive reflow */
body { font-size: ${sz}px !important; line-height: ${lh} !important; }
td, th { font-size: ${sz}px !important; padding: ${cp}px !important; }
p { margin: 0 !important; }
h1, h2, h3, h4 { margin: 1px 0 !important; }
.section, [class*="section"] { margin: 0 0 2px 0 !important; }
table { margin: 0 !important; }
</style>`;
}

// ── Annotation compaction (Level 3 HTML transform) ────────────────────────────

/**
 * Shortens verbose bracketed non-text descriptions (stamps, seals, signatures)
 * to their compact canonical form. Preserves informational meaning while
 * significantly reducing verbosity.
 *
 * Only patterns that are unambiguously non-text annotations are collapsed.
 * Unknown bracket content is left unchanged to avoid losing legal information.
 *
 * Examples:
 *   [Circular Stamp of the Civil Registry Office of São Paulo] → [Stamp]
 *   [Official Seal of the Federal Notary]                     → [Seal]
 *   [Handwritten Signature of the Registrar]                  → [Signature]
 *   [Illegible Handwriting]                                    → [Illegible]
 */
export function compactAnnotations(
  html: string,
  threshold: number = PARITY_MAX_ANNOTATION_INNER_LENGTH,
): string {
  // Threshold defaults to PARITY_MAX_ANNOTATION_INNER_LENGTH for aggressive mode.
  // Pass COMPACT_ANNOTATION_COMPACTION_THRESHOLD for moderate (compact profile) mode.
  const minLen = threshold;
  return html.replace(new RegExp(`\\[([^\\]]{${minLen},})\\]`, 'g'), (_match, inner: string) => {
    const n = inner.toLowerCase();
    if (/stamp|carimbo/.test(n)) return '[Stamp]';
    if (/seal|sinete|lacre/.test(n)) return '[Seal]';
    if (/signature|assinatura/.test(n)) return '[Signature]';
    if (/initial|rubrica/.test(n)) return '[Initial]';
    if (/illegible|ilegível|ilegivel/.test(n)) return '[Illegible]';
    if (/notary|tabelião|tabeliao/.test(n)) return '[Notary]';
    if (/fingerprint|digital|impressão/.test(n)) return '[Fingerprint]';
    if (/\bphoto\b|\bfoto\b/.test(n)) return '[Photo]';
    if (/barcode|código de barras|qr/.test(n)) return '[Barcode]';
    // Unknown bracket content — leave unchanged.
    return _match;
  });
}

// ── Recovery outcome helpers ──────────────────────────────────────────────────

/**
 * Maps a recovery level (or null for terminal failure) to its semantic label.
 * Used for structured logging and monitoring.
 *
 *   1    → parity_resolved_light      (safe reflow)
 *   2–3  → parity_resolved_moderate   (typographic compression or annotation compaction)
 *   4    → parity_resolved_aggressive (aggressive reflow)
 *   null → parity_failed_terminal     (all levels exhausted)
 */
export function resolveParityLabel(level: ParityRecoveryLevel | null): ParityResolutionLabel {
  if (level === null) return 'parity_failed_terminal';
  if (level === 1) return 'parity_resolved_light';
  if (level === 2 || level === 3) return 'parity_resolved_moderate';
  return 'parity_resolved_aggressive';
}

/**
 * Returns true when the translated page count is fewer than the source page
 * count.
 *
 * Underflow indicates over-compaction or a translation that omitted content.
 * It is not remediated by the recovery ladder (which targets overflow only)
 * but is detected and logged for diagnostic and monitoring purposes.
 */
export function isParityUnderflow(
  translatedPageCount: number,
  sourcePageCount: number | undefined,
  _modality: string,
): boolean {
  if (!sourcePageCount || sourcePageCount <= 0) return false;
  return translatedPageCount < sourcePageCount;
}

/**
 * Derives pre-render layout hints from a page layout budget.
 *
 * Uses the same three-tier density thresholds as `buildInitialRenderProfile`
 * so the hint values are semantically consistent with the selected profile:
 *
 *   dense tier   (usableHeightPerSourcePageIn < 3.0 in) — very little space per
 *                source page; tightest typography suggestions.
 *   compact tier (3.0 – 5.5 in) — moderate density; moderately compressed hints.
 *   balanced tier (≥ 5.5 in)   — ample space; standard typography suggestions.
 *
 * "Usable height per source page" decreases as page count increases for a fixed
 * paper size: 1 portrait page ≈ 8.4 in (balanced), 2 pages ≈ 4.2 in (compact),
 * 3+ pages ≈ 2.8 in or lower (dense). A lower value signals higher page pressure.
 */
export function buildPreRenderLayoutHints(budget: PageLayoutBudget): PreRenderLayoutHints {
  const h = budget.usableHeightPerSourcePageIn;
  if (h < 3.0) {
    return { budget, suggestedFontSizePx: 10, suggestedLineHeight: 1.2, suggestedCellPaddingPx: 2 };
  }
  if (h < 5.5) {
    return { budget, suggestedFontSizePx: 10, suggestedLineHeight: 1.3, suggestedCellPaddingPx: 3 };
  }
  return { budget, suggestedFontSizePx: 11, suggestedLineHeight: 1.4, suggestedCellPaddingPx: 3 };
}

// ── Initial render profile (Phase 2) ─────────────────────────────────────────

/**
 * Profile names for the first-render layout strategy.
 *
 *   balanced — standard layout; ample vertical space per source page (≥ 5.5 in).
 *   compact  — moderately compressed; medium density (3.0–5.5 in/page).
 *   dense    — tightest safe layout; very little space per page (< 3.0 in).
 *              Also pre-compacts bracket annotations before first render.
 */
export type InitialRenderProfileName = 'balanced' | 'compact' | 'dense';

/**
 * Concrete layout parameters derived from a page layout budget.
 *
 * Applied to the HTML before the first Gotenberg render, reducing the
 * likelihood of parity overflow without relying on post-render recovery.
 *
 * All values are intentionally above the Phase 1 safety floors:
 *   fontSizePx    > PARITY_MIN_FONT_SIZE_PX   (8 px)
 *   lineHeight    > PARITY_MIN_LINE_HEIGHT     (1.05)
 *   cellPaddingPx > PARITY_MIN_CELL_PADDING_PX (1 px)
 *
 * The Phase 1 recovery ladder may compress further if the first render
 * still overflows after the profile is applied.
 */
export interface InitialRenderProfile {
  /** Profile name used for diagnostics and logging. */
  name: InitialRenderProfileName;
  /** Initial body and table font size (px). */
  fontSizePx: number;
  /** Initial body line-height. */
  lineHeight: number;
  /** Initial table cell padding (px). */
  cellPaddingPx: number;
  /** Initial paragraph bottom margin (em). */
  paraMarginBottomEm: number;
  /**
   * Table top/bottom margin (px). Reduced before shrinking core text so that
   * table spacing is compacted first in block-aware shaping.
   */
  tableMarginPx: number;
  /**
   * Font size (px) for annotation blocks (.annotation, [data-block="annotation"]).
   * Annotations are shaped more aggressively than core legal text because they
   * carry secondary rather than primary informational content.
   */
  annotationFontSizePx: number;
  /**
   * Font size (px) for captions, figcaptions, and field labels.
   * Reduced before shrinking core body text.
   */
  captionFontSizePx: number;
  /**
   * Annotation pre-compaction policy for the initial render pass.
   * Determines how aggressively verbose bracket annotations are shortened
   * before the first Gotenberg render to reclaim vertical space.
   *
   *   none       — balanced profile; no pre-compaction.
   *   moderate   — compact profile; only annotations > COMPACT_ANNOTATION_COMPACTION_THRESHOLD
   *                chars are shortened. Reclaims space when annotation verbosity
   *                alone is likely to cause overflow.
   *   aggressive — dense profile; all annotations > PARITY_MAX_ANNOTATION_INNER_LENGTH
   *                chars are shortened, matching the L3 recovery behavior.
   */
  annotationCompactionMode: AnnotationCompactionMode;
  /**
   * @deprecated Use `annotationCompactionMode !== 'none'` instead.
   * Retained for backward compatibility with existing log assertions.
   * True when any pre-compaction is applied (mode is 'moderate' or 'aggressive').
   */
  preCompactAnnotations: boolean;
}

/**
 * Selects the initial render profile from pre-render layout hints.
 *
 * Selection thresholds (usable height per source page):
 *   < 3.0 in → dense   (very little space; applies annotation compaction)
 *   < 5.5 in → compact (moderate space; tighter typography)
 *   ≥ 5.5 in → balanced (ample space; standard typography)
 */
export function buildInitialRenderProfile(hints: PreRenderLayoutHints): InitialRenderProfile {
  const h = hints.budget.usableHeightPerSourcePageIn;
  if (h < 3.0) {
    return {
      name: 'dense',
      fontSizePx: 10,
      lineHeight: 1.2,
      cellPaddingPx: 2,
      paraMarginBottomEm: 0.1,
      tableMarginPx: 1,
      annotationFontSizePx: 9,
      captionFontSizePx: 9,
      annotationCompactionMode: 'aggressive',
      preCompactAnnotations: true,
    };
  }
  if (h < 5.5) {
    return {
      name: 'compact',
      fontSizePx: 10,
      lineHeight: 1.3,
      cellPaddingPx: 3,
      paraMarginBottomEm: 0.2,
      tableMarginPx: 2,
      annotationFontSizePx: 9,
      captionFontSizePx: 10,
      annotationCompactionMode: 'moderate',
      preCompactAnnotations: true,
    };
  }
  return {
    name: 'balanced',
    fontSizePx: 11,
    lineHeight: 1.4,
    cellPaddingPx: 4,
    paraMarginBottomEm: 0.25,
    tableMarginPx: 4,
    annotationFontSizePx: 11,
    captionFontSizePx: 11,
    annotationCompactionMode: 'none',
    preCompactAnnotations: false,
  };
}

/**
 * Generates the `<style>` block for the initial render profile.
 *
 * Does NOT use `!important` — sets a baseline that the Phase 1 recovery
 * ladder (which does use `!important`) can override if recovery is needed.
 *
 * Block shaping order (most to least aggressive reduction):
 *   1. Annotations (.annotation, [data-block="annotation"]) — secondary content;
 *      shaped most aggressively to preserve space for core legal text.
 *   2. Table padding and margin — structural overhead reduced before font size.
 *   3. Captions, figcaptions, labels — reduced before core body text.
 *   4. Core body text (p, li) — protected; font size reduced only as a last resort.
 */
function buildInitialRenderProfileCss(profile: InitialRenderProfile): string {
  return `<style id="initial-render-profile" data-profile="${profile.name}">
/* Phase 2 initial render profile: ${profile.name} */
/* Core body — protected from aggressive compression; font and spacing shaped last */
body { font-size: ${profile.fontSizePx}px; line-height: ${profile.lineHeight}; }
p { margin-bottom: ${profile.paraMarginBottomEm}em; }
/* Table shaping — padding and margin reduced before shrinking core text */
td, th { font-size: ${profile.fontSizePx}px; padding: ${profile.cellPaddingPx}px; }
table { margin-top: ${profile.tableMarginPx}px; margin-bottom: ${profile.tableMarginPx}px; }
/* Annotation shaping — annotations are shaped most aggressively as secondary content */
.annotation, [data-block="annotation"] { font-size: ${profile.annotationFontSizePx}px; line-height: 1.2; }
/* Caption and label shaping — reduced before core body text */
caption, figcaption, .caption, .label, .field-label { font-size: ${profile.captionFontSizePx}px; }
</style>`;
}

/**
 * Applies the initial render profile to HTML before the first Gotenberg render.
 *
 * Injects a block-aware CSS `<style>` block before `</head>` (or prepends it if
 * no `<head>` is found). Then applies annotation pre-compaction according to the
 * profile's `annotationCompactionMode`:
 *
 *   none       — no pre-compaction (balanced profile).
 *   moderate   — compact only very verbose annotations (> COMPACT_ANNOTATION_COMPACTION_THRESHOLD
 *                chars) to reclaim space when annotation verbosity alone risks overflow.
 *   aggressive — compact all annotations above PARITY_MAX_ANNOTATION_INNER_LENGTH chars,
 *                matching L3 recovery behavior (dense profile).
 *
 * The injected CSS does not use `!important`, so Phase 1 recovery CSS
 * (which does use `!important`) will override it if recovery becomes necessary.
 */
export function applyInitialRenderProfile(html: string, profile: InitialRenderProfile): string {
  const css = buildInitialRenderProfileCss(profile);
  const withCss = html.includes('</head>')
    ? html.replace('</head>', `${css}\n</head>`)
    : `${css}\n${html}`;
  if (profile.annotationCompactionMode === 'aggressive') {
    return compactAnnotations(withCss, PARITY_MAX_ANNOTATION_INNER_LENGTH);
  }
  if (profile.annotationCompactionMode === 'moderate') {
    return compactAnnotations(withCss, COMPACT_ANNOTATION_COMPACTION_THRESHOLD);
  }
  return withCss;
}

// ── Recovery application ──────────────────────────────────────────────────────

/**
 * Injects the appropriate CSS/HTML transforms for the given recovery level into
 * the provided HTML string. Each level is additive — level 2 output includes
 * level 1 CSS as well.
 *
 * CSS is injected immediately before `</head>` when present, otherwise prepended.
 */
export function applyRecoveryToHtml(html: string, level: ParityRecoveryLevel): string {
  const inject = (css: string, h: string): string =>
    h.includes('</head>') ? h.replace('</head>', `${css}\n</head>`) : `${css}\n${h}`;

  let result = html;
  if (level >= 1) result = inject(buildLevel1RecoveryCss(), result);
  if (level >= 2) result = inject(buildLevel2RecoveryCss(), result);
  if (level >= 3) result = compactAnnotations(result);
  if (level >= 4) result = inject(buildLevel4RecoveryCss(), result);
  return result;
}

// ── Policy helpers ────────────────────────────────────────────────────────────

/**
 * Computes an operational render quality tier after a parity recovery run.
 *
 * The tier reflects whether the final output is likely to be high-quality,
 * acceptable, or warrants human review before release.
 *
 * Resolution rules (applied in priority order):
 *
 *   review_recommended
 *     — parity was not resolved (terminal failure)
 *     — dense profile was selected AND recovery reached L3 or L4
 *     — fallback renderer was used AND recovery reached L4
 *     — document is in a sensitive family AND recovery reached L3 or L4
 *
 *   high
 *     — no recovery was needed (first render achieved parity)
 *     — recovery resolved at L1 (safe reflow only)
 *
 *   acceptable
 *     — recovery resolved at L2 or L3 without a flagged risk combination
 *     — recovery resolved at L4 without a flagged risk combination
 *
 * @param profile         The initial render profile used, or null if none was applied.
 * @param recoveryLevel   The recovery level at which parity resolved, or null if no
 *                        recovery was attempted / needed.
 * @param parityResolved  True if parity was ultimately achieved.
 * @param isFallbackRenderer  True if a fallback renderer path was used (e.g. faithful_light_fallback).
 * @param documentFamily  Optional document family for sensitivity checks.
 */
export function computeRenderQualityTier(
  profile: InitialRenderProfile | null,
  recoveryLevel: ParityRecoveryLevel | null,
  parityResolved: boolean,
  isFallbackRenderer: boolean,
  documentFamily?: string,
): RenderQualityTier {
  // Terminal failure always warrants review regardless of other conditions.
  if (!parityResolved) return 'review_recommended';

  const isSensitive =
    documentFamily !== undefined && SENSITIVE_DOCUMENT_FAMILIES.includes(documentFamily);

  if (recoveryLevel !== null && recoveryLevel >= 3) {
    // L3/L4 recovery with dense profile.
    if (profile?.name === 'dense') return 'review_recommended';
    // L3/L4 recovery for sensitive document families.
    if (isSensitive) return 'review_recommended';
  }

  if (recoveryLevel !== null && recoveryLevel >= 4) {
    // L4 aggressive recovery with a fallback renderer.
    if (isFallbackRenderer) return 'review_recommended';
  }

  // No recovery needed, or L1 safe-reflow only.
  if (recoveryLevel === null || recoveryLevel === 1) return 'high';

  // L2/L3/L4 without any flagged combination.
  return 'acceptable';
}

export function resolveParityRecoveryProfile(
  modality: string,
): ParityRecoveryProfile | null {
  if (modality === 'faithful') return 'faithful_recovery';
  if (modality === 'standard') return 'standard_recovery';
  return null;
}

export function resolveParityRecoveryMaxLevel(modality: string): number {
  const profile = resolveParityRecoveryProfile(modality);
  return profile ? PARITY_RECOVERY_PROFILE_MAX_LEVEL[profile] : 0;
}

/**
 * Returns true when parity recovery should be attempted.
 * Recovery is activated for the 'standard' and 'faithful' modalities when the
 * translated page count exceeds the source page count.
 */
export function isParityRecoveryNeeded(
  translatedPageCount: number,
  sourcePageCount: number | undefined,
  modality: string,
): boolean {
  if (resolveParityRecoveryMaxLevel(modality) <= 0) return false;
  if (!sourcePageCount || sourcePageCount <= 0) return false;
  return translatedPageCount > sourcePageCount;
}
