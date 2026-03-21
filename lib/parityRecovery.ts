/**
 * lib/parityRecovery.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Parity-recovery ladder for faithful-modality translations.
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
 * Terminal failure is signalled by the caller after all levels are exhausted.
 *
 * Modality contract:
 *   'standard'     — parity recovery is NOT activated; overflow is tolerated.
 *   'faithful'     — parity recovery IS activated; all levels are attempted
 *                    before terminal failure.
 *   'external_pdf' — parity is handled upstream; this module is not invoked.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum font size (px) permitted during typographic compression (Level 2). */
export const PARITY_MIN_FONT_SIZE_PX = 8;

/**
 * Maximum number of recovery levels available.
 * Callers iterate 1..PARITY_MAX_RECOVERY_LEVEL before declaring terminal failure.
 */
export const PARITY_MAX_RECOVERY_LEVEL = 4;

/**
 * Prompt note appended to system prompts for faithful-modality structured
 * renders. Instructs the model to keep translated content compact to help
 * preserve the source page count.
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
 */
function buildLevel4RecoveryCss(): string {
  const sz = PARITY_MIN_FONT_SIZE_PX;
  return `<style id="parity-recovery-l4">
/* parity recovery — level 4: aggressive reflow */
body { font-size: ${sz}px !important; line-height: 1.05 !important; }
td, th { font-size: ${sz}px !important; padding: 1px !important; }
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
export function compactAnnotations(html: string): string {
  return html.replace(/\[([^\]]{20,})\]/g, (_match, inner: string) => {
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
 * Returns true when parity recovery should be attempted.
 * Recovery is only activated for the 'faithful' modality and when the
 * translated page count exceeds the source page count.
 */
export function isParityRecoveryNeeded(
  translatedPageCount: number,
  sourcePageCount: number | undefined,
  modality: string,
): boolean {
  if (modality !== 'faithful') return false;
  if (!sourcePageCount || sourcePageCount <= 0) return false;
  return translatedPageCount > sourcePageCount;
}
