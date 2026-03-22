'use server';

/**
 * app/actions/previewStructuredKit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * On-demand server action: generates a preview kit for a document.
 *
 * Called when the operator clicks "Preview Kit" in the Workbench.
 *
 * Canonical flow:
 *   1. Load document, resolve artifact (external PDF or translated HTML).
 *   2. Fetch original source file for Part 3 appending.
 *   3. Classify document type as a metadata hint (layout hint only).
 *   4. Build mirror HTML from the stored translatedText artifact.
 *      CSS and Gotenberg handle typography/density — no family renderer required.
 *   5. Assemble the 3-part preview kit via assembleStructuredPreviewKit.
 *   6. Return the preview URL.
 *
 * Guarantees:
 *   - Document family/type is used only as a layout hint (certificate vs standard).
 *     It never blocks preview generation.
 *   - Never modifies DB records, delivery_pdf_url, or translation_status.
 *   - Never affects the official delivery flow.
 *   - Never throws — errors are caught and returned as { success: false }.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '@/lib/prisma';
import {
  assembleStructuredPreviewKit,
  type StructuredPageParityDecision,
  type PageParityDecisionContext,
} from '@/services/structuredPreviewKit';
import type { DocumentOrientation } from '@/lib/documentOrientationDetector';
import { classifyDocument } from '@/services/documentClassifier';
import { type StructuredRenderLanguageIntegrity } from '@/services/structuredDocumentRenderer';
import { isCertificateGenreDocumentType } from '@/lib/singlePageSafeguard';
import { sanitizeTranslationHtml, compactParagraphsForContinuousText } from '@/lib/translationHtmlSanitizer';
import { buildTranslatedPageHtml } from '@/services/translatedPageTemplate';
import {
  getPageParityRegistryRecord,
  parseOrderMetadata,
  resolveTranslationArtifactSelection,
  upsertPageParityRegistryRecord,
  type PageParityMode,
  type TranslationArtifactSource,
} from '@/lib/translationArtifactSource';
import { resolveKitSetup } from '@/services/structuredKitSetup';
import { getCurrentUser } from '@/app/actions/auth';

interface PreviewPageParityDecisionInput {
  mode: PageParityMode;
  sourceRelevantPageCount?: number | null;
  justification?: string | null;
}

interface PreviewPageParityDecisionRequiredPayload extends PageParityDecisionContext {
  translationArtifactSource: TranslationArtifactSource | 'unknown';
}

interface PreviewStructuredKitActionResult {
  success: boolean;
  previewUrl?: string;
  error?: string;
  parityDecisionRequired?: boolean;
  parityDecision?: PreviewPageParityDecisionRequiredPayload;
  resolvedPageParity?: {
    mode: PageParityMode;
    sourcePhysicalPageCount: number | null;
    sourceRelevantPageCount: number | null;
    translatedPageCount: number | null;
  };
}

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

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizePageParityDecisionInput(
  input?: PreviewPageParityDecisionInput | null,
): PreviewPageParityDecisionInput | null {
  if (!input) return null;
  const mode = input.mode;
  if (
    mode !== 'strict_all_pages' &&
    mode !== 'content_pages_only' &&
    mode !== 'first_page_only' &&
    mode !== 'manual_override'
  ) {
    return null;
  }

  const justification =
    typeof input.justification === 'string'
      ? input.justification.trim() || null
      : null;

  return {
    mode,
    sourceRelevantPageCount: normalizePositiveInteger(input.sourceRelevantPageCount),
    justification,
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
  pageParityDecision?: StructuredPageParityDecision | null;
}): Promise<PreviewStructuredKitActionResult> {
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
    modality: 'external_pdf',
    surface: 'preview-kit',
    compactionAttempted: false,
    languageIntegrity: buildExternalOverrideLanguageIntegrity(params.sourceLanguage),
    pageParityDecision: params.pageParityDecision ?? null,
  });

  if (!kit.assembled) {
    if (kit.parityDecisionRequired && kit.parityDecisionContext) {
      return {
        success: false,
        parityDecisionRequired: true,
        parityDecision: {
          ...kit.parityDecisionContext,
          translationArtifactSource: 'external_pdf',
        },
        error:
          'Diferença de páginas detectada. Escolha um modo de paridade para continuar com segurança.',
      };
    }

    const detail =
      kit.blockingReason === 'page_parity_mismatch'
        ? ` Page parity failed: source=${kit.sourcePageCount ?? 'unknown'}, translated=${kit.translatedPageCount ?? 'unknown'}.`
        : kit.blockingReason === 'page_parity_unverifiable_source_page_count'
          ? ' Page parity failed: source page count is unavailable, so parity cannot be verified.'
          : kit.blockingReason === 'page_parity_manual_override_requires_justification'
            ? ' Page parity failed: manual override requires a textual justification.'
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
    resolvedPageParity: {
      mode: kit.pageParityMode ?? 'strict_all_pages',
      sourcePhysicalPageCount: kit.sourcePhysicalPageCount ?? kit.sourcePageCount ?? null,
      sourceRelevantPageCount: kit.sourceRelevantPageCount ?? null,
      translatedPageCount: kit.translatedPageCount ?? null,
    },
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
  parityDecisionInput?: PreviewPageParityDecisionInput | null,
): Promise<PreviewStructuredKitActionResult> {
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

    const parsedOrderMetadata = parseOrderMetadata(
      doc.order?.metadata as string | null | undefined,
    );
    const persistedPageParityRecord = getPageParityRegistryRecord(
      parsedOrderMetadata,
      doc.id,
    );
    const requestedParityDecision = normalizePageParityDecisionInput(
      parityDecisionInput,
    );
    const currentUser = requestedParityDecision ? await getCurrentUser() : null;
    const requestTimestamp = new Date().toISOString();

    const explicitParityDecision: StructuredPageParityDecision | null =
      requestedParityDecision
        ? {
            mode: requestedParityDecision.mode,
            sourceRelevantPageCount:
              requestedParityDecision.sourceRelevantPageCount ?? null,
            justification: requestedParityDecision.justification ?? null,
            approvedByUserId:
              currentUser && typeof currentUser.id === 'number'
                ? String(currentUser.id)
                : currentUser?.email ?? null,
            approvedAt: requestTimestamp,
          }
        : null;

    const persistedApprovedParityDecision: StructuredPageParityDecision | null =
      persistedPageParityRecord && persistedPageParityRecord.status === 'approved_by_user'
        ? {
            mode: persistedPageParityRecord.mode,
            sourceRelevantPageCount:
              persistedPageParityRecord.sourceRelevantPageCount,
            justification: persistedPageParityRecord.justification,
            approvedByUserId: persistedPageParityRecord.approvedByUserId,
            approvedAt: persistedPageParityRecord.approvedAt,
          }
        : null;

    const effectivePageParityDecision =
      explicitParityDecision ?? persistedApprovedParityDecision;

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

    // ── Steps 1–2: Fetch file, detect orientation, resolve page count ──────────

    const kitSetup = await resolveKitSetup({
      originalFileUrl: doc.originalFileUrl,
      exactNameOnDoc: doc.exactNameOnDoc,
      documentId: doc.id,
      parsedOrderMetadata,
      logPrefix,
    });

    const {
      originalFileBuffer,
      isOriginalPdf,
      contentType,
      detectedOrientation,
      sourcePageCount,
      sourceArtifactType,
      sourcePageCountStrategy,
      groupedSourceImageCountHint,
      originalFetchFailed,
    } = kitSetup;

    if (originalFetchFailed) {
      return {
        success: false,
        error:
          `Original source file could not be fetched for document #${documentId}. ` +
          `Kit assembly requires the original to be appended as Part 3. ` +
          `Verify that originalFileUrl is set and accessible.`,
      };
    }

    // ── External translated PDF override ─────────────────────────────────────
    if (
      artifactSelection.source === 'external_pdf' &&
      artifactSelection.selectedArtifactUrl
    ) {
      const externalPreview = await generatePreviewFromExternalPdf({
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
        pageParityDecision: effectivePageParityDecision,
      });

      if (externalPreview.success && requestedParityDecision) {
        const paritySnapshot = externalPreview.resolvedPageParity;
        const nextMetadata = upsertPageParityRegistryRecord(
          parsedOrderMetadata,
          doc.id,
          {
            mode: requestedParityDecision.mode,
            sourcePhysicalPageCount:
              paritySnapshot?.sourcePhysicalPageCount ?? sourcePageCount ?? null,
            sourceRelevantPageCount:
              paritySnapshot?.sourceRelevantPageCount ??
              requestedParityDecision.sourceRelevantPageCount ??
              (requestedParityDecision.mode === 'first_page_only' ? 1 : null),
            translatedPageCount: paritySnapshot?.translatedPageCount ?? null,
            status:
              requestedParityDecision.mode === 'strict_all_pages'
                ? 'strict_enforced'
                : 'approved_by_user',
            justification: requestedParityDecision.justification ?? null,
            approvedByUserId:
              explicitParityDecision?.approvedByUserId ?? currentUser?.email ?? null,
            approvedAt: explicitParityDecision?.approvedAt ?? requestTimestamp,
            sourceArtifactType: sourceArtifactType ?? null,
            sourcePageCountStrategy: sourcePageCountStrategy ?? null,
            translationArtifactSource: artifactSelection.source,
          },
        );
        await prisma.order.update({
          where: { id: orderId },
          data: { metadata: JSON.stringify(nextMetadata) },
        });
      }

      return externalPreview;
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

    // ── Step 4: Build mirror HTML from translated artifact (canonical path) ──
    //
    // doc.translatedText (or editorHtml) is the Anthropic mirror HTML. CSS and
    // Gotenberg handle typography, density, and letterhead — no family renderer.
    // Document type is a layout hint only (certificate vs standard page sizing).

    const faithfulText = effectiveTranslatedText?.trim() ?? null;
    if (!faithfulText || faithfulText.length < 50) {
      return {
        success: false,
        error:
          `Document #${documentId} has no translated HTML. ` +
          `Translation must complete before generating a preview kit.`,
      };
    }

    const layoutHint = isCertificateGenreDocumentType(classification.documentType)
      ? 'certificate' as const
      : 'standard' as const;

    const mirrorHtml = buildTranslatedPageHtml({
      translatedHtml: compactParagraphsForContinuousText(sanitizeTranslationHtml(faithfulText)),
      documentTitle: doc.exactNameOnDoc ?? doc.docType ?? undefined,
      orientation: detectedOrientation === 'landscape' ? 'landscape' : 'portrait',
      layoutHint,
    });

    const languageIntegrity: StructuredRenderLanguageIntegrity = {
      targetLanguage: 'EN',
      sourceLanguage: (doc.sourceLanguage ?? 'unknown').toUpperCase(),
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

    console.log(
      `${logPrefix} — mirror_html renderer | ` +
      `documentType=${classification.documentType} orientation=${detectedOrientation} ` +
      `layoutHint=${layoutHint} pages=${sourcePageCount ?? 'n/a'}`,
    );

    // ── Step 5: Assemble the preview kit ────────────────────────────────────

    const kit = await assembleStructuredPreviewKit({
      structuredHtml: mirrorHtml,
      originalFileBuffer,
      isOriginalPdf,
      orderId,
      documentId,
      sourceLanguage: doc.sourceLanguage ?? 'pt',
      targetLanguage: 'EN',
      coverVariant,
      documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? 'Document',
      sourcePageCount,
      sourceArtifactType,
      sourcePageCountStrategy,
      groupedSourceImageCount: groupedSourceImageCountHint ?? undefined,
      originalFileUrl: doc.originalFileUrl,
      originalContentType: contentType,
      orientation: detectedOrientation === 'landscape' ? 'landscape' : undefined,
      documentFamily: classification.documentType,
      rendererName: 'mirror_html',
      modality: 'faithful',
      surface: 'preview-kit',
      compactionAttempted: false,
      languageIntegrity,
      pageParityDecision: effectivePageParityDecision,
    });

    if (!kit.assembled) {
      if (kit.parityDecisionRequired && kit.parityDecisionContext) {
        return {
          success: false,
          parityDecisionRequired: true,
          parityDecision: {
            ...kit.parityDecisionContext,
            translationArtifactSource: artifactSelection.source,
          },
          error:
            'Diferença de páginas detectada. Revise as contagens e escolha um modo de paridade para continuar.',
        };
      }

      const parityDetail =
        kit.blockingReason === 'page_parity_mismatch'
          ? ` Page parity failed: source=${kit.sourcePageCount ?? 'unknown'}, translated=${kit.translatedPageCount ?? 'unknown'}.`
          : kit.blockingReason === 'page_parity_unverifiable_source_page_count'
            ? ' Page parity failed: source page count is unavailable, so parity cannot be verified.'
            : kit.blockingReason === 'page_parity_manual_override_requires_justification'
              ? ' Page parity failed: manual override requires a textual justification.'
            : '';
      return {
        success: false,
        error:
          `Preview kit assembly failed for document #${documentId}.` +
          parityDetail +
          ` Check server logs for details.`,
      };
    }

    if (requestedParityDecision) {
      const nextMetadata = upsertPageParityRegistryRecord(
        parsedOrderMetadata,
        doc.id,
        {
          mode: requestedParityDecision.mode,
          sourcePhysicalPageCount:
            kit.sourcePhysicalPageCount ?? kit.sourcePageCount ?? sourcePageCount ?? null,
          sourceRelevantPageCount:
            kit.sourceRelevantPageCount ??
            requestedParityDecision.sourceRelevantPageCount ??
            (requestedParityDecision.mode === 'first_page_only' ? 1 : null),
          translatedPageCount: kit.translatedPageCount ?? null,
          status:
            requestedParityDecision.mode === 'strict_all_pages'
              ? 'strict_enforced'
              : 'approved_by_user',
          justification: requestedParityDecision.justification ?? null,
          approvedByUserId:
            explicitParityDecision?.approvedByUserId ?? currentUser?.email ?? null,
          approvedAt: explicitParityDecision?.approvedAt ?? requestTimestamp,
          sourceArtifactType: sourceArtifactType ?? null,
          sourcePageCountStrategy: sourcePageCountStrategy ?? null,
          translationArtifactSource: artifactSelection.source,
        },
      );
      await prisma.order.update({
        where: { id: orderId },
        data: { metadata: JSON.stringify(nextMetadata) },
      });
    }

    return {
      success: true,
      previewUrl: kit.kitUrl ?? kit.kitLocalPath ?? undefined,
      resolvedPageParity: {
        mode: kit.pageParityMode ?? 'strict_all_pages',
        sourcePhysicalPageCount:
          kit.sourcePhysicalPageCount ?? kit.sourcePageCount ?? null,
        sourceRelevantPageCount: kit.sourceRelevantPageCount ?? null,
        translatedPageCount: kit.translatedPageCount ?? null,
      },
    };
  } catch (err: any) {
    console.error(`${logPrefix} — unexpected error: ${err}`);
    return { success: false, error: err?.message ?? String(err) };
  }
}
