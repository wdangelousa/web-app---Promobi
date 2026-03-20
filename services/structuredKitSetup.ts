/**
 * services/structuredKitSetup.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared setup resolver for the structured kit pipeline.
 *
 * Eliminates ~150 lines of duplicated boilerplate that previously lived
 * independently in both previewStructuredKit.ts and generateDeliveryKit.ts.
 *
 * Handles:
 *   1. Fetching the original source file
 *   2. Extracting PDF page count + detecting orientation
 *   3. Resolving source page count (including grouped image hint)
 *
 * Does NOT handle:
 *   - DB reads (callers own their own Prisma queries)
 *   - Classification (callers pass translatedText which may differ)
 *   - Rendering (callers call renderStructuredFamilyDocument)
 *   - Upload or persistence (surfaces differ)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PDFDocument } from 'pdf-lib';
import { detectOrientationFromPdfDoc, type DocumentOrientation } from '@/lib/documentOrientationDetector';
import {
  isLikelyImageSource,
  resolveGroupedSourceImageCountHintFromOrderMetadata,
  resolveSourcePageCount,
} from '@/lib/sourcePageCountResolver';

export interface KitSetupInput {
  originalFileUrl: string | null | undefined;
  exactNameOnDoc: string | null | undefined;
  documentId: number;
  parsedOrderMetadata: Record<string, unknown>;
  logPrefix: string;
}

export interface KitSetupResult {
  originalFileBuffer: ArrayBuffer;
  isOriginalPdf: boolean;
  contentType: string;
  detectedOrientation: DocumentOrientation;
  sourcePageCount: number | undefined;
  sourceArtifactType: string | undefined;
  sourcePageCountStrategy: string | undefined;
  groupedSourceImageCountHint: number | null;
  extractedPdfPageCount: number | null;
  /**
   * True when the original file fetch was attempted but failed (non-ok HTTP
   * status, network error, or missing originalFileUrl). Callers must check
   * this and return an explicit error rather than silently building an
   * incomplete kit.
   */
  originalFetchFailed: boolean;
}

export async function resolveKitSetup(input: KitSetupInput): Promise<KitSetupResult> {
  const { originalFileUrl, exactNameOnDoc, documentId, parsedOrderMetadata, logPrefix } = input;

  // ── Step 1: Fetch original file ───────────────────────────────────────────

  let originalFileBuffer: ArrayBuffer = new ArrayBuffer(0);
  let isOriginalPdf = false;
  let contentType = 'application/octet-stream';
  let originalFetchFailed = false;

  if (!originalFileUrl) {
    originalFetchFailed = true;
    console.warn(`${logPrefix} — original file URL is missing; cannot assemble complete kit`);
  } else {
    try {
      const res = await fetch(originalFileUrl);
      if (res.ok) {
        originalFileBuffer = await res.arrayBuffer();
        contentType = res.headers.get('content-type') ?? 'application/octet-stream';
        isOriginalPdf =
          contentType.includes('pdf') ||
          originalFileUrl.toLowerCase().includes('.pdf');
        if (originalFileBuffer.byteLength === 0) {
          originalFetchFailed = true;
          console.warn(`${logPrefix} — original file fetched but returned empty body (${originalFileUrl})`);
        }
      } else {
        originalFetchFailed = true;
        console.warn(
          `${logPrefix} — original file fetch returned HTTP ${res.status} for ${originalFileUrl}; ` +
          `kit will be incomplete without the original`,
        );
      }
    } catch (fetchErr) {
      originalFetchFailed = true;
      console.warn(`${logPrefix} — original file fetch threw: ${fetchErr}`);
    }
  }

  // ── Step 2: PDF page count + orientation ─────────────────────────────────

  let detectedOrientation: DocumentOrientation = 'unknown';
  let extractedPdfPageCount: number | null = null;

  if (isOriginalPdf && originalFileBuffer.byteLength > 0) {
    try {
      const pdfDoc = await PDFDocument.load(originalFileBuffer, { ignoreEncryption: true });
      extractedPdfPageCount = pdfDoc.getPageCount();
      const orientResult = detectOrientationFromPdfDoc(pdfDoc);
      detectedOrientation = orientResult.orientation;
      console.log(
        `${logPrefix} — original pages: ${extractedPdfPageCount}, orientation: ${detectedOrientation}`,
      );
    } catch {
      console.warn(`${logPrefix} — PDF metadata extraction failed`);
    }
  }

  // ── Step 3: Grouped image count hint + source page resolution ─────────────

  const groupedSourceImageCountHint = resolveGroupedSourceImageCountHintFromOrderMetadata({
    orderMetadata: parsedOrderMetadata,
    documentId,
    originalFileUrl: originalFileUrl ?? null,
    exactNameOnDoc: exactNameOnDoc ?? null,
  });

  const sourcePageResolution = await resolveSourcePageCount({
    fileUrl: originalFileUrl,
    contentType,
    fileBuffer: originalFileBuffer,
    isPdfHint: isOriginalPdf,
    pdfPageCountHint: extractedPdfPageCount,
    explicitPageCountHint: groupedSourceImageCountHint,
    groupedSourceImageCountHint,
    hybridSinglePageEvidence:
      groupedSourceImageCountHint === 1 &&
      !isOriginalPdf &&
      !isLikelyImageSource(originalFileUrl, contentType),
  });

  console.log(
    `${logPrefix} — source page count resolution: ${JSON.stringify({
      docId: documentId,
      sourceArtifactType: sourcePageResolution.sourceArtifactType,
      sourcePageCountStrategy: sourcePageResolution.sourcePageCountStrategy,
      resolvedSourcePageCount: sourcePageResolution.resolvedSourcePageCount,
      sourceContentType: contentType,
      groupedSourceImageCountHint: groupedSourceImageCountHint ?? null,
      parityStatus: sourcePageResolution.parityVerifiable ? 'resolvable' : 'indeterminate',
    })}`,
  );

  return {
    originalFileBuffer,
    isOriginalPdf,
    contentType,
    detectedOrientation,
    sourcePageCount: sourcePageResolution.resolvedSourcePageCount ?? undefined,
    sourceArtifactType: sourcePageResolution.sourceArtifactType,
    sourcePageCountStrategy: sourcePageResolution.sourcePageCountStrategy,
    groupedSourceImageCountHint,
    extractedPdfPageCount,
    originalFetchFailed,
  };
}
