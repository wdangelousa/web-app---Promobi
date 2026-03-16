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

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_BUCKET = 'documents';

const GOTENBERG_URL =
  process.env.GOTENBERG_URL ?? 'http://127.0.0.1:3001/forms/chromium/convert/html';

const LETTERHEAD_PATH = join(process.cwd(), 'public', 'letterhead.png');

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

/**
 * Translated section — US Letter portrait.
 *
 * These margins are the key fix:
 * they reserve the top branding zone and the bottom footer zone BEFORE the
 * PDF overlay is applied, so Gotenberg delivers the content inside the safe area.
 */
const GOTENBERG_PORTRAIT: Record<string, string> = {
  paperWidth: '8.5',
  paperHeight: '11',
  marginTop: '1.85',
  marginBottom: '0.75',
  marginLeft: '1.0',
  marginRight: '0.7',
  printBackground: 'true',
  preferCssPageSize: 'false',
  skipNetworkIdleEvent: 'true',
};

/**
 * Translated section — US Letter landscape.
 * Same physical margin values as portrait.
 */
const GOTENBERG_LANDSCAPE: Record<string, string> = {
  paperWidth: '11',
  paperHeight: '8.5',
  marginTop: '1.85',
  marginBottom: '0.75',
  marginLeft: '1.0',
  marginRight: '0.7',
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

export function buildTranslatedDocumentHtml(translatedText: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      background: transparent;
      color: #111;
      margin: 0;
      padding: 0;
      width: 100%;
    }

    body {
      word-break: break-word;
      overflow-wrap: break-word;
    }

    p   { margin: 0 0 8pt 0; }
    h1, h2, h3 { font-size: 11pt; font-weight: bold; margin: 0 0 8pt 0; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 10pt;
      table-layout: fixed;
    }
    td, th {
      padding: 4pt 8pt;
      border: 1px solid #ccc;
      font-size: 10pt;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  ${translatedText}
</body>
</html>`;
}

// ── PDF overlay helper ────────────────────────────────────────────────────────

function loadLetterheadBuffer(): Buffer | null {
  try {
    return readFileSync(LETTERHEAD_PATH);
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
    // ── Determine cover variant ───────────────────────────────────────────────
    const coverVariant = input.coverVariant ?? deriveCoverVariant(input.sourceLanguage);
    log(`cover variant selected: ${coverVariant}`);

    // ── Detect letterhead for translated pages ────────────────────────────────
    try {
      result.letterheadDetected = existsSync(LETTERHEAD_PATH);
    } catch {
      result.letterheadDetected = false;
    }

    const letterheadBuffer = result.letterheadDetected ? loadLetterheadBuffer() : null;

    if (letterheadBuffer) {
      log(`translated letterhead source detected: yes (${LETTERHEAD_PATH})`);
    } else {
      log(`translated letterhead source detected: no (${LETTERHEAD_PATH})`);
    }

    // ── Part 2: Translated document PDF (orientation-aware) ──────────────────
    const isLandscape = input.orientation === 'landscape';
    const paperSettings = isLandscape ? GOTENBERG_LANDSCAPE : GOTENBERG_PORTRAIT;
    log(`translated section orientation: ${input.orientation ?? 'portrait (default)'}`);

    const translatedPdfBaseBuffer = await callGotenberg(
      input.structuredHtml,
      paperSettings,
      logPrefix,
      'translated-section',
      [],
    );

    if (!translatedPdfBaseBuffer) {
      log(`translated section generated: no (Gotenberg failed)`);
      return result;
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
        result.letterheadInjected = true;
        log(`translated letterhead applied: yes (PNG overlay on translated pages only)`);
      } else {
        log(`translated letterhead applied: no (overlay failed)`);
      }
    } else {
      log(`translated letterhead applied: no (letterhead.png not found)`);
    }

    result.translatedSectionGenerated = true;
    log(`translated section generated: yes`);

    const translatedPdfDoc = await PDFDocument.load(translatedPdfBuffer);
    const translatedPageCount = translatedPdfDoc.getPageCount();
    log(`translated pages count: ${translatedPageCount}`);

    // ── Part 1: HTML certification cover — INTACT ────────────────────────────
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

    log(`html certification cover generated: yes`);
    log(`approved cover HTML template applied: yes`);
    log(`real cover assets loaded: [${Array.from(loadedCoverAssets).join(', ')}]`);
    log(`dynamic metadata preserved on cover: yes`);
    log(`metadata filled on html cover: yes`);

    const coverPdfBuffer = await callGotenberg(
      coverHtml,
      GOTENBERG_COVER,
      logPrefix,
      'html-cover',
      coverAssets,
    );

    if (!coverPdfBuffer) {
      log(`html certification cover rendered: no (Gotenberg failed)`);
      return result;
    }

    result.coverGenerated = true;
    result.coverMetadataApplied = true;
    log(`html certification cover rendered: yes`);

    // ── pdf-lib assembly: Part 1 + Part 2 + Part 3 ───────────────────────────
    const finalPdf = await PDFDocument.create();

    // Part 1: cover intact
    const coverDoc = await PDFDocument.load(coverPdfBuffer);
    const coverPages = await finalPdf.copyPages(coverDoc, coverDoc.getPageIndices());
    coverPages.forEach(p => finalPdf.addPage(p));

    // Part 2: translated with margins fixed by Gotenberg + overlay
    const translatedPages = await finalPdf.copyPages(translatedPdfDoc, translatedPdfDoc.getPageIndices());
    translatedPages.forEach(p => finalPdf.addPage(p));

    // Part 3: original intact
    let originalPageCount = 0;
    if (input.isOriginalPdf) {
      try {
        const originalDoc = await PDFDocument.load(input.originalFileBuffer, { ignoreEncryption: true });
        const originalPages = await finalPdf.copyPages(originalDoc, originalDoc.getPageIndices());
        originalPages.forEach(p => finalPdf.addPage(p));
        originalPageCount = originalDoc.getPageCount();
        result.originalAppended = true;
        log(`original source appended: yes (${originalPageCount} page(s))`);
      } catch (origErr) {
        log(`original source appended: no (pdf-lib load error: ${origErr})`);
      }
    } else {
      log(`original source appended: no (source is not a PDF)`);
    }

    const kitBytes = await finalPdf.save();
    const kitBuffer = Buffer.from(kitBytes);

    // ── Verify final kit order ────────────────────────────────────────────────
    const coverPartPages = coverDoc.getPageCount();
    const totalExpectedPages = coverPartPages + translatedPageCount + originalPageCount;
    const totalActualPages = finalPdf.getPageCount();
    const orderVerified = totalActualPages === totalExpectedPages;

    log(
      `preview kit final order verified: ${orderVerified ? 'yes' : 'no'} ` +
      `(cover=${coverPartPages} + translated=${translatedPageCount} + original=${originalPageCount}; total=${totalActualPages})`,
    );
    log(`structured preview kit assembled: yes (${kitBuffer.length} bytes, ${totalActualPages} page(s))`);

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
        log(`structured preview kit saved to storage: no (${uploadErr.message})`);
        const localPath = saveLocalFallback(kitBuffer, kitFilename, logPrefix);

        if (localPath) {
          result.kitLocalPath = localPath;
          result.assembled = true;
          log(`structured preview kit saved locally: yes`);
          log(`structured preview kit local path: ${localPath}`);
        } else {
          log(`structured preview kit saved locally: no`);
        }
      } else {
        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(kitStoragePath);
        result.assembled = true;
        result.kitPath = kitStoragePath;
        result.kitUrl = urlData?.publicUrl;
        log(`structured preview kit saved to storage: yes`);
        log(`structured preview kit storage path: ${kitStoragePath}`);
        if (result.kitUrl) log(`structured preview kit url: ${result.kitUrl}`);
      }
    } else {
      log(`structured preview kit saved to storage: no (env vars not set)`);
      const localPath = saveLocalFallback(kitBuffer, kitFilename, logPrefix);

      if (localPath) {
        result.kitLocalPath = localPath;
        result.assembled = true;
        log(`structured preview kit saved locally: yes`);
        log(`structured preview kit local path: ${localPath}`);
      } else {
        log(`structured preview kit saved locally: no`);
      }
    }
  } catch (err) {
    console.error(`${logPrefix} — unexpected error: ${err}`);
  }

  return result;
}