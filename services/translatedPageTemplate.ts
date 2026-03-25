/**
 * services/translatedPageTemplate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone HTML template for the translated document page.
 *
 * Produces a single self-contained HTML file (index.html) ready to be sent
 * directly to the Gotenberg Chromium endpoint.
 *
 * The official Promobidocs letterhead PNG is rendered as a position:fixed
 * full-page background (z-index -1) that repeats on every printed page.
 * The @page margins (safe-area policy) keep translated content inside the
 * central reading zone so it never overlaps the letterhead decorative
 * elements in the margins.  Content has z-index 2 for guaranteed layering.
 *
 * Assets referenced:
 *   letterhead.png           — official letterhead (portrait), must be attached
 *   letterhead-landscape.png — official letterhead (landscape), must be attached
 *                              as FormData files alongside index.html in the
 *                              Gotenberg request.
 *
 * Layout:
 *   .letterhead-bg      position:fixed full-page background (z-index -1)
 *   .conteudo-principal scrolling content area (z-index 2, always above background)
 *
 * No text overlays are rendered on internal translated pages — the letterhead
 * image provides all institutional branding (logo, borders, footer artwork).
 * Document title / branding text were removed to prevent crossing the body.
 *
 * @page US Letter with global translated safe-area margins
 *
 * Usage:
 *   const html = buildTranslatedPageHtml(translatedHtml, { documentTitle: 'Marriage Certificate' });
 *   // Attach html as 'index.html' and the orientation-correct letterhead
 *   // (letterhead.png or letterhead-landscape.png) in Gotenberg FormData.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  buildTranslatedSafeAreaPageCss,
  getTranslatedPageSafeArea,
} from '@/lib/translatedPageSafeArea';

export interface TranslatedPageTemplateOptions {
  /**
   * The translated HTML content — injected verbatim into .conteudo-principal.
   * Must not be modified.
   */
  translatedHtml: string;
  /**
   * Optional document type title shown in the header zone.
   * e.g. 'Marriage Certificate', 'Birth Certificate'.
   * When omitted the title block is not rendered.
   */
  documentTitle?: string;
  /**
   * Optional document registration / reference number shown below the title.
   */
  registrationNumber?: string;
  /**
   * Optional page orientation for the global translated safe-area policy.
   */
  orientation?: 'portrait' | 'landscape';
  /**
   * Layout hint for the content area.
   *
   * 'standard'    — default left-aligned prose layout (current behavior)
   * 'certificate' — centered, balanced certificate/diploma/award layout:
   *                 - all text centered
   *                 - strong-only paragraphs (titles/headings) enlarged
   *                 - first heading paragraph treated as document title
   *                 - proportionally smaller sizes in landscape orientation
   *                 Use this when the source document is a certificate, diploma,
   *                 award, or any ceremonial document that must not be rendered
   *                 as a left-aligned transcription sheet.
   */
  layoutHint?: 'standard' | 'certificate';
}

/**
 * Certificate-style layout CSS injected into the content area when
 * layoutHint === 'certificate'.
 *
 * Applies a centered, balanced composition to plain-paragraph translated text
 * so that certificate/diploma/award documents do not render as left-aligned
 * transcription sheets. Works with the HTML produced by sanitizeTranslationHtml
 * (headings → <p><strong>CAPS</strong></p>, body → <p>…</p>).
 *
 * Uses CSS :has() (Chromium 105+ / Gotenberg) to identify heading paragraphs
 * without requiring markup changes.
 */
