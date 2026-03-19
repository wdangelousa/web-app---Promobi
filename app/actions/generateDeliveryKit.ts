"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PDFDocument } from "pdf-lib";
import Anthropic from "@anthropic-ai/sdk";
import { classifyDocument } from "@/services/documentClassifier";
import {
  buildStructuredKitBuffer,
} from "@/services/structuredPreviewKit";
import {
  detectOrientationFromPdfDoc,
  type DocumentOrientation,
} from "@/lib/documentOrientationDetector";
import {
  assertStructuredClientFacingRender,
  formatStructuredRenderingFailureMessage,
  type StructuredRenderLanguageIntegrity,
  renderStructuredFamilyDocument,
} from "@/services/structuredDocumentRenderer";
import {
  parseOrderMetadata,
  resolveTranslationArtifactSelection,
  upsertDeliveryArtifactRegistryRecord,
} from "@/lib/translationArtifactSource";
import {
  isLikelyImageSource,
  resolveGroupedSourceImageCountHintFromOrderMetadata,
  resolveSourcePageCount,
} from '@/lib/sourcePageCountResolver';

interface DeliveryKitResult {
  success: boolean;
  deliveryUrl?: string;
  pdfUrl?: string;
  pdfBase64?: string;
  fileName?: string;
  isPreview?: boolean;
  error?: string;
}

