"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { classifyDocument } from "@/services/documentClassifier";
import {
  buildStructuredKitBuffer,
  type StructuredPageParityDecision,
} from "@/services/structuredPreviewKit";
import { type DocumentOrientation } from "@/lib/documentOrientationDetector";
import {
  assertStructuredClientFacingRender,
  formatStructuredRenderingFailureMessage,
  type StructuredRenderLanguageIntegrity,
  renderStructuredFamilyDocument,
  StructuredRenderingRequiredError,
} from "@/services/structuredDocumentRenderer";
import { resolveDocumentTypeModality } from "@/services/documentFamilyRegistry";
import { buildPageLayoutBudget, buildPreRenderLayoutHints } from "@/lib/parityRecovery";
import { resolveSinglePageRouting, isCertificateGenreDocumentType } from "@/lib/singlePageSafeguard";
import { sanitizeTranslationHtml, compactParagraphsForContinuousText } from "@/lib/translationHtmlSanitizer";
import { buildTranslatedPageHtml } from "@/services/translatedPageTemplate";
import {
  getPageParityRegistryRecord,
  parseOrderMetadata,
  resolveTranslationArtifactSelection,
  upsertDeliveryArtifactRegistryRecord,
} from "@/lib/translationArtifactSource";
import { resolveKitSetup } from "@/services/structuredKitSetup";
import { runFaithfulTextDiagnostics } from "@/lib/faithfulTextRenderDiagnostics";

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
        // ── Structured rendering with faithful-light fallback ────────────────
        // Attempt structured rendering first. If it throws StructuredRenderingRequiredError
        // (e.g. invalid JSON from Anthropic, schema mismatch) and the document type
        // opts into faithful fallback, wrap doc.translatedText in the standard
        // letterhead template and continue with kit assembly unchanged.
        // The kit assembler's language gate still runs to block source-language leakage.
        let htmlForKit = '';
        let orientationForKit = detectedOrientation;
        let familyForKit: string = classification.documentType;
        let rendererNameForKit = 'unknown';
        let languageIntegrityForKit: StructuredRenderLanguageIntegrity =
          buildExternalOverrideLanguageIntegrity(doc.sourceLanguage ?? null);
        // Tracks whether htmlForKit was produced by the faithful-light path so
        // diagnostics can be emitted after the kit build result is available.
        let faithfulLightHtml: string | null = null;

        const modality = resolveDocumentTypeModality(classification.documentType);
        // Phase 2 prep: pre-render layout hints passed to the renderer so it
        // can eventually pre-optimise layout before the first Gotenberg pass.
        const layoutHints =
          modality === 'faithful' &&
          sourcePageCount != null &&
          sourcePageCount > 0
            ? buildPreRenderLayoutHints(
                buildPageLayoutBudget(
                  sourcePageCount,
                  detectedOrientation === 'landscape' ? 'landscape' : 'portrait',
                ),
              )
            : undefined;

        // ── Single-page routing safeguard ──────────────────────────────────
        const singlePageRouting = resolveSinglePageRouting(
          classification.documentType,
          sourcePageCount,
        );
        const singlePageSafeguardApplied = singlePageRouting === 'safeguard_blocked';

        if (singlePageSafeguardApplied) {
          console.log(
            `${logPrefix} — single_page_routing: source_page_count=1 ` +
            `structured_ai_blocked=true renderer_chosen=faithful_light_safeguard ` +
            `document_type=${classification.documentType}`,
          );
          const faithfulText = doc.translatedText?.trim() ?? null;
          if (faithfulText !== null && faithfulText.length > 50) {
            htmlForKit = buildTranslatedPageHtml({
              translatedHtml: compactParagraphsForContinuousText(sanitizeTranslationHtml(faithfulText)),
              documentTitle: doc.exactNameOnDoc ?? doc.docType ?? undefined,
              orientation: detectedOrientation === 'landscape' ? 'landscape' : 'portrait',
              layoutHint: isCertificateGenreDocumentType(classification.documentType) ? 'certificate' : 'standard',
            });
            rendererNameForKit = 'faithful_light_safeguard';
            faithfulLightHtml = htmlForKit;
          } else {
            return {
              success: false,
              error:
                `Single-page safeguard blocked structured AI for "${classification.documentType}" ` +
                `but no translated text is available for faithful-light rendering.`,
            };
          }
        } else {
          if (singlePageRouting === 'structured_ai_allowed') {
            console.log(
              `${logPrefix} — single_page_routing: source_page_count=1 ` +
              `structured_ai_blocked=false (whitelisted) document_type=${classification.documentType}`,
            );
          }

          try {
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
              layoutHints,
              documentTypeLabel: documentLabelHint,
            });

            htmlForKit = resolved.structuredHtml;
            orientationForKit = resolved.orientationForKit;
            familyForKit = renderAssertion.family;
            rendererNameForKit = resolved.rendererName;
            languageIntegrityForKit = resolved.languageIntegrity;

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
          } catch (renderErr) {
            const faithfulText = doc.translatedText?.trim() ?? null;
            if (
              renderErr instanceof StructuredRenderingRequiredError &&
              (modality === 'standard' || modality === 'faithful') &&
              faithfulText !== null &&
              faithfulText.length > 50
            ) {
              console.log(
                `${logPrefix} — structured rendering failed; activating faithful-light fallback ` +
                `for "${classification.documentType}" (modality: ${modality}, reason: ${renderErr.message.slice(0, 120)})`,
              );
              htmlForKit = buildTranslatedPageHtml({
                translatedHtml: compactParagraphsForContinuousText(sanitizeTranslationHtml(faithfulText)),
                documentTitle: doc.exactNameOnDoc ?? doc.docType ?? undefined,
                orientation: detectedOrientation === 'landscape' ? 'landscape' : 'portrait',
                layoutHint: isCertificateGenreDocumentType(classification.documentType) ? 'certificate' : 'standard',
              });
              rendererNameForKit = 'faithful_light_fallback';
              faithfulLightHtml = htmlForKit;
              // orientationForKit, familyForKit, languageIntegrityForKit keep their defaults
            } else {
              throw renderErr;  // re-thrown → caught by outer catch → formatStructuredRenderingFailureMessage
            }
          }
        } // end: else (not singlePageSafeguardApplied)

        const buildResult = await buildStructuredKitBuffer({
          structuredHtml: htmlForKit,
          originalFileBuffer,
          isOriginalPdf,
          orderId,
          documentId,
          sourceLanguage: doc.sourceLanguage ?? undefined,
          targetLanguage: languageIntegrityForKit.targetLanguage,
          coverVariant,
          orientation: orientationForKit === "landscape" ? "landscape" : undefined,
          documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? "Document",
          sourcePageCount,
          sourceArtifactType,
          sourcePageCountStrategy,
          groupedSourceImageCount: groupedSourceImageCountHint ?? undefined,
          originalFileUrl: doc.originalFileUrl,
          originalContentType: contentType,
          documentFamily: familyForKit,
          rendererName: rendererNameForKit,
          modality: resolveDocumentTypeModality(classification.documentType),
          surface: preview ? "preview-kit" : "delivery-kit",
          compactionAttempted: false,
          languageIntegrity: languageIntegrityForKit,
          pageParityDecision: storedPageParityDecision,
        });

        // ── Single-page expansion retry ────────────────────────────────────
        // If structured AI expanded a 1-page source to 2+ pages, retry with
        // faithful-light before returning an error. Parity modal is a last resort.
        let activeBuildResult = buildResult;
        if (
          (!activeBuildResult.success || !activeBuildResult.kitBuffer) &&
          sourcePageCount === 1 &&
          !singlePageSafeguardApplied &&
          (activeBuildResult.singlePageExpansionDetected || (activeBuildResult.translatedPageCount ?? 0) > 1)
        ) {
          const faithfulText = doc.translatedText?.trim() ?? null;
          if (faithfulText !== null && faithfulText.length > 50) {
            console.log(
              `${logPrefix} — single_page_expansion_retry: structured AI expanded 1→${activeBuildResult.translatedPageCount ?? '?'} pages ` +
              `for "${classification.documentType}", retrying with faithful-light`,
            );
            const retryHtml = buildTranslatedPageHtml({
              translatedHtml: compactParagraphsForContinuousText(sanitizeTranslationHtml(faithfulText)),
              documentTitle: doc.exactNameOnDoc ?? doc.docType ?? undefined,
              orientation: detectedOrientation === 'landscape' ? 'landscape' : 'portrait',
              layoutHint: isCertificateGenreDocumentType(classification.documentType) ? 'certificate' : 'standard',
            });
            faithfulLightHtml = retryHtml;
            activeBuildResult = await buildStructuredKitBuffer({
              structuredHtml: retryHtml,
              originalFileBuffer,
              isOriginalPdf,
              orderId,
              documentId,
              sourceLanguage: doc.sourceLanguage ?? undefined,
              targetLanguage: languageIntegrityForKit.targetLanguage,
              coverVariant,
              orientation: detectedOrientation === "landscape" ? "landscape" : undefined,
              documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? "Document",
              sourcePageCount,
              sourceArtifactType,
              sourcePageCountStrategy,
              groupedSourceImageCount: groupedSourceImageCountHint ?? undefined,
              originalFileUrl: doc.originalFileUrl,
              originalContentType: contentType,
              documentFamily: classification.documentType,
              rendererName: 'faithful_light_expansion_retry',
              modality: resolveDocumentTypeModality(classification.documentType),
              surface: preview ? "preview-kit" : "delivery-kit",
              compactionAttempted: false,
              languageIntegrity: languageIntegrityForKit,
              pageParityDecision: storedPageParityDecision,
            });

            const retryStayedSinglePage = (activeBuildResult.translatedPageCount ?? 0) <= 1;
            console.log(
              `${logPrefix} — single_page_routing: source_page_count=1 ` +
              `structured_ai_blocked=false rerouted=true ` +
              `final_output_single_page=${retryStayedSinglePage} ` +
              `document_type=${classification.documentType}`,
            );
          }
        }

        // ── Faithful-text render diagnostics ──────────────────────────────
        // Emitted for every faithful-light render attempt, regardless of
        // outcome. When source=1 and translated>1, saves an HTML snapshot.
        if (faithfulLightHtml !== null) {
          const resolvedLayoutHint = isCertificateGenreDocumentType(classification.documentType)
            ? 'certificate' as const
            : 'standard' as const;
          runFaithfulTextDiagnostics(logPrefix, {
            orderId,
            documentId,
            documentType: classification.documentType,
            modality,
            sourcePageCount: sourcePageCount ?? null,
            translatedPageCount: activeBuildResult.translatedPageCount ?? null,
            htmlForKit: faithfulLightHtml,
            orientation: detectedOrientation === 'landscape' ? 'landscape' : 'portrait',
            layoutHint: resolvedLayoutHint,
            rendererName: rendererNameForKit,
          });
        }

        if (!activeBuildResult.success || !activeBuildResult.kitBuffer) {
          const parityDetail =
            activeBuildResult.blockingReason === "page_parity_mismatch"
              ? ` Page parity failed: source=${activeBuildResult.sourcePageCount ?? "unknown"}, translated=${activeBuildResult.translatedPageCount ?? "unknown"}.`
              : activeBuildResult.blockingReason === "page_parity_unverifiable_source_page_count"
                ? " Page parity failed: source page count is unavailable, so parity cannot be verified."
                : activeBuildResult.blockingReason === "page_parity_decision_required"
                  ? " Page parity requires explicit decision. Open Preview Kit, choose the parity mode, and retry."
                  : activeBuildResult.blockingReason === "page_parity_manual_override_requires_justification"
                    ? " Page parity failed: manual override requires a textual justification."
                : activeBuildResult.blockingReason === "translated_zone_content_missing_or_source_language_detected"
                  ? " Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface."
                : "";

          if (sourcePageCount === 1) {
            console.log(
              `${logPrefix} — single_page_routing: source_page_count=1 ` +
              `structured_ai_blocked=${singlePageSafeguardApplied} ` +
              `rerouted=false final_output_single_page=false ` +
              `document_type=${classification.documentType}`,
            );
          }

          return {
            success: false,
            error:
              `Structured delivery kit assembly failed for "${classification.documentType}". ` +
              `Client-facing translated output is blocked by invariant.` +
              parityDetail +
              ` Check server logs for parity diagnostics and kit assembly details.`,
          };
        }

        if (sourcePageCount === 1) {
          const finalOutputSinglePage = (activeBuildResult.translatedPageCount ?? 0) <= 1;
          console.log(
            `${logPrefix} — single_page_routing: source_page_count=1 ` +
            `structured_ai_blocked=${singlePageSafeguardApplied} ` +
            `rerouted=${!singlePageSafeguardApplied && rendererNameForKit === 'faithful_light_expansion_retry'} ` +
            `final_output_single_page=${finalOutputSinglePage} ` +
            `document_type=${classification.documentType}`,
          );
        }

        finalPdfBuffer = activeBuildResult.kitBuffer;
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
