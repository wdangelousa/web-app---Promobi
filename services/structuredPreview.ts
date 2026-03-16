/**
 * services/structuredPreview.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Internal preview persistence for structured certificate HTML/PDF artefacts.
 *
 * Saves the deterministic HTML from marriageCertRenderer (and optionally a PDF
 * rendered via Gotenberg) to Supabase Storage under orders/previews/ for
 * internal manual inspection.
 *
 * Invariants:
 *   - Never writes to the database.
 *   - Never modifies Document, Order, delivery_pdf_url, or translation_status.
 *   - Never affects the legacy pipeline or generateDeliveryKit.ts.
 *   - Never exposes artefacts to the client by default.
 *   - Never throws — all errors are caught and reflected in StructuredPreviewResult.
 *
 * This module is only imported when ENABLE_STRUCTURED_PREVIEW=true (dynamic
 * import in structuredPipeline.ts), so it has zero footprint when disabled.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_BUCKET = 'documents';

// Gotenberg endpoint — same service used by generateDeliveryKit.ts.
// Allow override via env var for environments where the port differs.
const GOTENBERG_URL =
  process.env.GOTENBERG_URL ?? 'http://127.0.0.1:3001/forms/chromium/convert/html';

// Paper: US Letter portrait — mirrors the official PDF_ENGINE in generateDeliveryKit.ts
// exactly. Keeping these in sync ensures the structured preview is visually comparable
// to the official kit and any side-by-side comparison reflects real layout differences.
const GOTENBERG_LETTER_SETTINGS: Record<string, string> = {
  paperWidth: '8.5',
  paperHeight: '11',
  marginTop: '1.8',
  marginBottom: '1.2',
  marginLeft: '0.8',
  marginRight: '0.8',
  scale: '0.85',
  printBackground: 'true',
  preferCssPageSize: 'false',
  skipNetworkIdleEvent: 'true',
};

// Paper: US Letter landscape — for landscape-oriented certificate previews.
// Width and height are swapped from the portrait settings above.
// All four margins are equal (0.8in) for balanced landscape certificate layout.
const GOTENBERG_LANDSCAPE_SETTINGS: Record<string, string> = {
  paperWidth: '11',
  paperHeight: '8.5',
  marginTop: '0.8',
  marginBottom: '0.8',
  marginLeft: '0.8',
  marginRight: '0.8',
  scale: '0.85',
  printBackground: 'true',
  preferCssPageSize: 'false',
  skipNetworkIdleEvent: 'true',
};

// Letterhead: public/letterhead.png — confirmed present in the project root.
// Loaded as a base64 data URI and injected into each .page block of the preview HTML.
// The .letterhead-img CSS rule in marriageCertRenderer.ts constrains its height so it
// cannot push page content off the page and corrupt the 1:1 page mapping.
const LETTERHEAD_PATH = join(process.cwd(), 'public', 'letterhead.png');

// Local fallback directory for development environments where Supabase Storage
// is unavailable (e.g. bucket doesn't exist, wrong project, or no service key).
// Files land at .artifacts/structured-previews/ relative to the project root.
const LOCAL_ARTIFACTS_DIR = join(process.cwd(), '.artifacts', 'structured-previews');

// ── Local fallback helper ─────────────────────────────────────────────────────

/**
 * Writes a buffer to LOCAL_ARTIFACTS_DIR/{filename}, creating the directory if
 * needed. Returns the absolute path on success, or null on any error.
 * Never throws.
 */
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

// ── Letterhead helpers ────────────────────────────────────────────────────────

/**
 * Reads public/letterhead.png and returns a base64 data URI, or null on any error.
 * Safe to call at runtime — never throws.
 */
