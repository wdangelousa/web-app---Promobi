/**
 * lib/documentOrientationDetector.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Orientation detection utility for original source documents.
 *
 * Determines whether a document is portrait, landscape, or of unknown
 * orientation, using actual PDF page dimensions as the sole source of truth.
 *
 * Rules:
 *   page width > page height  → landscape
 *   page height >= page width → portrait
 *   any other case            → unknown
 *
 * Design principles:
 *   - Never guesses from file name or OCR
 *   - No new dependencies — uses pdf-lib, already a project dependency
 *   - Never throws — always returns a safe result
 *   - Accepts a pre-loaded PDFDocument to avoid duplicate buffer parsing
 *     (the caller is expected to hold an open PDFDocument from a prior load)
 *   - Non-PDF files → 'unknown' (no safe internal way to determine orientation
 *     without additional heavy dependencies)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { PDFDocument } from 'pdf-lib';

// ── Public types ──────────────────────────────────────────────────────────────

export type DocumentOrientation = 'portrait' | 'landscape' | 'unknown';

export interface OrientationResult {
  /** Detected orientation of the document. */
  orientation: DocumentOrientation;
  /** How orientation was determined. */
  source: 'pdf-dimensions' | 'unavailable';
}

// ── Detector ──────────────────────────────────────────────────────────────────

/**
 * Detects page orientation from an already-loaded PDFDocument.
 *
 * Uses the first page (index 0) as the canonical orientation reference.
 * The caller is responsible for the PDFDocument.load() — this function
 * reuses the loaded object to avoid a second buffer parse.
 *
 * Never throws. Returns { orientation: 'unknown', source: 'unavailable' }
 * on any error or when dimensions cannot be read.
 */
export function detectOrientationFromPdfDoc(pdfDoc: PDFDocument): OrientationResult {
  try {
    if (pdfDoc.getPageCount() === 0) {
      return { orientation: 'unknown', source: 'unavailable' };
    }
    const page   = pdfDoc.getPage(0);
    const width  = page.getWidth();
    const height = page.getHeight();
    if (width > 0 && height > 0) {
      return {
        orientation: width > height ? 'landscape' : 'portrait',
        source: 'pdf-dimensions',
      };
    }
    return { orientation: 'unknown', source: 'unavailable' };
  } catch {
    return { orientation: 'unknown', source: 'unavailable' };
  }
}