function buildCertificateLayoutCss(isLandscape: boolean): string {
  const titleSize      = isLandscape ? '14pt'   : '18pt';
  const headingSize    = isLandscape ? '10.5pt' : '12pt';
  const bodySize       = isLandscape ? '8.5pt'  : '9.5pt';
  const titleSpacing   = isLandscape ? '0.05em' : '0.08em';
  const headingSpacing = isLandscape ? '0.03em' : '0.04em';
  const titleBottom    = isLandscape ? '6pt'    : '10pt';
  return `
    /* ── Certificate-style layout override ──────────────────────────────────── */
    .cert-layout .conteudo-principal {
      text-align: center;
    }

    .cert-layout .conteudo-principal p {
      text-align: center;
      margin: 4pt auto;
      max-width: 87%;
      line-height: 1.6;
      font-size: ${bodySize};
    }

    /* Heading paragraph: <p><strong>TEXT</strong></p> */
    .cert-layout .conteudo-principal p:has(> strong:only-child) {
      font-size: ${headingSize};
      letter-spacing: ${headingSpacing};
      margin: 5pt auto 6pt;
      max-width: 93%;
    }

    /* Document title: first heading paragraph (or first child) */
    .cert-layout .conteudo-principal p:first-child,
    .cert-layout .conteudo-principal p:has(> strong:only-child):first-of-type {
      font-size: ${titleSize};
      letter-spacing: ${titleSpacing};
      margin-bottom: ${titleBottom};
      max-width: 96%;
    }

    /* Tables (if any remain after sanitization): centered */
    .cert-layout .conteudo-principal table {
      margin: 5pt auto;
      max-width: 90%;
      text-align: left;
    }
  `;
}

/**
 * Builds the complete translated-page HTML document.
 *
 * Pass the result directly to Gotenberg as `index.html`.
 * Attach the orientation-correct letterhead as a companion FormData file
 * (letterhead.png for portrait, letterhead-landscape.png for landscape).
 */
