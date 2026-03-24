"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { classifyDocument } from "@/services/documentClassifier";
import {
  buildStructuredKitBuffer,
  type StructuredPageParityDecision,
} from "@/services/structuredPreviewKit";
import { type StructuredRenderLanguageIntegrity } from "@/services/structuredDocumentRenderer";
import { isCertificateGenreDocumentType } from "@/lib/singlePageSafeguard";
import { sanitizeTranslationHtml, compactParagraphsForContinuousText, compactTranslatorNoteParagraphs } from "@/lib/translationHtmlSanitizer";
import { buildTranslatedPageHtml } from "@/services/translatedPageTemplate";
import {
  getPageParityRegistryRecord,
  parseOrderMetadata,
  resolveTranslationArtifactSelection,
  upsertDeliveryArtifactRegistryRecord,
} from "@/lib/translationArtifactSource";
import { resolveKitSetup } from "@/services/structuredKitSetup";

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

function buildStoredPageParityDecision(
  parsedOrderMetadata: Record<string, unknown>,
  documentId: number,
): StructuredPageParityDecision | null {
  const record = getPageParityRegistryRecord(parsedOrderMetadata, documentId);
  if (!record || record.status !== "approved_by_user") {
    return null;
  }

  return {
    mode: record.mode,
    sourceRelevantPageCount: record.sourceRelevantPageCount,
    justification: record.justification,
    approvedByUserId: record.approvedByUserId,
    approvedAt: record.approvedAt,
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

    // ── Short-circuit: use approved (frozen) kit if available ──────────────
    if (!preview && doc.approvedKitUrl) {
      console.log(
        `${logPrefix} — using approved (frozen) kit: ${doc.approvedKitUrl}`
      );

      // Copy from previews/ to completed/ path in storage
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const fileName = `promobidocs-order-${orderId}-doc-${documentId}.pdf`;
      const completedPath = `orders/completed/${fileName}`;

      // Fetch the approved kit PDF
      const approvedRes = await fetch(doc.approvedKitUrl);
      if (!approvedRes.ok) {
        console.warn(
          `${logPrefix} — approved kit fetch failed (${approvedRes.status}), falling through to regeneration`
        );
      } else {
        const approvedBuffer = Buffer.from(await approvedRes.arrayBuffer());

        const { error: uploadError } = await supabase.storage
          .from("translations")
          .upload(completedPath, approvedBuffer, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (uploadError) {
          console.warn(
            `${logPrefix} — approved kit upload to completed/ failed: ${uploadError.message}, falling through`
          );
        } else {
          const { data: urlData } = supabase.storage
            .from("translations")
            .getPublicUrl(completedPath);

          // Persist delivery URL
          const parsedOrderMetadata = parseOrderMetadata(
            order.metadata as string | null | undefined,
          );
          const nextMetadata = upsertDeliveryArtifactRegistryRecord(
            parsedOrderMetadata,
            documentId,
            {
              source: 'approved_frozen_kit' as any,
              selectedArtifactUrl: doc.approvedKitUrl,
              deliveryPdfUrl: urlData.publicUrl,
              generatedAt: new Date().toISOString(),
            },
          );

          await prisma.$transaction([
            prisma.document.update({
              where: { id: documentId },
              data: { delivery_pdf_url: urlData.publicUrl },
            }),
            prisma.order.update({
              where: { id: orderId },
              data: { metadata: JSON.stringify(nextMetadata) },
            }),
          ]);

          revalidatePath(`/admin/orders/${orderId}`);
          revalidatePath("/admin/orders");

          return {
            success: true,
            deliveryUrl: urlData.publicUrl,
            pdfUrl: urlData.publicUrl,
            fileName,
            isPreview: false,
          };
        }
      }
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

    // ── Steps 1–2: Fetch file, detect orientation, resolve page count ──────────
    const parsedOrderMetadata = parseOrderMetadata(
      order.metadata as string | null | undefined,
    );
    const storedPageParityDecision = buildStoredPageParityDecision(
      parsedOrderMetadata,
      documentId,
    );

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
          modality: "external_pdf",
          surface: preview ? "preview-kit" : "delivery-kit",
          compactionAttempted: false,
          languageIntegrity: buildExternalOverrideLanguageIntegrity(
            doc.sourceLanguage ?? null,
          ),
          pageParityDecision: storedPageParityDecision,
        });

        if (!buildResult.success || !buildResult.kitBuffer) {
          const parityDetail =
            buildResult.blockingReason === "page_parity_mismatch"
              ? ` Page parity failed: source=${buildResult.sourcePageCount ?? "unknown"}, translated=${buildResult.translatedPageCount ?? "unknown"}.`
              : buildResult.blockingReason === "page_parity_unverifiable_source_page_count"
                ? " Page parity failed: source page count is unavailable, so parity cannot be verified."
                : buildResult.blockingReason === "page_parity_decision_required"
                  ? " Page parity requires explicit decision. Open Preview Kit, choose the parity mode, and retry."
                  : buildResult.blockingReason === "page_parity_manual_override_requires_justification"
                    ? " Page parity failed: manual override requires a textual justification."
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
        // ── Mirror HTML path (canonical) ──────────────────────────────────
        // doc.translatedText is the canonical artifact: Anthropic mirror HTML
        // sanitized and stored by the translation route. CSS + Gotenberg handle
        // typography, density, and letterhead constraints — not family renderers.
        const faithfulText = doc.translatedText?.trim() ?? null;
        if (!faithfulText || faithfulText.length < 50) {
          return {
            success: false,
            error:
              `Document #${documentId} has no translated HTML. ` +
              `Translation must complete before generating a ${preview ? "preview" : "delivery"} kit.`,
          };
        }

        const layoutHint = isCertificateGenreDocumentType(classification.documentType)
          ? 'certificate' as const
          : 'standard' as const;

        // Page-count chain diagnostic — delivery stage
        const deliverySectionCount =
          (faithfulText.match(/<section\b[^>]*class="[^"]*\bpage\b/gi) ?? []).length;
        console.log(
          `${logPrefix} [pageCountChain] deliveryInputSectionCount=${deliverySectionCount} ` +
          `sourcePageCount=${sourcePageCount ?? 'unknown'}`
        );
        if (sourcePageCount && sourcePageCount > 1 && deliverySectionCount > 0 && deliverySectionCount < sourcePageCount) {
          console.warn(
            `${logPrefix} [pageCountGuard] DELIVERY UNDERFLOW: ` +
            `storedSections=${deliverySectionCount} source=${sourcePageCount} — ` +
            `translated artifact is missing page(s)`
          );
        }

        // V2 pipeline produces clean deterministic HTML — skip re-sanitization.
        // V1 pipeline needs sanitizer to clean up Claude's raw HTML output.
        const isV2Html = faithfulText.includes('<div class="translated-document">');
        const sanitizedHtml = isV2Html
          ? faithfulText
          : compactTranslatorNoteParagraphs(
              compactParagraphsForContinuousText(sanitizeTranslationHtml(faithfulText)),
            );

        const htmlForKit = buildTranslatedPageHtml({
          translatedHtml: sanitizedHtml,
          documentTitle: doc.exactNameOnDoc ?? doc.docType ?? undefined,
          orientation: detectedOrientation === 'landscape' ? 'landscape' : 'portrait',
          layoutHint,
        });

        const languageIntegrity = buildExternalOverrideLanguageIntegrity(doc.sourceLanguage ?? null);

        console.log(
          `${logPrefix} — mirror_html renderer | ` +
          `documentType=${classification.documentType} orientation=${detectedOrientation} ` +
          `layoutHint=${layoutHint} pages=${sourcePageCount ?? 'n/a'}`,
        );

        const buildResult = await buildStructuredKitBuffer({
          structuredHtml: htmlForKit,
          originalFileBuffer,
          isOriginalPdf,
          orderId,
          documentId,
          sourceLanguage: doc.sourceLanguage ?? undefined,
          targetLanguage: 'EN',
          coverVariant,
          orientation: detectedOrientation === 'landscape' ? 'landscape' : undefined,
          documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? 'Document',
          sourcePageCount,
          sourceArtifactType,
          sourcePageCountStrategy,
          groupedSourceImageCount: groupedSourceImageCountHint ?? undefined,
          originalFileUrl: doc.originalFileUrl,
          originalContentType: contentType,
          documentFamily: classification.documentType,
          rendererName: isV2Html ? 'mirror_html_v2' : 'mirror_html',
          modality: 'faithful',
          surface: preview ? 'preview-kit' : 'delivery-kit',
          compactionAttempted: false,
          languageIntegrity,
          pageParityDecision: storedPageParityDecision,
        });

        if (!buildResult.success || !buildResult.kitBuffer) {
          const parityDetail =
            buildResult.blockingReason === 'page_parity_mismatch'
              ? ` Page parity failed: source=${buildResult.sourcePageCount ?? 'unknown'}, translated=${buildResult.translatedPageCount ?? 'unknown'}.`
              : buildResult.blockingReason === 'page_parity_unverifiable_source_page_count'
                ? ' Page parity failed: source page count is unavailable, so parity cannot be verified.'
                : buildResult.blockingReason === 'page_parity_decision_required'
                  ? ' Page parity requires explicit decision. Open Preview Kit, choose the parity mode, and retry.'
                  : buildResult.blockingReason === 'page_parity_manual_override_requires_justification'
                    ? ' Page parity failed: manual override requires a textual justification.'
                  : '';
          return {
            success: false,
            error:
              `Delivery kit assembly failed for document #${documentId}.` +
              parityDetail +
              ` Check server logs for details.`,
          };
        }

        finalPdfBuffer = buildResult.kitBuffer;
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
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
  _documentType: string = "unknown",
  _sourceLanguage: string = "PT_BR"
): Promise<DeliveryKitResult> {
  // This legacy entry point is superseded by generateDeliveryKit({ preview: true }).
  // The canonical preview path reads the stored translated HTML artifact and
  // renders via Gotenberg — no per-document-type renderer required.
  console.error(
    `[previewDocumentPdf] blocked — use generateDeliveryKit with preview=true for document #${documentId}`
  );
  return {
    success: false,
    error:
      `previewDocumentPdf is deprecated. Use generateDeliveryKit with preview=true ` +
      `(document #${documentId}). The canonical preview reads the stored translated HTML artifact.`,
  };
}
