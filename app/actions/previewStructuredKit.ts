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
 *   4. Enforces the global client-facing rendering invariant:
 *      translated preview output MUST pass through a structured family renderer.
 *      Missing/unknown family is an explicit blocking error.
 *   5. Never falls back to linear/plain rendering.
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
} from '@/services/structuredPreviewKit';
import { classifyDocument } from '@/services/documentClassifier';
import {
  detectOrientationFromPdfDoc,
  type DocumentOrientation,
} from '@/lib/documentOrientationDetector';
import {
  assertStructuredClientFacingRender,
  formatStructuredRenderingFailureMessage,
  type StructuredRenderLanguageIntegrity,
  renderStructuredFamilyDocument,
} from '@/services/structuredDocumentRenderer';
import {
  parseOrderMetadata,
  resolveTranslationArtifactSelection,
} from '@/lib/translationArtifactSource';
import {
  isLikelyImageSource,
  resolveGroupedSourceImageCountHintFromOrderMetadata,
  resolveSourcePageCount,
} from '@/lib/sourcePageCountResolver';

function buildExternalOverrideLanguageIntegrity(
  sourceLanguage?: string | null,
): StructuredRenderLanguageIntegrity {
  return {
    targetLanguage: 'EN',
    sourceLanguage: (sourceLanguage ?? 'unknown').toUpperCase(),
    translatedPayloadFound: true,
    translatedZonesCount: null,
    sourceZonesCount: null,
    missingTranslatedZones: [],
    sourceContentAttempted: false,
    sourceLanguageMarkers: [],
    requiredZones: [],
    translatedZonesFound: [],
    sourceLanguageContaminatedZones: [],
    mappedGenericZones: [],
    languageIssueType: 'none',
  };
}

