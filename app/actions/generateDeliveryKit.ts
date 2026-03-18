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
  renderStructuredFamilyDocument,
} from "@/services/structuredDocumentRenderer";

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

    if (!doc.translatedText) {
      return { success: false, error: `Document ${documentId} has no translatedText.` };
    }

    const logPrefix = `[generateDeliveryKit] Order #${orderId} Doc #${documentId}`;

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

    // ── Step 2: Get page count and orientation from original PDF ──────────────
    let sourcePageCount: number | undefined;
    let detectedOrientation: DocumentOrientation = "unknown";

    if (isOriginalPdf && originalFileBuffer.byteLength > 0) {
      try {
        const pdfDoc = await PDFDocument.load(originalFileBuffer, { ignoreEncryption: true });
        sourcePageCount = pdfDoc.getPageCount();
        const orientResult = detectOrientationFromPdfDoc(pdfDoc);
        detectedOrientation = orientResult.orientation;
        console.log(
          `${logPrefix} — original pages: ${sourcePageCount}, orientation: ${detectedOrientation}`
        );
      } catch {
        console.warn(`${logPrefix} — PDF metadata extraction failed`);
      }
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
        logPrefix,
      });

      const orientationForKit = resolved.orientationForKit;
      const coverVariant: "pt-en" | "es-en" =
        (doc.sourceLanguage ?? "").toUpperCase() === "ES" ? "es-en" : "pt-en";

      const buildResult = await buildStructuredKitBuffer({
        structuredHtml: resolved.structuredHtml,
        originalFileBuffer,
        isOriginalPdf,
        orderId,
        documentId,
        sourceLanguage: doc.sourceLanguage ?? undefined,
        coverVariant,
        orientation: orientationForKit === "landscape" ? "landscape" : undefined,
        documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? "Document",
        sourcePageCount,
        documentFamily: renderAssertion.family,
        rendererName: resolved.rendererName,
        surface: preview ? "preview-kit" : "delivery-kit",
        compactionAttempted: false,
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
      await prisma.document.update({
        where: { id: documentId },
        data: {
          delivery_pdf_url: urlData.publicUrl,
          translation_status: "approved",
        },
      });
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
