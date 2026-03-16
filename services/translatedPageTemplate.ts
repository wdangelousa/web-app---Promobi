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
 * @page A4, margins: 45mm top / 20mm right / 30mm bottom / 20mm left
 *
 * Usage:
 *   const html = buildTranslatedPageHtml(translatedHtml, { documentTitle: 'Marriage Certificate' });
 *   // Attach html as 'index.html' and logo as 'logo.png' in Gotenberg FormData.
 * ─────────────────────────────────────────────────────────────────────────────
 */

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
}

/**
 * Builds the complete translated-page HTML document.
 *
 * Pass the result directly to Gotenberg as `index.html`.
 * Attach `logo.png` as a companion FormData file.
 */
export function buildTranslatedPageHtml(options: TranslatedPageTemplateOptions): string {
  const { translatedHtml, documentTitle, registrationNumber } = options;

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
    @page {
      size: A4;
      margin: 45mm 20mm 30mm 20mm;
    }

    body {
      font-family: Arial, sans-serif;
      font-size: 10px;
      color: #000;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
    }

    .header-timbrado {
      position: fixed;
      top: -45mm;
      left: 0;
      right: 0;
      height: 45mm;
      z-index: 1000;
    }

    .logo-borboleta {
      position: absolute;
      top: 10mm;
      left: 0;
      width: 100px;
    }

    .header-titulos {
      text-align: center;
      width: 100%;
      padding-top: 15mm;
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
      top: -30mm;
      right: -10mm;
      bottom: -20mm;
      width: 20px;
      border-right: 3px solid #C4A265;
      border-top: 3px solid #C4A265;
      z-index: 999;
    }

    .footer-timbrado {
      position: fixed;
      bottom: -30mm;
      left: 0;
      right: 0;
      height: 30mm;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 10mm;
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
<body>
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
