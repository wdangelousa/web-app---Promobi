/**
 * services/structuredPreviewKit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Assembles a 3-part structured preview kit (internal preview only):
 *
 *   Part 1:  HTML certification cover          — generated via Gotenberg from
 *                                               a controlled HTML template.
 *                                               Uses letterhead.png as the
 *                                               full-page background (it IS the
 *                                               approved visual template: butterfly
 *                                               logo + corner accents baked in).
 *                                               ATA and ATIF badges are overlaid
 *                                               in the header zone.  All metadata
 *                                               fields are embedded natively.
 *
 *   Part 2:  Translated document              — generated via Gotenberg from
 *                                               structured HTML with calibrated
 *                                               print margins, then letterhead.png
 *                                               is applied as a full-page PDF overlay
 *                                               ONLY on translated pages.
 *
 *   Part 3:  Original source document         — original PDF appended as-is
 *                                               (skipped if source is not PDF)
 *
 * Cover variant selection (PART 1):
 *   If input.coverVariant is provided, it is used directly.
 *   Otherwise derived from sourceLanguage:
 *     ES / es  → 'es-en'
 *     Anything else (PT_BR, pt, unknown) → 'pt-en'
 *
 * Cover assets loaded from /public:
 *   letterhead.png             full-page background (butterfly logo + corner accents)
 *   logo-ata.png               ATA logo (header zone, center)
 *   atif.png                   ATIF badge (header zone, right)
 *   assinatura-isabele.png.jpg Isabele's signature (footer-left)
 *   selo-ata.png               ATA seal (footer-right)
 *
 * Invariants:
 *   - Never writes to the database.
 *   - Never modifies Document, Order, delivery_pdf_url, or translation_status.
 *   - Never affects the legacy pipeline or generateDeliveryKit.ts.
 *   - Never exposes artefacts to the client.
 *   - Never throws — all errors are caught and reflected in the result type.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';
import type { DocumentOrientation } from '@/lib/documentOrientationDetector';
import {
  buildTranslatedGotenbergSettings,
  buildTranslatedSafeAreaPageCss,
  getTranslatedPageSafeArea,
  injectTranslatedPageSafeArea,
} from '@/lib/translatedPageSafeArea';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_BUCKET = 'documents';

const GOTENBERG_URL =
  process.env.GOTENBERG_URL ?? 'http://127.0.0.1:3001/forms/chromium/convert/html';

const LETTERHEAD_PATH = join(process.cwd(), 'public', 'letterhead.png');
const LETTERHEAD_LANDSCAPE_PATH = join(process.cwd(), 'public', 'letterhead-landscape.png');

// Local fallback: .artifacts/structured-preview-kits/ at project root.
const LOCAL_ARTIFACTS_DIR = join(process.cwd(), '.artifacts', 'structured-preview-kits');

// ── Gotenberg paper settings ──────────────────────────────────────────────────

/**
 * Cover page: zero Gotenberg margins — all spacing is controlled by CSS
 * padding inside the HTML template.
 */
const GOTENBERG_COVER: Record<string, string> = {
  paperWidth: '8.5',
  paperHeight: '11',
  marginTop: '0',
  marginBottom: '0',
  marginLeft: '0',
  marginRight: '0',
  printBackground: 'true',
  preferCssPageSize: 'false',
  skipNetworkIdleEvent: 'true',
};

// Source language labels used in cover metadata.
const SOURCE_LANGUAGE_LABELS: Record<string, string> = {
  PT_BR: 'Portuguese (Brazil)',
  PT: 'Portuguese',
  pt: 'Portuguese',
  ES: 'Spanish',
  es: 'Spanish',
  FR: 'French',
  fr: 'French',
  EN: 'English',
  en: 'English',
};

// ── Gotenberg extra file type ─────────────────────────────────────────────────

interface GotenbergExtraFile {
  filename: string;
  buffer: Buffer;
  mimeType: string;
}

// ── Cover asset specs ─────────────────────────────────────────────────────────

interface CoverAssetSpec {
  filename: string;
  path: string;
  mimeType: string;
  role: string;
}