export function buildTranslatedPageHtml(options: TranslatedPageTemplateOptions): string {
  const {
    translatedHtml,
    documentTitle,
    registrationNumber,
    orientation,
    layoutHint,
  } = options;
  const resolvedOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
  const isLandscape = resolvedOrientation === 'landscape';
  const isCertLayout = layoutHint === 'certificate';
  const safeArea = getTranslatedPageSafeArea(resolvedOrientation);
  const safeAreaPageCss = buildTranslatedSafeAreaPageCss(resolvedOrientation);

  // Document title and registration number are intentionally NOT rendered
  // on internal translated pages.  The letterhead provides institutional
  // branding; the filename/title overlay was crossing the content area for
  // long document names.  Title is still available in the cover page and
  // workbench metadata.

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Certified Translation</title>
  <style>
    ${safeAreaPageCss}

    :root {
      --safe-top: ${safeArea.marginTopIn}in;
      --safe-right: ${safeArea.marginRightIn}in;
      --safe-bottom: ${safeArea.marginBottomIn}in;
      --safe-left: ${safeArea.marginLeftIn}in;
    }

    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
    }

    body {
      font-family: Arial, sans-serif;
      font-size: 11.5px;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Paragraph margin reset ────────────────────────────────────────────────────
       Browser/Chromium print default is margin: 1em 0 which at body font-size
       10px = 20px (≈ 0.21in) of extra spacing per paragraph.  Without this reset
       a 10-paragraph certificate adds ~2in of whitespace — enough to push the
       translated output onto a second page.
       Certificate layout overrides this with .cert-layout .conteudo-principal p
       (higher specificity, centred margin).  Header paragraphs (.header-titulos p)
       override via their own rule defined below. */
    p {
      margin: 3pt 0;
      line-height: 1.4;
    }

    /* Translator-note blocks: compact, muted — preserve the note but do not
       let it consume meaningful layout space on a tight single page. */
    .translator-note-block {
      font-size: 7.5px;
      color: #555;
      line-height: 1.2;
      font-style: italic;
    }

    span.translator-note {
      font-size: 0.75em;
      color: #555;
      font-style: italic;
    }

    ${isCertLayout ? buildCertificateLayoutCss(isLandscape) : ''}

    /* ── Letterhead full-page background ────────────────────────────────────
       The official letterhead PNG spans the entire physical page (including
       margins) as a fixed background at z-index -1.  The @page margins
       defined by the safe-area policy keep all translated content inside the
       central reading zone.  The letterhead's decorative elements (logo,
       borders, footer artwork) occupy the margin areas by design.
       Content is always above via z-index 2 on .conteudo-principal. */
    .letterhead-bg {
      position: fixed;
      top: calc(-1 * var(--safe-top));
      left: calc(-1 * var(--safe-left));
      width: calc(100% + var(--safe-left) + var(--safe-right));
      height: calc(100% + var(--safe-top) + var(--safe-bottom));
      z-index: -1;
      pointer-events: none;
    }

    .letterhead-bg img {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* ── Content area ───────────────────────────────────────────────────────
       Rendered above the letterhead background so translated text is never
       obscured by decorative elements.  The @page margins guarantee the
       content box does not overlap the letterhead header/footer artwork.
       No text overlays (title, branding) are rendered on internal translated
       pages — the letterhead image provides all institutional framing. */
    .conteudo-principal {
      position: relative;
      z-index: 2;
      width: 100%;
    }

    /* ── Multi-page section breaks ───────────────────────────────────────────
       When Claude outputs one <section class="page"> per source page, each
       section must produce a hard page break in the rendered PDF.
       Without this rule Gotenberg flows all sections continuously and a
       2-page source collapses to 1 PDF page when the content is short enough
       to fit.  The :last-child reset prevents a trailing blank page. */
    section.page {
      break-after: page;
      page-break-after: always;
    }

    section.page:last-child {
      break-after: auto;
      page-break-after: auto;
    }

    /* ── Page-local block hierarchy ──────────────────────────────────────────
       Semantic block divs emitted by the translator preserve the visual
       composition of each source page.  These rules give each block type a
       distinct visual treatment so the translated page reads as a structured
       document page rather than an undifferentiated prose transcript. */

    /* Title block — document title, degree name, certificate heading */
    .block-title {
      text-align: center;
      margin: 4pt 0 5pt;
    }

    /* Institution block — issuing authority, university, registry office */
    .block-institution {
      text-align: center;
      margin: 2pt 0 4pt;
    }

    /* Recipient block — person's name, degree recipient */
    .block-recipient {
      text-align: center;
      margin: 3pt 0;
    }

    /* Content block — main fields, body text, form data */
    .block-content {
      margin: 3pt 0;
    }

    /* Signatures block — signature lines, signatory names and titles */
    .block-signatures {
      margin-top: 10pt;
      padding-top: 6pt;
      border-top: 0.5pt solid #999;
    }

    .block-signatures p {
      margin: 2pt 0;
    }

    /* Stamps block — bracketed [Stamp: ...] [Seal: ...] descriptions */
    .block-stamps {
      font-size: 9px;
      color: #555;
      font-style: italic;
      margin: 2pt 0;
      line-height: 1.3;
    }

    /* Authentication block — apostille form, authentication certificate */
    .block-authentication {
      margin-top: 5pt;
      padding-top: 3pt;
      border-top: 0.5pt solid #bbb;
    }

    /* Footer block — registry data, validation codes, electronic signature */
    .block-footer {
      font-size: 9px;
      color: #555;
      margin-top: 4pt;
      padding-top: 2pt;
      border-top: 0.5pt solid #ddd;
      line-height: 1.3;
    }

    /* ── V2 enriched layout styles ──────────────────────────────────────── */

    .block-prose p {
      margin: 6pt 0;
      line-height: 1.45;
    }

    .doc-list {
      margin: 4pt 0 6pt 14pt;
      padding: 0;
      list-style-type: disc;
    }

    .doc-list li {
      margin: 2pt 0;
      line-height: 1.4;
    }

    .inst-detail {
      font-size: 9px;
      margin: 1pt 0;
      color: #333;
    }

    .field-grid {
      margin: 4pt 0;
    }

    .field-item {
      margin: 2pt 0;
      line-height: 1.4;
    }

    .field-label {
      font-weight: bold;
    }

    .block-content p {
      margin: 4pt 0;
      line-height: 1.4;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    td, th {
      font-size: 10.5px;
      line-height: 1.35;
      vertical-align: top;
    }

    th, td {
      border: 1px solid #000;
      padding: 4px;
      word-wrap: break-word;
    }
  </style>
</head>
<body${isCertLayout ? ' class="cert-layout"' : ''}>
  <div class="letterhead-bg">
    <img src="${isLandscape ? 'letterhead-landscape.png' : 'letterhead.png'}" alt="">
  </div>

  <div class="conteudo-principal">
    ${translatedHtml}
  </div>
</body>
</html>`;
}