function loadLetterheadDataUri(): string | null {
  try {
    const buf = readFileSync(LETTERHEAD_PATH);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Injects a letterhead <img> at the start of every <div class="page"> block.
 * Uses a simple global string replace — safe because the renderer always emits
 * exactly this markup for page wrappers.
 * The .letterhead-img CSS rule (in marriageCertRenderer.ts) constrains max-height
 * to 1.0in, preventing the image from displacing content across pages.
 */
function injectLetterheadIntoHtml(html: string, dataUri: string): string {
  const imgTag = `<img class="letterhead-img" src="${dataUri}" alt="" />`;
  // Matches <div class="page"> with any optional additional attributes,
  // so landscape pages (data-orientation="landscape") are also covered.
  return html.replace(/<div class="page"([^>]*)>/g, `<div class="page"$1>${imgTag}`);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StructuredPreviewResult {
  htmlSaved: boolean;
  htmlPath?: string;
  htmlUrl?: string;
  pdfSaved: boolean;
  pdfPath?: string;
  pdfUrl?: string;
  /** Absolute local filesystem path when Supabase HTML upload failed and local fallback succeeded. */
  htmlLocalPath?: string;
  /** Absolute local filesystem path when Supabase PDF upload failed and local fallback succeeded. */
  pdfLocalPath?: string;
  /** True when public/letterhead.png is found in the project root at runtime. */
  letterheadDetected: boolean;
  /**
   * Always false in the current implementation.
   * Will become true once letterhead embedding is implemented in a future step.
   */
  letterheadReused: boolean;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Saves a structured HTML preview (and optionally a PDF) to Supabase Storage.
 *
 * Storage paths follow the same bucket used by generateDeliveryKit.ts:
 *   orders/previews/structured-{documentId}-{timestamp}.html
 *   orders/previews/structured-{documentId}-{timestamp}.pdf
 *
 * @param html                  Rendered HTML (from any structured renderer).
 * @param documentId            Document identifier for the filename.
 * @param orderId               Order identifier (log context only).
 * @param options.generatePdf   When true, renders HTML→PDF via Gotenberg.
 * @param options.orientation   'landscape' → use GOTENBERG_LANDSCAPE_SETTINGS;
 *                              otherwise use GOTENBERG_LETTER_SETTINGS (default).
 */
export async function saveStructuredPreview(
  html: string,
  documentId: string | number,
  orderId: string | number,
  options: { generatePdf?: boolean; orientation?: 'portrait' | 'landscape' | 'unknown' } = {},
): Promise<StructuredPreviewResult> {
  const result: StructuredPreviewResult = {
    htmlSaved: false,
    pdfSaved: false,
    letterheadDetected: false,
    letterheadReused: false,
  };

  // ── Paper size alignment ──────────────────────────────────────────────────
  const isLandscape = options.orientation === 'landscape';
  const paperLabel = isLandscape ? 'US Letter landscape (11 × 8.5in)' : 'US Letter (8.5 × 11in)';
  console.log(
    `[structuredPreview] Order #${orderId} Doc #${documentId} — ` +
    `official paper size detected: ${paperLabel}`,
  );
  console.log(
    `[structuredPreview] Order #${orderId} Doc #${documentId} — ` +
    `structured preview paper size applied: ${paperLabel}`,
  );

  // ── Letterhead detection + injection ─────────────────────────────────────
  // Detects public/letterhead.png, loads it as a base64 data URI, and injects
  // a <img class="letterhead-img"> at the top of each .page block.
  // If loading or injection fails, the preview proceeds without letterhead.
  try {
    result.letterheadDetected = existsSync(LETTERHEAD_PATH);
  } catch {
    // Non-critical — existsSync failure leaves letterheadDetected as false.
  }

  let htmlForSaving = html;
  if (result.letterheadDetected) {
    const dataUri = loadLetterheadDataUri();
    if (dataUri) {
      try {
        htmlForSaving = injectLetterheadIntoHtml(html, dataUri);
        result.letterheadReused = true;
        console.log(
          `[structuredPreview] Order #${orderId} Doc #${documentId} — letterhead embedded in preview: yes`,
        );
      } catch (injectErr) {
        console.error(
          `[structuredPreview] Order #${orderId} Doc #${documentId} — ` +
          `letterhead injection error: ${injectErr} — proceeding without letterhead`,
        );
      }
    } else {
      console.log(
        `[structuredPreview] Order #${orderId} Doc #${documentId} — letterhead embedded in preview: no (readFileSync failed)`,
      );
    }
  } else {
    console.log(
      `[structuredPreview] Order #${orderId} Doc #${documentId} — letterhead embedded in preview: no (file not found at ${LETTERHEAD_PATH})`,
    );
  }

  // ── Supabase client (service role — server-side only) ─────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(
      `[structuredPreview] Order #${orderId} Doc #${documentId} — ` +
      'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; cannot save preview.',
    );
    return result;
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Storage paths ─────────────────────────────────────────────────────────
  const timestamp = Date.now();
  const baseName = `structured-${documentId}-${timestamp}`;
  const htmlPath = `orders/previews/${baseName}.html`;
  const pdfPath = `orders/previews/${baseName}.pdf`;

  // ── Save HTML ─────────────────────────────────────────────────────────────
  try {
    const htmlBuffer = Buffer.from(htmlForSaving, 'utf-8');
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(htmlPath, htmlBuffer, {
        contentType: 'text/html; charset=utf-8',
        upsert: true,
      });

    if (uploadErr) {
      console.error(
        `[structuredPreview] Order #${orderId} Doc #${documentId} — ` +
        `HTML upload error: ${uploadErr.message}`,
      );
      console.log(
        `[structuredPreview] Order #${orderId} Doc #${documentId} — structured html preview saved to storage: no`,
      );
      const localPath = saveLocalFallback(
        htmlBuffer,
        `${baseName}.html`,
        `[structuredPreview] Order #${orderId} Doc #${documentId} —`,
      );
      if (localPath) {
        result.htmlLocalPath = localPath;
        console.log(
          `[structuredPreview] Order #${orderId} Doc #${documentId} — structured html preview saved locally: yes`,
        );
        console.log(
          `[structuredPreview] Order #${orderId} Doc #${documentId} — structured html local path: ${localPath}`,
        );
      } else {
        console.log(
          `[structuredPreview] Order #${orderId} Doc #${documentId} — structured html preview saved locally: no`,
        );
      }
    } else {
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(htmlPath);
      result.htmlSaved = true;
      result.htmlPath = htmlPath;
      result.htmlUrl = urlData?.publicUrl;
      console.log(
        `[structuredPreview] Order #${orderId} Doc #${documentId} — structured html preview saved to storage: yes`,
      );
    }
  } catch (err) {
    console.error(
      `[structuredPreview] Order #${orderId} Doc #${documentId} — ` +
      `HTML save unexpected error: ${err}`,
    );
  }

  // ── Optional: Generate PDF via Gotenberg ──────────────────────────────────
  if (options.generatePdf) {
    try {
      const formData = new FormData();
      const htmlBlob = new Blob([htmlForSaving], { type: 'text/html' });
      formData.append('files', htmlBlob, 'index.html');
      for (const [k, v] of Object.entries(isLandscape ? GOTENBERG_LANDSCAPE_SETTINGS : GOTENBERG_LETTER_SETTINGS)) {
        formData.append(k, v);
      }

      const gotenbergRes = await fetch(GOTENBERG_URL, {
        method: 'POST',
        body: formData,
      });

      if (!gotenbergRes.ok) {
        const errText = await gotenbergRes.text();
        console.error(
          `[structuredPreview] Order #${orderId} Doc #${documentId} — ` +
          `Gotenberg error ${gotenbergRes.status}: ${errText}`,
        );
      } else {
        const pdfBuffer = Buffer.from(await gotenbergRes.arrayBuffer());
        const { error: pdfUploadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(pdfPath, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (pdfUploadErr) {
          console.error(
            `[structuredPreview] Order #${orderId} Doc #${documentId} — ` +
            `PDF upload error: ${pdfUploadErr.message}`,
          );
          console.log(
            `[structuredPreview] Order #${orderId} Doc #${documentId} — structured pdf preview saved to storage: no`,
          );
          const localPath = saveLocalFallback(
            pdfBuffer,
            `${baseName}.pdf`,
            `[structuredPreview] Order #${orderId} Doc #${documentId} —`,
          );
          if (localPath) {
            result.pdfLocalPath = localPath;
            console.log(
              `[structuredPreview] Order #${orderId} Doc #${documentId} — structured pdf preview saved locally: yes`,
            );
            console.log(
              `[structuredPreview] Order #${orderId} Doc #${documentId} — structured pdf local path: ${localPath}`,
            );
          } else {
            console.log(
              `[structuredPreview] Order #${orderId} Doc #${documentId} — structured pdf preview saved locally: no`,
            );
          }
        } else {
          const { data: urlData } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(pdfPath);
          result.pdfSaved = true;
          result.pdfPath = pdfPath;
          result.pdfUrl = urlData?.publicUrl;
          console.log(
            `[structuredPreview] Order #${orderId} Doc #${documentId} — structured pdf preview saved to storage: yes`,
          );
        }
      }
    } catch (err) {
      console.error(
        `[structuredPreview] Order #${orderId} Doc #${documentId} — ` +
        `PDF generation unexpected error: ${err}`,
      );
    }
  }

  return result;
}
