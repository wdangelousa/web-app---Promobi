"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PDFDocument } from "pdf-lib";
import fs from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { classifyDocument } from "@/services/documentClassifier";
import {
  buildStructuredKitBuffer,
} from "@/services/structuredPreviewKit";
import {
  buildStructuredMarriageCertSystemPrompt,
  buildStructuredUserMessage,
} from "@/lib/structuredTranslationPrompt";
import {
  buildCertificateLandscapeSystemPrompt,
  buildCertificateLandscapeUserMessage,
} from "@/lib/certificateLandscapePrompt";
import {
  buildAcademicDiplomaSystemPrompt,
  buildAcademicDiplomaUserMessage,
} from "@/lib/academicDiplomaPrompt";
import {
  buildAcademicTranscriptSystemPrompt,
  buildAcademicTranscriptUserMessage,
} from "@/lib/academicTranscriptPrompt";
import {
  buildBirthCertificateSystemPrompt,
  buildBirthCertificateUserMessage,
} from "@/lib/birthCertificatePrompt";
import { renderMarriageCertificateHtml } from "@/lib/marriageCertRenderer";
import { renderCertificateLandscapeHtml } from "@/lib/certificateLandscapeRenderer";
import { renderAcademicDiplomaHtml } from "@/lib/academicDiplomaRenderer";
import { renderAcademicTranscriptHtml } from "@/lib/academicTranscriptRenderer";
import { renderBirthCertificateHtml } from "@/lib/birthCertificateRenderer";
import {
  detectOrientationFromPdfDoc,
  type DocumentOrientation,
} from "@/lib/documentOrientationDetector";
import type { MarriageCertificateBrazil } from "@/types/marriageCertificate";
import type { CourseCertificateLandscape } from "@/types/certificateLandscape";
import type { AcademicDiplomaCertificate } from "@/types/academicDiploma";
import type { AcademicTranscript } from "@/types/academicTranscript";
import type { BirthCertificateBrazil } from "@/types/birthCertificate";

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

const GOTENBERG_URL =
  process.env.GOTENBERG_URL?.trim() ||
  "http://127.0.0.1:3001/forms/chromium/convert/html";

// ── Helpers (used by legacy fallback renderer) ────────────────────────────────

function sanitizeTranslatedHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<html[^>]*>/gi, "")
    .replace(/<\/html>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<body[^>]*>/gi, "")
    .replace(/<\/body>/gi, "")
    .replace(/```html/gi, "")
    .replace(/```/gi, "")
    .trim();
}

async function loadLetterheadBytes(): Promise<Buffer> {
  const rootPath = path.join(process.cwd(), "letterhead.png");
  const publicFallbackPath = path.join(process.cwd(), "public", "letterhead.png");
  try {
    return await fs.readFile(rootPath);
  } catch {
    try {
      return await fs.readFile(publicFallbackPath);
    } catch {
      throw new Error("ERRO CRÍTICO: Imagem 'letterhead.png' não encontrada.");
    }
  }
}

/**
 * Legacy linear renderer — used only when document family is unsupported
 * or when structured extraction/assembly fails completely.
 */