const COVER_ASSET_SPECS: CoverAssetSpec[] = [
  {
    filename: 'letterhead.png',
    path: LETTERHEAD_PATH,
    mimeType: 'image/png',
    role: 'full-page background: approved letterhead template (butterfly logo + corner accents)',
  },
  {
    filename: 'logo-ata.png',
    path: join(process.cwd(), 'public', 'logo-ata.png'),
    mimeType: 'image/png',
    role: 'ATA logo (header zone, center)',
  },
  {
    filename: 'atif.png',
    path: join(process.cwd(), 'public', 'atif.png'),
    mimeType: 'image/png',
    role: 'ATIF badge (header zone, right)',
  },
  {
    filename: 'assinatura-isabele.png.jpg',
    path: join(process.cwd(), 'public', 'assinatura-isabele.png.jpg'),
    mimeType: 'image/jpeg',
    role: 'Isabele signature (footer-left)',
  },
  {
    filename: 'selo-ata.png',
    path: join(process.cwd(), 'public', 'selo-ata.png'),
    mimeType: 'image/png',
    role: 'ATA seal (footer-right)',
  },
];

/**
 * Loads all cover assets from disk. Never throws.
 */
function loadCoverAssets(logPrefix: string): GotenbergExtraFile[] {
  const found: string[] = [];
  const missing: string[] = [];
  const loaded: GotenbergExtraFile[] = [];

  for (const spec of COVER_ASSET_SPECS) {
    try {
      const buf = readFileSync(spec.path);
      loaded.push({ filename: spec.filename, buffer: buf, mimeType: spec.mimeType });
      found.push(`${spec.filename} (${spec.role})`);
    } catch {
      missing.push(`${spec.filename} (${spec.role})`);
    }
  }

  console.log(`${logPrefix} — real cover assets found: [${found.join(', ')}]`);
  if (missing.length > 0) {
    console.warn(`${logPrefix} — cover assets not found in /public: [${missing.join(', ')}]`);
  }

  return loaded;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StructuredPreviewKitInput {
  structuredHtml: string;
  originalFileBuffer: ArrayBuffer;
  isOriginalPdf: boolean;
  orderId: string | number;
  documentId: string | number;
  sourceLanguage?: string;
  coverVariant?: 'pt-en' | 'es-en';
  orientation?: DocumentOrientation;
  documentTypeLabel?: string;
  sourcePageCount?: number;
  documentDate?: string;
}

export interface StructuredPreviewKitResult {
  assembled: boolean;
  coverGenerated: boolean;
  coverMetadataApplied: boolean;
  translatedSectionGenerated: boolean;
  originalAppended: boolean;
  kitPath?: string;
  kitUrl?: string;
  kitLocalPath?: string;
  letterheadDetected: boolean;
  letterheadInjected: boolean;
}

// ── Local fallback helper ─────────────────────────────────────────────────────

function saveLocalFallback(
  content: Buffer,
  filename: string,
  logPrefix: string,
): string | null {
  try {
    mkdirSync(LOCAL_ARTIFACTS_DIR, { recursive: true });
    const filePath = join(LOCAL_ARTIFACTS_DIR, filename);
    writeFileSync(filePath, content);
    return filePath;
  } catch (err) {
    console.error(`${logPrefix} local fallback write error: ${err}`);
    return null;
  }
}

// ── Cover variant derivation ──────────────────────────────────────────────────

function deriveCoverVariant(sourceLanguage?: string): 'pt-en' | 'es-en' {
  const upper = (sourceLanguage ?? '').toUpperCase();
  return upper === 'ES' ? 'es-en' : 'pt-en';
}

// ── HTML certification cover ──────────────────────────────────────────────────

function buildCertificationCoverHtml(
  variant: 'pt-en' | 'es-en',
  meta: {
    documentType: string;
    sourceLanguage: string;
    sourcePageCount: number | string;
    translatedPageCount: number | string;
    orderId: string | number;
    dated: string;
    documentDate?: string;
  },
  loadedAssets: Set<string>,
): string {
  const coverVariantLabel = variant === 'es-en' ? 'Spanish to English' : 'Portuguese to English';

  const certificationBodyHtml = variant === 'es-en'
    ? `<p>
  I, <strong>Isabele Bandeira de Moraes D'Angelo</strong>, certify that I am competent to translate
  from Spanish into English and that the attached translation is a
  <strong>complete</strong> and <strong>accurate translation</strong> of the attached original document.
</p>
<p>
  This certification is issued for official use, including but not limited to immigration,
  academic, banking, and institutional purposes, as required.
</p>`
    : `<p>
  I, <strong>Isabele Bandeira de Moraes D'Angelo</strong>, certify that I am competent to translate
  from Portuguese into English and that the attached translation is a
  <strong>complete</strong> and <strong>accurate translation</strong> of the attached original document.
</p>
<p>
  This certification is issued for official use, including but not limited to immigration,
  academic, banking, and institutional purposes, as required.
</p>`;

  const hasLh = loadedAssets.has('letterhead.png');
  const hasAta = loadedAssets.has('logo-ata.png');
  const hasAtif = loadedAssets.has('atif.png');
  const hasSig = loadedAssets.has('assinatura-isabele.png.jpg');
  const hasSeal = loadedAssets.has('selo-ata.png');

  const lhImg = hasLh ? `<img src="letterhead.png" alt="">` : '';
  const ataImg = hasAta ? `<img class="logo-ata" src="logo-ata.png" alt="American Translators Association">` : '';
  const atifImg = hasAtif ? `<img class="logo-atif" src="atif.png" alt="ATIF">` : '';
  const sigImg = hasSig ? `<img class="signature-img" src="assinatura-isabele.png.jpg" alt="Signature of Isabele Bandeira de Moraes D'Angelo">` : '';
  const sealImg = hasSeal ? `<img class="seal-img" src="selo-ata.png" alt="ATA Seal">` : '';

  const documentDate = meta.documentDate ?? '\u2014';
  const targetLanguage = 'English (United States)';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Certification of Translation Accuracy — Promobidocs</title>
  <style>
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: letter;
      margin: 0;
    }

    html, body {
      width: 100%;
      height: 100%;
      font-family: Arial, Helvetica, sans-serif;
      color: #2f2f2f;
      background: #fff;
    }

    .page {
      position: relative;
      width: 8.5in;
      min-height: 11in;
      margin: 0 auto;
      overflow: hidden;
      background: #fff;
    }

    .cover-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
    }

    .cover-bg img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .content {
      position: relative;
      z-index: 2;
      height: 11in;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 0.55in 0.65in 1.3in 0.65in;
    }

    .header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 14px;
      min-height: 0.95in;
      padding-left: 2.5in;
      padding-right: 0.2in;
    }

    .header img {
      display: block;
      object-fit: contain;
    }

    .logo-ata {
      height: 0.52in;
      max-width: 1.45in;
    }

    .logo-atif {
      height: 0.48in;
      max-width: 0.95in;
    }

    .title-block {
      text-align: center;
    }

    .eyebrow {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.6px;
      text-transform: uppercase;
      color: #8b5a2b;
      margin-bottom: 6px;
    }

    .title {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 23px;
      line-height: 1.2;
      font-weight: 700;
      text-transform: uppercase;
      color: #2a2a2a;
      letter-spacing: 0.8px;
    }

    .lang-pair {
      margin-top: 8px;
      font-size: 13px;
      font-weight: 700;
      color: #c46f1e;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }

    .meta-wrap {
      border: 1px solid #e3d7cb;
      border-radius: 8px;
      overflow: hidden;
      background: rgba(255,255,255,0.94);
    }

    .meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }

    .meta-table td {
      border: 1px solid #eadfd6;
      padding: 9px 12px;
      vertical-align: middle;
    }

    .meta-table .label {
      width: 23%;
      background: #f8f1eb;
      font-weight: 700;
      color: #5a4638;
    }

    .meta-table .value {
      color: #2f2f2f;
    }

    .body {
      padding: 0 0.05in;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #2f2f2f;
    }

    .body p + p {
      margin-top: 10px;
    }

    .body strong {
      font-weight: 700;
    }

    .divider {
      height: 2px;
      background: linear-gradient(90deg, #8b5a2b, #d29452);
      border: none;
    }

    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
    }

    .footer-left {
      flex: 1;
      min-width: 0;
    }

    .signature-img {
      height: 0.52in;
      width: auto;
      display: block;
      margin-bottom: 6px;
    }

    .translator-name {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 15px;
      font-weight: 700;
      color: #2f2f2f;
    }

    .credential {
      margin-top: 3px;
      font-size: 12px;
      color: #4d4d4d;
      line-height: 1.45;
    }

    .contact {
      margin-top: 10px;
      font-size: 11.5px;
      color: #4d4d4d;
      line-height: 1.6;
    }

    .footer-right {
      width: 1.55in;
      text-align: center;
      flex-shrink: 0;
    }

    .seal-img {
      width: 1.35in;
      height: 1.35in;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }

    .footer-note {
      margin-top: 4px;
      font-size: 9px;
      color: #666;
      line-height: 1.3;
    }

    @media print {
      .page {
        width: 100%;
        min-height: auto;
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="cover-bg">
      ${lhImg}
    </div>

    <div class="content">
      <div class="header">
        ${ataImg}
        ${atifImg}
      </div>

      <div class="title-block">
        <div class="eyebrow">Certified Translation</div>
        <div class="title">Certification of Translation Accuracy</div>
        <div class="lang-pair">${coverVariantLabel}</div>
      </div>

      <div class="meta-wrap">
        <table class="meta-table">
          <tr>
            <td class="label">Document Type</td>
            <td class="value">${String(meta.documentType || '\u2014')}</td>
            <td class="label">Order #</td>
            <td class="value">${String(meta.orderId)}</td>
          </tr>
          <tr>
            <td class="label">Source Language</td>
            <td class="value">${String(meta.sourceLanguage || '')}</td>
            <td class="label">Target Language</td>
            <td class="value">${targetLanguage}</td>
          </tr>
          <tr>
            <td class="label">Source Pages</td>
            <td class="value">${String(meta.sourcePageCount)}</td>
            <td class="label">Translated Pages</td>
            <td class="value">${String(meta.translatedPageCount)}</td>
          </tr>
          <tr>
            <td class="label">Dated</td>
            <td class="value">${meta.dated}</td>
            <td class="label">Document Date</td>
            <td class="value">${documentDate}</td>
          </tr>
        </table>
      </div>

      <div class="body">
        ${certificationBodyHtml}
      </div>

      <hr class="divider" />

      <div class="footer">
        <div class="footer-left">
          ${sigImg}
          <div class="translator-name">Isabele Bandeira de Moraes D'Angelo</div>
          <div class="credential">American Translators Association — Member No. M-194918</div>
          <div class="credential">ATIF Registration — #3622</div>
          <div class="contact">
            Telephone: +1 321 324-5851<br>
            Email: desk@promobidocs.com<br>
            13550 Village Park Dr, Orlando, FL
          </div>
        </div>
        <div class="footer-right">
          ${sealImg}
          <div class="footer-note">
            Professional translation certification
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Translated document HTML wrapper ─────────────────────────────────────────

export function buildTranslatedDocumentHtml(
  translatedText: string,
  orientation?: 'portrait' | 'landscape',
): string {
  const isLandscape = orientation === 'landscape';
  const safeAreaPageCss = buildTranslatedSafeAreaPageCss(
    isLandscape ? 'landscape' : 'portrait',
  );
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    ${safeAreaPageCss}

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      background: #fff;
      color: #111;
      margin: 0;
      padding: 0;
      width: 100%;
    }

    body {
      word-break: break-word;
      overflow-wrap: break-word;
    }

    /* Landscape: constrain line length for readability */
    .content-body {
      ${isLandscape ? 'max-width: 7in; margin: 0 auto;' : ''}
    }

    p {
      margin: 0 0 8pt 0;
    }

    /* Heading hierarchy — distinct sizes, not flat 11pt */
    h1 {
      font-size: 13pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 14pt 0 6pt 0;
      padding-bottom: 4pt;
      border-bottom: 0.75pt solid #aaa;
    }

    h2 {
      font-size: 12pt;
      font-weight: bold;
      margin: 10pt 0 5pt 0;
    }

    h3 {
      font-size: 11pt;
      font-weight: bold;
      font-style: italic;
      margin: 8pt 0 4pt 0;
    }

    strong, b { font-weight: bold; }

    /* Page-break / section dividers */
    hr {
      border: none;
      border-top: 0.75pt solid #ccc;
      margin: 10pt 0;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 10pt;
      table-layout: fixed;
    }

    td, th {
      padding: 5pt 8pt;
      border: 1px solid #ccc;
      font-size: 10pt;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    th {
      background: #f5f5f5;
      font-weight: bold;
      text-align: left;
    }

    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <div class="content-body">
    ${translatedText}
  </div>
</body>
</html>`;
}

// ── PDF overlay helper ────────────────────────────────────────────────────────

function loadLetterheadBuffer(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

async function applyLetterheadOverlayToPdf(
  pdfBuffer: Buffer,
  letterheadBuffer: Buffer,
  logPrefix: string,
): Promise<Buffer | null> {
  try {
    const srcPdf = await PDFDocument.load(pdfBuffer);
    const finalPdf = await PDFDocument.create();

    const letterheadImage = await finalPdf.embedPng(letterheadBuffer);
    const srcPages = srcPdf.getPages();
    const embeddedPages = await finalPdf.embedPages(srcPages);

    for (const embeddedPage of embeddedPages) {
      const { width, height } = embeddedPage;

      const page = finalPdf.addPage([width, height]);

      page.drawPage(embeddedPage, {
        x: 0,
        y: 0,
        width,
        height,
      });

      page.drawImage(letterheadImage, {
        x: 0,
        y: 0,
        width,
        height,
        opacity: 1,
      });
    }

    return Buffer.from(await finalPdf.save());
  } catch (err) {
    console.error(`${logPrefix} — translated letterhead overlay error: ${err}`);
    return null;
  }
}

// ── Gotenberg helper ──────────────────────────────────────────────────────────

async function callGotenberg(
  html: string,
  settings: Record<string, string>,
  logPrefix: string,
  label: string,
  extraFiles?: GotenbergExtraFile[],
): Promise<Buffer | null> {
  try {
    console.log(`${logPrefix} — MARGINS (${label}):`, JSON.stringify(settings));

    const formData = new FormData();
    formData.append('files', new Blob([html], { type: 'text/html' }), 'index.html');

    for (const file of extraFiles ?? []) {
      formData.append(
        'files',
        new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
        file.filename,
      );
    }

    for (const [k, v] of Object.entries(settings)) {
      formData.append(k, v);
    }

    const res = await fetch(GOTENBERG_URL, { method: 'POST', body: formData });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`${logPrefix} — ${label} Gotenberg error ${res.status}: ${errText}`);
      return null;
    }

    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error(`${logPrefix} — ${label} Gotenberg unexpected error: ${err}`);
    return null;
  }
}

// ── Shared kit buffer builder ─────────────────────────────────────────────────

/**
 * Assembles the 3-part kit PDF (cover + translated + original) and returns the
 * raw Buffer WITHOUT uploading or touching the database.
 *
 * Used by both:
 *   - assembleStructuredPreviewKit  (preview → orders/previews/ in documents bucket)
 *   - generateDeliveryKit           (official → orders/completed/ in translations bucket)
 *
 * Returns null on any internal failure (never throws).
 */
export async function buildStructuredKitBuffer(
  input: StructuredPreviewKitInput,
): Promise<Buffer | null> {
  const logPrefix = `[buildStructuredKitBuffer] Order #${input.orderId} Doc #${input.documentId}`;
  const log = (msg: string) => console.log(`${logPrefix} — ${msg}`);

  try {
    const coverVariant = input.coverVariant ?? deriveCoverVariant(input.sourceLanguage);
    const isLandscape = input.orientation === 'landscape';
    const translatedOrientation = isLandscape ? 'landscape' : 'portrait';
    const safeArea = getTranslatedPageSafeArea(translatedOrientation);
    const paperSettings = buildTranslatedGotenbergSettings(translatedOrientation);
    log(`orientation: ${input.orientation ?? 'portrait (default)'}`);
    log(
      `translated safe area policy: orientation=${safeArea.orientation} ` +
      `margins(top/right/bottom/left)=${safeArea.marginTopIn}/${safeArea.marginRightIn}/` +
      `${safeArea.marginBottomIn}/${safeArea.marginLeftIn} in`,
    );

    // ── Part 2: Translated document PDF ──────────────────────────────────────
    const targetLhPath = isLandscape ? LETTERHEAD_LANDSCAPE_PATH : LETTERHEAD_PATH;
    const letterheadBuffer = loadLetterheadBuffer(targetLhPath);

    if (letterheadBuffer) {
      log(`letterhead detected: yes (${targetLhPath})`);
    } else {
      log(`letterhead detected: no (${targetLhPath})`);
    }

    const safeAreaStructuredHtml = injectTranslatedPageSafeArea(
      input.structuredHtml,
      translatedOrientation,
    );

    const translatedPdfBaseBuffer = await callGotenberg(
      safeAreaStructuredHtml,
      paperSettings,
      logPrefix,
      'translated-section',
      [],
    );

    if (!translatedPdfBaseBuffer) {
      log(`translated section: Gotenberg failed`);
      return null;
    }

    let translatedPdfBuffer = translatedPdfBaseBuffer;

    if (letterheadBuffer) {
      const overlayBuffer = await applyLetterheadOverlayToPdf(
        translatedPdfBaseBuffer,
        letterheadBuffer,
        logPrefix,
      );
      if (overlayBuffer) {
        translatedPdfBuffer = overlayBuffer;
        log(`letterhead overlay applied: yes`);
      } else {
        log(`letterhead overlay applied: no (overlay failed)`);
      }
    } else {
      log(`letterhead overlay applied: no (file not found)`);
    }

    log(`translated section generated: yes`);

    const translatedPdfDoc = await PDFDocument.load(translatedPdfBuffer);
    const translatedPageCount = translatedPdfDoc.getPageCount();
    log(`translated pages: ${translatedPageCount}`);

    // ── Part 1: HTML certification cover ─────────────────────────────────────
    const sourceLangLabel =
      SOURCE_LANGUAGE_LABELS[input.sourceLanguage ?? ''] ??
      input.sourceLanguage ??
      'Unknown';

    const today = new Date();
    const dated = today.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const coverAssets = loadCoverAssets(logPrefix);
    const loadedCoverAssets = new Set(coverAssets.map(a => a.filename));

    const coverHtml = buildCertificationCoverHtml(
      coverVariant,
      {
        documentType: input.documentTypeLabel ?? 'Document',
        sourceLanguage: sourceLangLabel,
        sourcePageCount: input.sourcePageCount ?? '\u2014',
        translatedPageCount,
        orderId: input.orderId,
        dated,
        documentDate: input.documentDate,
      },
      loadedCoverAssets,
    );

    log(`cover assets loaded: [${Array.from(loadedCoverAssets).join(', ')}]`);

    const coverPdfBuffer = await callGotenberg(
      coverHtml,
      GOTENBERG_COVER,
      logPrefix,
      'html-cover',
      coverAssets,
    );

    if (!coverPdfBuffer) {
      log(`cover page: Gotenberg failed`);
      return null;
    }

    log(`cover page generated: yes`);

    // ── pdf-lib assembly: Part 1 + Part 2 + Part 3 ───────────────────────────
    const finalPdf = await PDFDocument.create();

    // Part 1: cover intact
    const coverDoc = await PDFDocument.load(coverPdfBuffer);
    const coverPages = await finalPdf.copyPages(coverDoc, coverDoc.getPageIndices());
    coverPages.forEach(p => finalPdf.addPage(p));

    // Part 2: translated with letterhead overlay
    const translatedPages = await finalPdf.copyPages(translatedPdfDoc, translatedPdfDoc.getPageIndices());
    translatedPages.forEach(p => finalPdf.addPage(p));

    // Part 3: original intact (skipped if not PDF or unavailable)
    let originalPageCount = 0;
    if (input.isOriginalPdf && input.originalFileBuffer.byteLength > 0) {
      try {
        const originalDoc = await PDFDocument.load(input.originalFileBuffer, { ignoreEncryption: true });
        const originalPages = await finalPdf.copyPages(originalDoc, originalDoc.getPageIndices());
        originalPages.forEach(p => finalPdf.addPage(p));
        originalPageCount = originalDoc.getPageCount();
        log(`original appended: yes (${originalPageCount} page(s))`);
      } catch (origErr) {
        log(`original appended: no (pdf-lib load error: ${origErr})`);
      }
    } else {
      log(`original appended: no (source is not a PDF or buffer empty)`);
    }

    const totalPages = finalPdf.getPageCount();
    const kitBytes = await finalPdf.save();
    const kitBuffer = Buffer.from(kitBytes);

    log(
      `kit assembled: yes — cover=${coverDoc.getPageCount()} + translated=${translatedPageCount} + original=${originalPageCount}; ` +
      `total=${totalPages} pages, ${kitBuffer.length} bytes`,
    );

    return kitBuffer;

  } catch (err) {
    console.error(`[buildStructuredKitBuffer] unexpected error: ${err}`);
    return null;
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function assembleStructuredPreviewKit(
  input: StructuredPreviewKitInput,
): Promise<StructuredPreviewKitResult> {
  const result: StructuredPreviewKitResult = {
    assembled: false,
    coverGenerated: false,
    coverMetadataApplied: false,
    translatedSectionGenerated: false,
    originalAppended: false,
    letterheadDetected: false,
    letterheadInjected: false,
  };

  const logPrefix = `[structuredPreviewKit] Order #${input.orderId} Doc #${input.documentId}`;
  const log = (msg: string) => console.log(`${logPrefix} — ${msg}`);

  try {
    // Detect letterhead for result metadata (orientation-aware)
    const isLandscape = input.orientation === 'landscape';
    const targetLhPath = isLandscape ? LETTERHEAD_LANDSCAPE_PATH : LETTERHEAD_PATH;
    try {
      result.letterheadDetected = existsSync(targetLhPath);
    } catch {
      result.letterheadDetected = false;
    }

    // ── Assemble the 3-part PDF buffer ────────────────────────────────────────
    const kitBuffer = await buildStructuredKitBuffer(input);

    if (!kitBuffer) {
      log(`kit assembly failed`);
      return result;
    }

    result.coverGenerated = true;
    result.coverMetadataApplied = true;
    result.translatedSectionGenerated = true;
    result.letterheadInjected = result.letterheadDetected;
    result.originalAppended = input.isOriginalPdf && input.originalFileBuffer.byteLength > 0;

    // ── Persist: Supabase Storage with local fallback ─────────────────────────
    const timestamp = Date.now();
    const kitFilename = `structured-kit-${input.documentId}-${timestamp}.pdf`;
    const kitStoragePath = `orders/previews/${kitFilename}`;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(kitStoragePath, kitBuffer, { contentType: 'application/pdf', upsert: true });

      if (uploadErr) {
        log(`storage upload failed: ${uploadErr.message}`);
        const localPath = saveLocalFallback(kitBuffer, kitFilename, logPrefix);
        if (localPath) {
          result.kitLocalPath = localPath;
          result.assembled = true;
          log(`saved locally: ${localPath}`);
        }
      } else {
        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(kitStoragePath);
        result.assembled = true;
        result.kitPath = kitStoragePath;
        result.kitUrl = urlData?.publicUrl;
        log(`saved to storage: ${result.kitUrl}`);
      }
    } else {
      const localPath = saveLocalFallback(kitBuffer, kitFilename, logPrefix);
      if (localPath) {
        result.kitLocalPath = localPath;
        result.assembled = true;
        log(`saved locally (no env vars): ${localPath}`);
      }
    }
  } catch (err) {
    console.error(`${logPrefix} — unexpected error: ${err}`);
  }

  return result;
}
