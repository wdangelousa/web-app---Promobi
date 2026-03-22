/**
 * services/translatedPageTemplate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone HTML template for the translated document page.
 *
 * Produces a single self-contained HTML file (index.html) ready to be sent
 * directly to the Gotenberg Chromium endpoint.  The letterhead chrome is
 * implemented with position:fixed elements so it repeats on every printed
 * page — no separate header.html / footer.html files needed.
 *
 * Assets referenced:
 *   logo.png   — Promobidocs logo (must be attached as a FormData file
 *                alongside index.html in the Gotenberg request)
 *
 * Layout:
 *   .header-timbrado   position:fixed top zone (logo + optional document title)
 *   .moldura-dourada   position:fixed right/top copper border accent
 *   .footer-timbrado   position:fixed bottom zone (promobidocs.com | Certified Translation)
 *   .conteudo-principal scrolling content area (receives the translated HTML)
 *
 * @page US Letter with global translated safe-area margins
 *
 * Usage:
 *   const html = buildTranslatedPageHtml(translatedHtml, { documentTitle: 'Marriage Certificate' });
 *   // Attach html as 'index.html' and logo as 'logo.png' in Gotenberg FormData.
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
 * Attach `logo.png` as a companion FormData file.
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

  const titleBlock = documentTitle
    ? `<div class="header-titulos">
        ${documentTitle ? `<h1>${documentTitle}</h1>` : ''}
        ${registrationNumber ? `<p>Registration No.: ${registrationNumber}</p>` : ''}
      </div>`
    : '';

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
      font-size: 10px;
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
      margin: 2pt 0;
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

    .header-timbrado {
      position: fixed;
      top: calc(-1 * var(--safe-top));
      left: 0;
      right: 0;
      height: var(--safe-top);
      z-index: 1000;
    }

    .logo-borboleta {
      position: absolute;
      top: 0.22in;
      left: 0;
      width: 100px;
    }

    .header-titulos {
      text-align: center;
      width: 100%;
      padding-top: 0.34in;
    }

    .header-titulos p {
      margin: 2px 0;
      font-size: 11px;
    }

    .header-titulos h1 {
      margin: 5px 0;
      font-size: 16px;
      font-weight: bold;
      text-transform: uppercase;
    }

    .moldura-dourada {
      position: fixed;
      top: calc(-1 * var(--safe-top));
      right: calc(-1 * var(--safe-right));
      bottom: calc(-1 * var(--safe-bottom));
      width: 20px;
      border-right: 3px solid #C4A265;
      border-top: 3px solid #C4A265;
      z-index: 999;
    }

    .footer-timbrado {
      position: fixed;
      bottom: calc(-1 * var(--safe-bottom));
      left: 0;
      right: 0;
      height: var(--safe-bottom);
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 0.16in;
      color: #C4A265;
      font-size: 11px;
      font-weight: bold;
      z-index: 1000;
    }

    .conteudo-principal {
      width: 100%;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    th, td {
      border: 1px solid #000;
      padding: 4px;
      word-wrap: break-word;
    }
  </style>
</head>
<body${isCertLayout ? ' class="cert-layout"' : ''}>
  <div class="moldura-dourada"></div>

  <div class="header-timbrado">
    <img src="logo.png" alt="Promobidocs" class="logo-borboleta">
    ${titleBlock}
  </div>

  <div class="footer-timbrado">
    <span>promobidocs.com</span>
    <span>Certified Translation</span>
  </div>

  <div class="conteudo-principal">
    ${translatedHtml}
  </div>
</body>
</html>`;
}