async function renderTranslatedSectionWithLetterhead(
  translatedHtml: string
): Promise<Buffer> {
  const cleanHtml = sanitizeTranslatedHtml(translatedHtml);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: letter; margin: 0; }
    html, body {
      margin: 0; padding: 0;
      background: transparent !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: "Times New Roman", Times, serif;
      color: black; width: 100%;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body { font-size: 10.5pt; line-height: 1.28; word-break: break-word; overflow-wrap: break-word; }
    .content-area { box-sizing: border-box; padding-top: 150px; padding-bottom: 90px; padding-left: 62px; padding-right: 62px; width: 100%; }
    .translation-body { width: 100%; }
    .translation-body h1, .translation-body h2, .translation-body h3,
    .translation-body h4, .translation-body h5, .translation-body h6 {
      font-family: "Times New Roman", Times, serif; color: #000; margin: 0 0 6pt 0; line-height: 1.15; font-weight: bold;
    }
    .translation-body h1 { font-size: 13pt; }
    .translation-body h2 { font-size: 12pt; }
    .translation-body h3 { font-size: 11.5pt; }
    .translation-body h4, .translation-body h5, .translation-body h6 { font-size: 11pt; }
    .translation-body p { margin: 0 0 5pt 0; text-align: justify; line-height: 1.28; }
    .translation-body ul, .translation-body ol { margin: 0 0 6pt 18pt; padding: 0; }
    .translation-body li { margin: 0 0 3pt 0; }
    .translation-body table { width: 100%; border-collapse: collapse; border-spacing: 0; table-layout: fixed; margin: 6pt 0; font-size: 9pt; page-break-inside: avoid; }
    .translation-body th, .translation-body td { border: 0.75pt solid #000; padding: 4pt; vertical-align: top; text-align: left; word-break: break-word; overflow-wrap: break-word; }
    .translation-body img { max-width: 100%; height: auto; }
    .translation-body .text-center { text-align: center; }
    .translation-body .text-right { text-align: right; }
    .translation-body .text-left { text-align: left; }
    .translation-body .no-break { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="content-area">
    <div class="translation-body">${cleanHtml}</div>
  </div>
</body>
</html>`;

  const formData = new FormData();
  formData.append("files", new File([html], "index.html", { type: "text/html" }));
  formData.append("paperWidth", "8.5");
  formData.append("paperHeight", "11");
  formData.append("marginTop", "0");
  formData.append("marginBottom", "0");
  formData.append("marginLeft", "0");
  formData.append("marginRight", "0");
  formData.append("printBackground", "true");
  formData.append("preferCssPageSize", "false");
  formData.append("skipNetworkIdleEvent", "true");

  const gotenbergRes = await fetch(GOTENBERG_URL, { method: "POST", body: formData });
  if (!gotenbergRes.ok) {
    const errorText = await gotenbergRes.text();
    throw new Error(`Gotenberg translated section failed: ${gotenbergRes.status} - ${errorText}`);
  }

  const translatedPdfBuffer = Buffer.from(await gotenbergRes.arrayBuffer());
  const letterheadBytes = await loadLetterheadBytes();

  const finalPdf = await PDFDocument.create();
  const translatedPdf = await PDFDocument.load(translatedPdfBuffer);
  const embeddedPages = await finalPdf.embedPages(translatedPdf.getPages());
  const letterheadImage = await finalPdf.embedPng(letterheadBytes);

  for (const embeddedPage of embeddedPages) {
    const { width, height } = embeddedPage;
    const page = finalPdf.addPage([width, height]);
    page.drawPage(embeddedPage, { x: 0, y: 0, width, height });
    page.drawImage(letterheadImage, { x: 0, y: 0, width, height, opacity: 1 });
  }

  return Buffer.from(await finalPdf.save());
}

// ── Structured extraction helpers ─────────────────────────────────────────────

function stripMarkdownFences(raw: string): string {
  return raw
    .replace(/^```json?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

async function callClaudeForJson(
  client: Anthropic,
  systemPrompt: string,
  messageContent: Anthropic.MessageParam["content"],
  maxTokens: number,
  logPrefix: string
): Promise<string | null> {
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    });
    const raw =
      response.content[0].type === "text" ? response.content[0].text : "";
    if (!raw) {
      console.warn(`${logPrefix} — Claude returned empty response`);
      return null;
    }
    return raw;
  } catch (err) {
    console.error(`${logPrefix} — Claude API error: ${err}`);
    return null;
  }
}