interface GenerateOptions {
  preview?: boolean;
  coverLanguage?: string;
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

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateDeliveryKit(
  orderId: number,
  documentId: number,
  options: GenerateOptions = {}
): Promise<DeliveryKitResult> {
  const { preview = false } = options;

  try {
    console.log("=== ACTION generateDeliveryKit HIT ===");

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        documents: {
          where: { id: documentId },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!order) {
      return { success: false, error: `Order not found: ${orderId}` };
    }
    if (order.documents.length === 0) {
      return { success: false, error: `Document ${documentId} not found in order ${orderId}.` };
    }

    const doc = order.documents[0];
    const logPrefix = `[generateDeliveryKit] Order #${orderId} Doc #${documentId}`;

    const artifactSelection = resolveTranslationArtifactSelection({
      externalTranslationUrl: doc.externalTranslationUrl,
      translatedText: doc.translatedText,
      translatedFileUrl: doc.translatedFileUrl,
    });

    console.log(
      `${logPrefix} — translation artifact selection: ${JSON.stringify({
        orderId,
        docId: documentId,
        surface: preview ? "preview-kit" : "delivery-kit",
        externalTranslationUrlPresent: artifactSelection.externalTranslationUrlPresent
          ? "yes"
          : "no",
        selectedTranslationArtifactSource: artifactSelection.source,
        selectedArtifactUrlOrPath: artifactSelection.selectedArtifactUrl,
        deliveryUsedExternalPdf:
          artifactSelection.source === "external_pdf" ? "yes" : "no",
      })}`,
    );

    if (
      artifactSelection.source !== "external_pdf" &&
      !doc.translatedText
    ) {
      return {
        success: false,
        error:
          `Document ${documentId} has no translatedText for internal structured rendering ` +
          `and no active external translation override.`,
      };
    }

    // ── Step 1: Fetch original file ───────────────────────────────────────────
    let originalFileBuffer: ArrayBuffer = new ArrayBuffer(0);
    let isOriginalPdf = false;
    let contentType = "application/octet-stream";

    if (doc.originalFileUrl) {
      try {
        const res = await fetch(doc.originalFileUrl);
        if (res.ok) {
          originalFileBuffer = await res.arrayBuffer();
          contentType = res.headers.get("content-type") ?? "application/octet-stream";
          isOriginalPdf =
            contentType.includes("pdf") ||
            doc.originalFileUrl.toLowerCase().includes(".pdf");
        }
      } catch {
        console.warn(`${logPrefix} — original file fetch failed`);
      }
    }

    // ── Step 2: Resolve source page count + orientation ───────────────────────
    let sourcePageCount: number | undefined;
    let detectedOrientation: DocumentOrientation = "unknown";
    let sourceArtifactType: string | undefined;
    let sourcePageCountStrategy: string | undefined;
    const parsedOrderMetadata = parseOrderMetadata(
      order.metadata as string | null | undefined,
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
        const pdfDoc = await PDFDocument.load(originalFileBuffer, { ignoreEncryption: true });
        extractedPdfPageCount = pdfDoc.getPageCount();
        const orientResult = detectOrientationFromPdfDoc(pdfDoc);
        detectedOrientation = orientResult.orientation;
        console.log(
          `${logPrefix} — original pages: ${extractedPdfPageCount}, orientation: ${detectedOrientation}`
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

    // ── Step 3: Classify document type ────────────────────────────────────────
    const documentLabelHint =
      [doc.exactNameOnDoc, doc.docType].filter(Boolean).join(" ").trim() || undefined;

    const classification = classifyDocument({
      fileUrl: doc.originalFileUrl ?? undefined,
      documentLabel: documentLabelHint,
      translatedText: doc.translatedText,
      sourceLanguage: doc.sourceLanguage ?? undefined,
    });

    console.log(
      `${logPrefix} — classified: ${classification.documentType} (${classification.confidence})`
    );

    // ── Step 4: Resolve delivery PDF under strict structured invariant ───────
    let finalPdfBuffer: Buffer;
    const coverVariant: "pt-en" | "es-en" =
      (doc.sourceLanguage ?? "").toUpperCase() === "ES" ? "es-en" : "pt-en";
    try {
      if (
        artifactSelection.source === "external_pdf" &&
        artifactSelection.selectedArtifactUrl
      ) {
        const externalRes = await fetch(artifactSelection.selectedArtifactUrl);
        if (!externalRes.ok) {
          return {
            success: false,
            error: `External translated PDF fetch failed (${externalRes.status}).`,
          };
        }

        const externalTranslatedPdfBuffer = await externalRes.arrayBuffer();
        if (externalTranslatedPdfBuffer.byteLength === 0) {
          return { success: false, error: "External translated PDF is empty." };
        }

        const buildResult = await buildStructuredKitBuffer({
          structuredHtml: "",
          externalTranslatedPdfBuffer,
          originalFileBuffer,
          isOriginalPdf,
          orderId,
          documentId,
          sourceLanguage: doc.sourceLanguage ?? undefined,
          targetLanguage: "EN",
          coverVariant,
          orientation: detectedOrientation === "landscape" ? "landscape" : undefined,
          documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? "Document",
          sourcePageCount,
          sourceArtifactType,
          sourcePageCountStrategy,
          groupedSourceImageCount: groupedSourceImageCountHint ?? undefined,
          originalFileUrl: doc.originalFileUrl,
          originalContentType: contentType,
          documentFamily: "external_translation",
          rendererName: "externalPdfOverride",
          surface: preview ? "preview-kit" : "delivery-kit",
          compactionAttempted: false,
          languageIntegrity: buildExternalOverrideLanguageIntegrity(
            doc.sourceLanguage ?? null,
          ),
        });

        if (!buildResult.success || !buildResult.kitBuffer) {
          const parityDetail =
            buildResult.blockingReason === "page_parity_mismatch"
              ? ` Page parity failed: source=${buildResult.sourcePageCount ?? "unknown"}, translated=${buildResult.translatedPageCount ?? "unknown"}.`
              : buildResult.blockingReason === "page_parity_unverifiable_source_page_count"
                ? " Page parity failed: source page count is unavailable, so parity cannot be verified."
                : "";
          return {
            success: false,
            error:
              `Structured delivery kit assembly failed for external translated PDF.` +
              parityDetail +
              ` Check server logs for parity diagnostics and kit assembly details.`,
          };
        }

        finalPdfBuffer = buildResult.kitBuffer;
        console.log(
          `${logPrefix} — external translation override applied for ${preview ? "preview kit" : "delivery kit"}`,
        );
      } else {
        const renderAssertion = assertStructuredClientFacingRender({
          documentType: classification.documentType,
          documentLabel: documentLabelHint,
          fileUrl: doc.originalFileUrl,
          translatedText: doc.translatedText,
          detectedOrientation,
          surface: "delivery-kit",
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

        const orientationForKit = resolved.orientationForKit;

        const buildResult = await buildStructuredKitBuffer({
          structuredHtml: resolved.structuredHtml,
          originalFileBuffer,
          isOriginalPdf,
          orderId,
          documentId,
          sourceLanguage: doc.sourceLanguage ?? undefined,
          targetLanguage: resolved.languageIntegrity.targetLanguage,
          coverVariant,
          orientation: orientationForKit === "landscape" ? "landscape" : undefined,
          documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? "Document",
          sourcePageCount,
          sourceArtifactType,
          sourcePageCountStrategy,
          groupedSourceImageCount: groupedSourceImageCountHint ?? undefined,
          originalFileUrl: doc.originalFileUrl,
          originalContentType: contentType,
          documentFamily: renderAssertion.family,
          rendererName: resolved.rendererName,
          surface: preview ? "preview-kit" : "delivery-kit",
          compactionAttempted: false,
          languageIntegrity: resolved.languageIntegrity,
        });

        if (!buildResult.success || !buildResult.kitBuffer) {
          const parityDetail =
            buildResult.blockingReason === "page_parity_mismatch"
              ? ` Page parity failed: source=${buildResult.sourcePageCount ?? "unknown"}, translated=${buildResult.translatedPageCount ?? "unknown"}.`
              : buildResult.blockingReason === "page_parity_unverifiable_source_page_count"
                ? " Page parity failed: source page count is unavailable, so parity cannot be verified."
                : buildResult.blockingReason === "translated_zone_content_missing_or_source_language_detected"
                  ? " Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface."
                : "";
          return {
            success: false,
            error:
              `Structured delivery kit assembly failed for "${classification.documentType}". ` +
              `Client-facing translated output is blocked by invariant.` +
              parityDetail +
              ` Check server logs for parity diagnostics and kit assembly details.`,
          };
        }

        finalPdfBuffer = buildResult.kitBuffer;
        console.log(
          `${logPrefix} — structured renderer applied: yes | family=${renderAssertion.family} | ` +
            `renderer=${resolved.rendererName} | orientation=${orientationForKit} | pages=${sourcePageCount ?? "n/a"} | ` +
            `layoutDefault=${renderAssertion.familyLayoutProfile.defaultOrientation} | ` +
            `surfaceRequirement=${renderAssertion.surfaceRequirement} | ` +
            `priority=${renderAssertion.implementationMatrixRow.priorityLevel} | ` +
            `capabilities=preview:${renderAssertion.familyClientFacingCapability.previewSupported ? 'yes' : 'no'} ` +
            `delivery:${renderAssertion.familyClientFacingCapability.deliverySupported ? 'yes' : 'no'} ` +
            `orientation:${renderAssertion.familyClientFacingCapability.orientationSupport} ` +
            `table:${renderAssertion.familyClientFacingCapability.tableSupport} ` +
            `signature:${renderAssertion.familyClientFacingCapability.signatureBlockSupport} ` +
            `denseTable:${renderAssertion.implementationMatrixRow.denseTableHandling ? 'yes' : 'no'} ` +
            `signatureSeal:${renderAssertion.implementationMatrixRow.signatureSealHandling ? 'yes' : 'no'}`
        );
      }
    } catch (err) {
      return {
        success: false,
        error: formatStructuredRenderingFailureMessage(classification.documentType, err),
      };
    }

    // ── Step 6: Upload to storage ─────────────────────────────────────────────
    const fileName = `promobidocs-order-${orderId}-doc-${documentId}.pdf`;

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const storagePath = preview
      ? `orders/previews/${fileName}`
      : `orders/completed/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("translations")
      .upload(storagePath, finalPdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    const { data: urlData } = supabase.storage
      .from("translations")
      .getPublicUrl(storagePath);

    // ── Step 7: DB update (official delivery only) ────────────────────────────
    if (!preview) {
      const nextMetadata = upsertDeliveryArtifactRegistryRecord(
        parsedOrderMetadata,
        documentId,
        {
          source: artifactSelection.source,
          selectedArtifactUrl: artifactSelection.selectedArtifactUrl,
          deliveryPdfUrl: urlData.publicUrl,
          generatedAt: new Date().toISOString(),
        },
      );

      await prisma.$transaction([
        prisma.document.update({
          where: { id: documentId },
          data: {
            delivery_pdf_url: urlData.publicUrl,
          },
        }),
        prisma.order.update({
          where: { id: orderId },
          data: {
            metadata: JSON.stringify(nextMetadata),
          },
        }),
      ]);

      console.log(
        `${logPrefix} — delivery artifact persisted: ${JSON.stringify({
          orderId,
          docId: documentId,
          externalTranslationUrlPresent: artifactSelection.externalTranslationUrlPresent
            ? "yes"
            : "no",
          selectedTranslationArtifactSource: artifactSelection.source,
          selectedArtifactUrlOrPath: artifactSelection.selectedArtifactUrl,
          selectedDeliveryArtifactUrl: urlData.publicUrl,
          deliveryUsedExternalPdf:
            artifactSelection.source === "external_pdf" ? "yes" : "no",
        })}`,
      );
      revalidatePath(`/admin/orders/${orderId}`);
      revalidatePath("/admin/orders");
    }

    return {
      success: true,
      deliveryUrl: urlData.publicUrl,
      pdfUrl: urlData.publicUrl,
      fileName,
      isPreview: preview,
    };
  } catch (error) {
    console.error("[DeliveryKit] Unexpected error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function previewDocumentPdf(
  documentId: number,
  _translatedHtml: string,
  documentType: string = "unknown",
  _sourceLanguage: string = "PT_BR"
): Promise<DeliveryKitResult> {
  console.error(
    `[previewDocumentPdf] blocked — legacy/plain preview renderer is forbidden for translated client-facing output (doc #${documentId}, family=${documentType})`
  );
  return {
    success: false,
    error:
      `Structured rendering is mandatory for translated previews. Legacy/plain preview rendering is blocked by invariant for document family "${documentType}". Use Preview Kit structured generation instead.`,
  };
}