async function generatePreviewFromExternalPdf(params: {
  orderId: number;
  documentId: number;
  logPrefix: string;
  externalTranslationUrl: string;
  sourceLanguage?: string | null;
  docTypeLabel: string;
  coverVariant: 'pt-en' | 'es-en';
  originalFileBuffer: ArrayBuffer;
  isOriginalPdf: boolean;
  sourcePageCount?: number;
  sourceArtifactType?: string;
  sourcePageCountStrategy?: string;
  groupedSourceImageCountHint?: number | null;
  originalFileUrl?: string | null;
  originalContentType?: string | null;
  orientation: DocumentOrientation;
}): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  const res = await fetch(params.externalTranslationUrl);
  if (!res.ok) {
    return {
      success: false,
      error: `External translated PDF fetch failed (${res.status}).`,
    };
  }

  const externalPdfBuffer = await res.arrayBuffer();
  if (externalPdfBuffer.byteLength === 0) {
    return { success: false, error: 'External translated PDF is empty.' };
  }

  const kit = await assembleStructuredPreviewKit({
    structuredHtml: '',
    externalTranslatedPdfBuffer: externalPdfBuffer,
    originalFileBuffer: params.originalFileBuffer,
    isOriginalPdf: params.isOriginalPdf,
    orderId: params.orderId,
    documentId: params.documentId,
    sourceLanguage: params.sourceLanguage ?? 'pt',
    targetLanguage: 'EN',
    coverVariant: params.coverVariant,
    documentTypeLabel: params.docTypeLabel,
    sourcePageCount: params.sourcePageCount,
    sourceArtifactType: params.sourceArtifactType,
    sourcePageCountStrategy: params.sourcePageCountStrategy,
    groupedSourceImageCount: params.groupedSourceImageCountHint ?? undefined,
    originalFileUrl: params.originalFileUrl,
    originalContentType: params.originalContentType,
    orientation: params.orientation === 'landscape' ? 'landscape' : undefined,
    documentFamily: 'external_translation',
    rendererName: 'externalPdfOverride',
    surface: 'preview-kit',
    compactionAttempted: false,
    languageIntegrity: buildExternalOverrideLanguageIntegrity(params.sourceLanguage),
  });

  if (!kit.assembled) {
    const detail =
      kit.blockingReason === 'page_parity_mismatch'
        ? ` Page parity failed: source=${kit.sourcePageCount ?? 'unknown'}, translated=${kit.translatedPageCount ?? 'unknown'}.`
        : kit.blockingReason === 'page_parity_unverifiable_source_page_count'
          ? ' Page parity failed: source page count is unavailable, so parity cannot be verified.'
          : '';
    return {
      success: false,
      error:
        `Structured preview kit assembly failed for external translated PDF.` +
        detail +
        ` Check server logs for parity diagnostics and kit assembly details.`,
    };
  }

  console.log(`${params.logPrefix} — external translation override applied for preview kit`);
  return {
    success: true,
    previewUrl: kit.kitUrl ?? kit.kitLocalPath ?? undefined,
  };
}

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
        orderId: true,
        translatedText: true,
        translatedFileUrl: true,
        externalTranslationUrl: true,
        originalFileUrl: true,
        sourceLanguage: true,
        docType: true,
        exactNameOnDoc: true,
        order: {
          select: {
            metadata: true,
          },
        },
      },
    });

    if (!doc) {
      return { success: false, error: `Document #${documentId} not found` };
    }

    const artifactSelection = resolveTranslationArtifactSelection({
      externalTranslationUrl: doc.externalTranslationUrl,
      translatedText: doc.translatedText,
      translatedFileUrl: doc.translatedFileUrl,
    });

    console.log(
      `${logPrefix} — translation artifact selection: ${JSON.stringify({
        orderId,
        docId: documentId,
        surface: 'preview-kit',
        externalTranslationUrlPresent: artifactSelection.externalTranslationUrlPresent
          ? 'yes'
          : 'no',
        selectedTranslationArtifactSource: artifactSelection.source,
        selectedArtifactUrlOrPath: artifactSelection.selectedArtifactUrl,
        previewUsedExternalPdf:
          artifactSelection.source === 'external_pdf' ? 'yes' : 'no',
      })}`,
    );

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

    // ── Step 2: Resolve source page count + orientation ─────────────────────

    let sourcePageCount: number | undefined;
    let detectedOrientation: DocumentOrientation = 'unknown';
    let sourceArtifactType: string | undefined;
    let sourcePageCountStrategy: string | undefined;

    const parsedOrderMetadata = parseOrderMetadata(
      doc.order?.metadata as string | null | undefined,
    );
    const groupedSourceImageCountHint = resolveGroupedSourceImageCountHintFromOrderMetadata({
      orderMetadata: parsedOrderMetadata,
      documentId: doc.id,
      originalFileUrl: doc.originalFileUrl,
      exactNameOnDoc: doc.exactNameOnDoc ?? null,
    });
    let extractedPdfPageCount: number | null = null;

    if (isOriginalPdf && originalFileBuffer.byteLength > 0) {
      try {
        const pdfDoc = await PDFDocument.load(originalFileBuffer, {
          ignoreEncryption: true,
        });
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

    const sourcePageResolution = await resolveSourcePageCount({
      fileUrl: doc.originalFileUrl,
      contentType,
      fileBuffer: originalFileBuffer,
      isPdfHint: isOriginalPdf,
      pdfPageCountHint: extractedPdfPageCount,
      explicitPageCountHint: groupedSourceImageCountHint,
      groupedSourceImageCountHint,
      hybridSinglePageEvidence:
        groupedSourceImageCountHint === 1 &&
        !isOriginalPdf &&
        !isLikelyImageSource(doc.originalFileUrl, contentType),
    });

    sourcePageCount = sourcePageResolution.resolvedSourcePageCount ?? undefined;
    sourceArtifactType = sourcePageResolution.sourceArtifactType;
    sourcePageCountStrategy = sourcePageResolution.sourcePageCountStrategy;

    console.log(
      `${logPrefix} — source page count resolution: ${JSON.stringify({
        orderId,
        docId: documentId,
        sourceArtifactType,
        sourcePageCountStrategy,
        resolvedSourcePageCount: sourcePageResolution.resolvedSourcePageCount,
        sourceContentType: contentType,
        groupedSourceImageCountHint: groupedSourceImageCountHint ?? null,
        parityStatus: sourcePageResolution.parityVerifiable ? 'resolvable' : 'indeterminate',
      })}`,
    );

    // ── External translated PDF override ─────────────────────────────────────
    if (
      artifactSelection.source === 'external_pdf' &&
      artifactSelection.selectedArtifactUrl
    ) {
      return await generatePreviewFromExternalPdf({
        orderId,
        documentId,
        logPrefix,
        externalTranslationUrl: artifactSelection.selectedArtifactUrl,
        sourceLanguage: doc.sourceLanguage,
        docTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? 'Document',
        coverVariant,
        originalFileBuffer,
        isOriginalPdf,
        sourcePageCount,
        sourceArtifactType,
        sourcePageCountStrategy,
        groupedSourceImageCountHint,
        originalFileUrl: doc.originalFileUrl,
        originalContentType: contentType,
        orientation: detectedOrientation,
      });
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

    // ── Step 4: Resolve preview HTML under strict structured invariant ──────

    let structuredHtml: string;
    // orientationForKit: the orientation to pass to assembleStructuredPreviewKit.
    // May differ from detectedOrientation depending on per-family override logic.
    let orientationForKit: DocumentOrientation = detectedOrientation;
    let resolvedFamilyForKit: string = 'unknown';
    let resolvedRendererForKit: string = 'unknown';
    let resolvedLanguageIntegrityForKit: StructuredRenderLanguageIntegrity = {
      targetLanguage: 'EN',
      sourceLanguage: (doc.sourceLanguage ?? 'unknown').toUpperCase(),
      translatedPayloadFound: false,
      translatedZonesCount: null,
      sourceZonesCount: null,
      missingTranslatedZones: [],
      sourceContentAttempted: false,
      sourceLanguageMarkers: [],
      requiredZones: [],
      translatedZonesFound: [],
      sourceLanguageContaminatedZones: [],
      mappedGenericZones: [],
      languageIssueType: 'none',
    };
    try {
      const renderAssertion = assertStructuredClientFacingRender({
        documentType: classification.documentType,
        documentLabel: documentLabelHint,
        fileUrl: doc.originalFileUrl,
        translatedText: effectiveTranslatedText,
        detectedOrientation,
        surface: 'preview-kit',
        logPrefix,
      });

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resolved = await renderStructuredFamilyDocument({
        client,
        family: renderAssertion.family,
        documentType: renderAssertion.documentType,
        originalFileBuffer,
        originalFileUrl: doc.originalFileUrl,
        contentType,
        sourcePageCount,
        detectedOrientation,
        orderId,
        documentId,
        sourceLanguage: doc.sourceLanguage ?? null,
        targetLanguage: 'EN',
        logPrefix,
      });

      structuredHtml = resolved.structuredHtml;
      orientationForKit = resolved.orientationForKit;
      resolvedFamilyForKit = renderAssertion.family;
      resolvedRendererForKit = resolved.rendererName;
      resolvedLanguageIntegrityForKit = resolved.languageIntegrity;

      console.log(
        `${logPrefix} — structured renderer applied: yes | family=${renderAssertion.family} | ` +
        `renderer=${resolved.rendererName} | orientation=${orientationForKit} | pages=${sourcePageCount ?? 'n/a'} | ` +
        `layoutDefault=${renderAssertion.familyLayoutProfile.defaultOrientation} | ` +
        `surfaceRequirement=${renderAssertion.surfaceRequirement} | ` +
        `priority=${renderAssertion.implementationMatrixRow.priorityLevel} | ` +
        `capabilities=preview:${renderAssertion.familyClientFacingCapability.previewSupported ? 'yes' : 'no'} ` +
        `delivery:${renderAssertion.familyClientFacingCapability.deliverySupported ? 'yes' : 'no'} ` +
        `orientation:${renderAssertion.familyClientFacingCapability.orientationSupport} ` +
        `table:${renderAssertion.familyClientFacingCapability.tableSupport} ` +
        `signature:${renderAssertion.familyClientFacingCapability.signatureBlockSupport} ` +
        `denseTable:${renderAssertion.implementationMatrixRow.denseTableHandling ? 'yes' : 'no'} ` +
        `signatureSeal:${renderAssertion.implementationMatrixRow.signatureSealHandling ? 'yes' : 'no'}`,
      );
    } catch (err) {
      return {
        success: false,
        error: formatStructuredRenderingFailureMessage(classification.documentType, err),
      };
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
      targetLanguage: resolvedLanguageIntegrityForKit.targetLanguage,
      coverVariant,
      documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? 'Document',
      sourcePageCount,
      sourceArtifactType,
      sourcePageCountStrategy,
      groupedSourceImageCount: groupedSourceImageCountHint ?? undefined,
      originalFileUrl: doc.originalFileUrl,
      originalContentType: contentType,
      orientation: orientationForKit === 'landscape' ? 'landscape' : undefined,
      documentFamily: resolvedFamilyForKit,
      rendererName: resolvedRendererForKit,
      surface: 'preview-kit',
      compactionAttempted: false,
      languageIntegrity: resolvedLanguageIntegrityForKit,
    });

    if (!kit.assembled) {
      const parityDetail =
        kit.blockingReason === 'page_parity_mismatch'
          ? ` Page parity failed: source=${kit.sourcePageCount ?? 'unknown'}, translated=${kit.translatedPageCount ?? 'unknown'}.`
          : kit.blockingReason === 'page_parity_unverifiable_source_page_count'
            ? ' Page parity failed: source page count is unavailable, so parity cannot be verified.'
            : kit.blockingReason === 'translated_zone_content_missing_or_source_language_detected'
              ? ' Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface.'
            : '';
      return {
        success: false,
        error:
          `Structured preview kit assembly failed for "${classification.documentType}". ` +
          `Client-facing translated preview output is blocked by invariant.` +
          parityDetail +
          ` Check server logs for parity diagnostics and kit assembly details.`,
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