function buildMessageContent(
  fileBuffer: ArrayBuffer,
  fileUrl: string,
  contentType: string,
  userMessage: string
): Anthropic.MessageParam["content"] {
  const base64Data = Buffer.from(fileBuffer).toString("base64");
  const isPdf =
    contentType.includes("pdf") || fileUrl.toLowerCase().includes(".pdf");
  const isImage =
    contentType.includes("image/") ||
    /\.(png|jpg|jpeg|gif|webp)$/i.test(fileUrl);

  if (isPdf) {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64Data },
      } as any,
      { type: "text", text: userMessage },
    ];
  }

  if (isImage) {
    const imageMediaType: "image/png" | "image/gif" | "image/webp" | "image/jpeg" =
      contentType.includes("png")
        ? "image/png"
        : contentType.includes("gif")
        ? "image/gif"
        : contentType.includes("webp")
        ? "image/webp"
        : "image/jpeg";
    return [
      {
        type: "image",
        source: { type: "base64", media_type: imageMediaType, data: base64Data },
      },
      { type: "text", text: userMessage },
    ];
  }

  const textContent = Buffer.from(fileBuffer).toString("utf-8");
  return [
    {
      type: "text",
      text: `${userMessage}\n\n<source_document>\n${textContent}\n</source_document>`,
    },
  ];
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
    const classification = classifyDocument({
      fileUrl: doc.originalFileUrl ?? undefined,
      translatedText: doc.translatedText,
      sourceLanguage: doc.sourceLanguage ?? undefined,
    });

    console.log(
      `${logPrefix} — classified: ${classification.documentType} (${classification.confidence})`
    );

    const isMarriageCert       = classification.documentType === "marriage_certificate_brazil";
    const isBirthCert          = classification.documentType === "birth_certificate_brazil";
    const isAcademicDiploma    = classification.documentType === "academic_diploma_certificate";
    const isAcademicTranscript = classification.documentType === "academic_transcript";
    const isCertLandscape      = classification.documentType === "course_certificate_landscape";
    const isEligible           = isMarriageCert || isBirthCert || isAcademicDiploma || isAcademicTranscript || isCertLandscape;

    // ── Step 4: Structured extraction + rendering ─────────────────────────────
    let finalPdfBuffer: Buffer | null = null;

    if (isEligible && doc.originalFileUrl && originalFileBuffer.byteLength > 0) {
      let structuredHtml: string | null = null;
      let orientationForKit: DocumentOrientation = detectedOrientation;

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      if (isMarriageCert) {
        const msgContent = buildMessageContent(
          originalFileBuffer,
          doc.originalFileUrl,
          contentType,
          buildStructuredUserMessage()
        );
        const rawJson = await callClaudeForJson(
          client,
          buildStructuredMarriageCertSystemPrompt(),
          msgContent,
          8192,
          `${logPrefix} [marriage-cert]`
        );
        if (rawJson) {
          try {
            const parsed = JSON.parse(stripMarkdownFences(rawJson)) as MarriageCertificateBrazil;
            structuredHtml = renderMarriageCertificateHtml(parsed, {
              pageCount: sourcePageCount,
              orientation:
                detectedOrientation === "landscape"
                  ? "landscape"
                  : detectedOrientation === "portrait"
                  ? "portrait"
                  : "unknown",
            });
          } catch (e) {
            console.error(`${logPrefix} — marriage cert render failed: ${e}`);
          }
        }

      } else if (isCertLandscape) {
        const msgContent = buildMessageContent(
          originalFileBuffer,
          doc.originalFileUrl,
          contentType,
          buildCertificateLandscapeUserMessage()
        );
        const rawJson = await callClaudeForJson(
          client,
          buildCertificateLandscapeSystemPrompt(),
          msgContent,
          4096,
          `${logPrefix} [cert-landscape]`
        );
        if (rawJson) {
          try {
            const parsed = JSON.parse(stripMarkdownFences(rawJson)) as CourseCertificateLandscape;
            let effectiveOrientation: DocumentOrientation = detectedOrientation;
            if (detectedOrientation === "portrait" && sourcePageCount === 1) {
              effectiveOrientation = "landscape";
            } else if (detectedOrientation === "unknown") {
              effectiveOrientation = "landscape";
            }
            orientationForKit = effectiveOrientation;
            parsed.orientation = detectedOrientation;
            parsed.page_count = sourcePageCount ?? null;
            structuredHtml = renderCertificateLandscapeHtml(parsed, {
              pageCount: sourcePageCount,
              orientation: effectiveOrientation,
            });
          } catch (e) {
            console.error(`${logPrefix} — cert landscape render failed: ${e}`);
          }
        }

      } else if (isAcademicDiploma) {
        const effectiveOrientation: DocumentOrientation =
          detectedOrientation === "unknown" ? "landscape" : detectedOrientation;
        orientationForKit = effectiveOrientation;
        const msgContent = buildMessageContent(
          originalFileBuffer,
          doc.originalFileUrl,
          contentType,
          buildAcademicDiplomaUserMessage()
        );
        const rawJson = await callClaudeForJson(
          client,
          buildAcademicDiplomaSystemPrompt(),
          msgContent,
          8192,
          `${logPrefix} [academic-diploma]`
        );
        if (rawJson) {
          try {
            const parsed = JSON.parse(stripMarkdownFences(rawJson)) as AcademicDiplomaCertificate;
            parsed.orientation = detectedOrientation;
            parsed.page_count = sourcePageCount ?? null;
            structuredHtml = renderAcademicDiplomaHtml(parsed, {
              pageCount: sourcePageCount,
              orientation: effectiveOrientation,
            });
          } catch (e) {
            console.error(`${logPrefix} — academic diploma render failed: ${e}`);
          }
        }

      } else if (isAcademicTranscript) {
        const msgContent = buildMessageContent(
          originalFileBuffer,
          doc.originalFileUrl,
          contentType,
          buildAcademicTranscriptUserMessage()
        );
        const rawJson = await callClaudeForJson(
          client,
          buildAcademicTranscriptSystemPrompt(),
          msgContent,
          8192,
          `${logPrefix} [academic-transcript]`
        );
        if (rawJson) {
          try {
            const parsed = JSON.parse(stripMarkdownFences(rawJson)) as AcademicTranscript;
            parsed.orientation = detectedOrientation;
            parsed.page_count = sourcePageCount ?? null;
            structuredHtml = renderAcademicTranscriptHtml(parsed, {
              pageCount: sourcePageCount,
              orientation: detectedOrientation,
            });
          } catch (e) {
            console.error(`${logPrefix} — academic transcript render failed: ${e}`);
          }
        }

      } else {
        // isBirthCert
        const msgContent = buildMessageContent(
          originalFileBuffer,
          doc.originalFileUrl,
          contentType,
          buildBirthCertificateUserMessage()
        );
        const rawJson = await callClaudeForJson(
          client,
          buildBirthCertificateSystemPrompt(),
          msgContent,
          6144,
          `${logPrefix} [birth-cert]`
        );
        if (rawJson) {
          try {
            const parsed = JSON.parse(stripMarkdownFences(rawJson)) as BirthCertificateBrazil;
            parsed.orientation = detectedOrientation;
            parsed.page_count = sourcePageCount ?? null;
            structuredHtml = renderBirthCertificateHtml(parsed, {
              pageCount: sourcePageCount,
              orientation: detectedOrientation,
            });
          } catch (e) {
            console.error(`${logPrefix} — birth cert render failed: ${e}`);
          }
        }
      }

      if (structuredHtml) {
        const coverVariant: "pt-en" | "es-en" =
          (doc.sourceLanguage ?? "").toUpperCase() === "ES" ? "es-en" : "pt-en";

        finalPdfBuffer = await buildStructuredKitBuffer({
          structuredHtml,
          originalFileBuffer,
          isOriginalPdf,
          orderId,
          documentId,
          sourceLanguage: doc.sourceLanguage ?? undefined,
          coverVariant,
          orientation: orientationForKit === "landscape" ? "landscape" : undefined,
          documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? "Document",
          sourcePageCount,
        });

        if (finalPdfBuffer) {
          console.log(
            `${logPrefix} — structured delivery kit assembled: ${finalPdfBuffer.length} bytes ` +
            `(family: ${classification.documentType})`
          );
        } else {
          console.warn(`${logPrefix} — buildStructuredKitBuffer returned null for ${classification.documentType}`);
        }
      } else {
        console.warn(`${logPrefix} — structured extraction produced no HTML for ${classification.documentType}`);
      }

    } else if (isEligible) {
      // Eligible family but original file is missing — structured rendering requires it.
      return {
        success: false,
        error: `Structured rendering is required for "${classification.documentType}" but the original file is not available. Re-upload the original document and try again.`,
      };
    } else {
      console.log(`${logPrefix} — unsupported family (${classification.documentType}), using legacy renderer`);
    }

    // ── Step 5: Legacy fallback ───────────────────────────────────────────────
    // Used only when family is truly unsupported (unknown) and no structured renderer exists.
    // Eligible families that fail at extraction or assembly return an error — never legacy.
    if (!finalPdfBuffer) {
      if (isEligible) {
        return {
          success: false,
          error: `Structured rendering failed for "${classification.documentType}" — extraction or rendering error. Check server logs for details.`,
        };
      }
      console.log(`${logPrefix} — using legacy renderTranslatedSectionWithLetterhead`);
      finalPdfBuffer = await renderTranslatedSectionWithLetterhead(doc.translatedText);
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
  translatedHtml: string,
  _documentType: string = "Document",
  _sourceLanguage: string = "PT_BR"
): Promise<DeliveryKitResult> {
  try {
    const finalPdfBuffer = await renderTranslatedSectionWithLetterhead(translatedHtml);
    return {
      success: true,
      pdfBase64: finalPdfBuffer.toString("base64"),
      fileName: `preview-${documentId}.pdf`,
    };
  } catch (error) {
    console.error("[PreviewPDF] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
