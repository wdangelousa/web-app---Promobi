'use server';

/**
 * app/actions/previewStructuredKit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * On-demand server action: generates a structured preview kit for a document.
 *
 * Called when the operator clicks "Preview Kit" in the Workbench and selects
 * a cover language variant (PT→EN or ES→EN) from the language modal.
 *
 * This action:
 *   1. Loads the document's original file URL and metadata from the DB.
 *   2. Fetches the original source file buffer.
 *   3. Classifies the document type from available signals (using
 *      effectiveTranslatedText, not raw doc.translatedText, so editor content
 *      is factored in when the operator hasn't saved yet).
 *   4. If the family is supported, it MUST render through the shared
 *      structured renderer. Legacy output is blocked for that family.
 *   5. If the family is unknown/unsupported, it uses the legacy translated
 *      HTML wrapper as the only allowed fallback.
 *   6. Calls assembleStructuredPreviewKit with the resolved HTML.
 *   7. Returns the preview kit URL.
 *
 * Guarantees:
 *   - Never modifies DB records, delivery_pdf_url, or translation_status.
 *   - Never affects the official delivery flow.
 *   - Never throws — errors are caught and returned as { success: false }.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import {
  assembleStructuredPreviewKit,
  buildTranslatedDocumentHtml,
} from '@/services/structuredPreviewKit';
import { classifyDocument } from '@/services/documentClassifier';
import {
  detectOrientationFromPdfDoc,
  type DocumentOrientation,
} from '@/lib/documentOrientationDetector';
import {
  formatStructuredRenderingFailureMessage,
  isSupportedStructuredDocumentType,
  renderSupportedStructuredDocument,
} from '@/services/structuredDocumentRenderer';

// ── Main export ───────────────────────────────────────────────────────────────

export async function previewStructuredKit(
  orderId: number,
  documentId: number,
  /**
   * Cover language from the Editor language modal.
   * Accepted values: 'PT_BR' (Portuguese → English) or 'ES' (Spanish → English).
   * Any unrecognised value defaults to 'pt-en'.
   */
  coverLang: string,
  /**
   * Current editor HTML from the Workbench UI (unsaved draft).
   * When provided and non-empty, this takes priority over the saved
   * translatedText in the database — allowing operators to preview
   * in-progress translations without requiring a save first.
   */
  editorHtml?: string,
): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  const coverVariant: 'pt-en' | 'es-en' =
    coverLang.toUpperCase() === 'ES' ? 'es-en' : 'pt-en';

  const logPrefix = `[previewStructuredKit] Order #${orderId} Doc #${documentId}`;

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        translatedText: true,
        originalFileUrl: true,
        sourceLanguage: true,
        docType: true,
        exactNameOnDoc: true,
      },
    });

    if (!doc) {
      return { success: false, error: `Document #${documentId} not found` };
    }

    // Resolve translated content: editor (most current) › saved DB record › absent
    const effectiveTranslatedText: string | null =
      editorHtml && editorHtml.trim().length > 0
        ? editorHtml
        : doc.translatedText && doc.translatedText.trim().length > 0
          ? doc.translatedText
          : null;

    const effectiveSource =
      editorHtml && editorHtml.trim().length > 0 ? 'editor' : 'db';
    console.log(
      `${logPrefix} — effective translated content: ${
        effectiveTranslatedText === null
          ? 'ABSENT (editor: none, db: none)'
          : `present (${effectiveTranslatedText.length} chars, source: ${effectiveSource})`
      }`,
    );

    // ── Step 1: Fetch original file ─────────────────────────────────────────

    let originalFileBuffer: ArrayBuffer = new ArrayBuffer(0);
    let isOriginalPdf = false;
    let contentType = 'application/octet-stream';

    if (doc.originalFileUrl) {
      try {
        const res = await fetch(doc.originalFileUrl);
        if (res.ok) {
          originalFileBuffer = await res.arrayBuffer();
          contentType = res.headers.get('content-type') ?? 'application/octet-stream';
          isOriginalPdf =
            contentType.includes('pdf') ||
            doc.originalFileUrl.toLowerCase().includes('.pdf');
        }
      } catch {
        // Original file unavailable — kit will be assembled without Part 3.
        console.warn(`${logPrefix} — original file fetch failed`);
      }
    }

    // ── Step 2: Get page count and orientation from original PDF ────────────

    let sourcePageCount: number | undefined;
    let detectedOrientation: DocumentOrientation = 'unknown';

    if (isOriginalPdf && originalFileBuffer.byteLength > 0) {
      try {
        const pdfDoc = await PDFDocument.load(originalFileBuffer, {
          ignoreEncryption: true,
        });
        sourcePageCount = pdfDoc.getPageCount();
        const orientResult = detectOrientationFromPdfDoc(pdfDoc);
        detectedOrientation = orientResult.orientation;
        console.log(
          `${logPrefix} — original pages: ${sourcePageCount}, orientation: ${detectedOrientation}`,
        );
      } catch {
        console.warn(`${logPrefix} — PDF metadata extraction failed`);
      }
    }

    // ── Step 3: Classify document type ──────────────────────────────────────
    //
    // Use effectiveTranslatedText (editor content first, then DB) so the
    // classifier has access to the current translation even when it hasn't been
    // saved yet (e.g. documents with externalTranslationUrl set).

    const documentLabelHint =
      [doc.exactNameOnDoc, doc.docType].filter(Boolean).join(' ').trim() || undefined;

    const classification = classifyDocument({
      fileUrl: doc.originalFileUrl ?? undefined,
      documentLabel: documentLabelHint,
      translatedText: effectiveTranslatedText ?? '',
      sourceLanguage: doc.sourceLanguage ?? undefined,
    });

    console.log(
      `${logPrefix} — document type classified: ${classification.documentType} ` +
      `(confidence: ${classification.confidence})`,
    );

    // ── Step 4: Resolve preview HTML under the global structured policy ─────
    //
    // Supported family:
    //   structured render succeeds → use it
    //   structured render fails    → explicit product error
    //   legacy fallback            → forbidden
    //
    // Unsupported / unknown family:
    //   legacy translated HTML remains allowed.

    let structuredHtml: string;
    // orientationForKit: the orientation to pass to assembleStructuredPreviewKit.
    // May differ from detectedOrientation depending on per-family override logic.
    let orientationForKit: DocumentOrientation = detectedOrientation;
    if (isSupportedStructuredDocumentType(classification.documentType)) {
      try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const resolved = await renderSupportedStructuredDocument({
          client,
          documentType: classification.documentType,
          originalFileBuffer,
          originalFileUrl: doc.originalFileUrl,
          contentType,
          sourcePageCount,
          detectedOrientation,
          logPrefix,
        });

        structuredHtml = resolved.structuredHtml;
        orientationForKit = resolved.orientationForKit;

        console.log(
          `${logPrefix} — structured renderer enforced for ${classification.documentType} ` +
          `(${structuredHtml.length} chars, pages: ${sourcePageCount ?? 'n/a'}, orientation: ${orientationForKit})`,
        );
      } catch (err) {
        return {
          success: false,
          error: formatStructuredRenderingFailureMessage(classification.documentType, err),
        };
      }
    } else {
      // Truly unsupported family (unknown) — legacy is the correct and only path.
      console.log(
        `${logPrefix} — non-structured document type (${classification.documentType}); using legacy HTML`,
      );
      if (!effectiveTranslatedText) {
        return {
          success: false,
          error: 'This document has no translated content. Add the translation in the workbench editor, then generate the preview kit again.',
        };
      }
      structuredHtml = buildTranslatedDocumentHtml(effectiveTranslatedText, orientationForKit === 'landscape' ? 'landscape' : 'portrait');
    }

    // ── Step 5: Assemble the preview kit ────────────────────────────────────

    // Cover logic, original-append logic, letterhead PNG overlay, and Gotenberg
    // margins are all handled inside assembleStructuredPreviewKit — unchanged.

    const kit = await assembleStructuredPreviewKit({
      structuredHtml,
      originalFileBuffer,
      isOriginalPdf,
      orderId,
      documentId,
      sourceLanguage: doc.sourceLanguage ?? 'pt',
      coverVariant,
      documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? 'Document',
      sourcePageCount,
      orientation: orientationForKit === 'landscape' ? 'landscape' : undefined,
    });

    if (!kit.assembled) {
      return {
        success: false,
        error: isSupportedStructuredDocumentType(classification.documentType)
          ? `Structured preview kit assembly failed for "${classification.documentType}". Legacy fallback is blocked for supported document families. Check server logs for Gotenberg/assembly details.`
          : 'Preview kit assembly failed — check server logs for details',
      };
    }

    return {
      success: true,
      previewUrl: kit.kitUrl ?? kit.kitLocalPath ?? undefined,
    };
  } catch (err: any) {
    console.error(`${logPrefix} — unexpected error: ${err}`);
    return { success: false, error: err?.message ?? String(err) };
  }
}
