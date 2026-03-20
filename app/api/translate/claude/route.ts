import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sanitizeTranslationHtml } from "@/lib/translationHtmlSanitizer";
import { buildTranslationPrompt, buildUserMessage, type TranslationLanguage } from "@/lib/translationPrompt";
import { selectTranslationPipeline } from "@/services/translationRouter";
import { classifyDocument } from "@/services/documentClassifier";
import { isDocumentTypeInImplementedStructuredFamily } from "@/services/documentFamilyRegistry";
import {
  isEligibleForStructuredPipeline,
  dispatchStructuredPipeline,
} from "@/services/structuredPipeline";

// Allow up to 5 minutes for translation (large PDFs + retries on overload)
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Promobidocs — Claude Translation API Route
//
// Architecture (clean separation of concerns):
//
//   Layer 1: translationPrompt.ts  → WHAT to translate (USCIS rules, bracket
//            notation, domain expertise). Pure translation, zero HTML awareness.
//
//   Layer 2: this route (route.ts)  → HOW to call Claude (fetch file, build
//            message, invoke API, pass through sanitizer).
//
//   Layer 3: translationHtmlSanitizer.ts → HOW to format the output for
//            Gotenberg (flatten headings, compact tables, strip whitespace).
//
//   Layer 4: CARTORIO_CSS in generateDeliveryKit.ts → HOW the PDF looks
//            (fonts, margins, spacing — all in CSS, not in the prompt).
// ─────────────────────────────────────────────────────────────────────────────

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 4,   // retries on 529 (overloaded) and 529-class errors
  timeout: 120_000, // 2 min — large PDFs can be slow
});

const SOURCE_LANGUAGE_LABELS: Record<string, string> = {
  PT_BR: "Brazilian Portuguese",
  pt: "Portuguese",
  ES: "Spanish",
  es: "Spanish",
  FR: "French",
  fr: "French",
};

type TranslationModeSelected = "standard" | "faithful_layout" | "external_pdf";
type TranslationPipelineSelected =
  | "standard_structured"
  | "anthropic_blueprint"
  | "external_pdf";

function normalizeTranslationMode(
  value: unknown,
): TranslationModeSelected {
  if (
    value === "standard" ||
    value === "faithful_layout" ||
    value === "external_pdf"
  ) {
    return value;
  }
  return "standard";
}

function normalizeTranslationPipeline(
  value: unknown,
): TranslationPipelineSelected {
  if (
    value === "standard_structured" ||
    value === "anthropic_blueprint" ||
    value === "external_pdf"
  ) {
    return value;
  }
  return "standard_structured";
}

export async function POST(req: Request) {
  try {
    const {
      fileUrl,
      documentId,
      orderId,
      sourceLanguage = "pt",
      translationMode,
      translationPipeline,
      translationSelectionSource,
    } = await req.json();

    const normalizedTranslationMode = normalizeTranslationMode(translationMode);
    const normalizedTranslationPipeline = normalizeTranslationPipeline(translationPipeline);
    const forceBlueprintPipeline =
      normalizedTranslationMode === "faithful_layout" ||
      normalizedTranslationPipeline === "anthropic_blueprint";
    const externalPdfPipelineRequested =
      normalizedTranslationMode === "external_pdf" ||
      normalizedTranslationPipeline === "external_pdf";

    // Router: always 'legacy' until structured pipeline is implemented
    selectTranslationPipeline({ orderId, documentId });

    if (!fileUrl) {
      return NextResponse.json({ error: "fileUrl is required" }, { status: 400 });
    }
    if (externalPdfPipelineRequested) {
      return NextResponse.json(
        {
          error:
            "Use external PDF mode should not call Anthropic translation. Attach an external PDF and continue with external source.",
        },
        { status: 400 },
      );
    }

    const sourceLangLabel = SOURCE_LANGUAGE_LABELS[sourceLanguage] ?? sourceLanguage;

    // ── Fetch the source file ──
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch source file: ${fileRes.status}` },
        { status: 400 }
      );
    }

    const fileBuffer = await fileRes.arrayBuffer();
    const base64Data = Buffer.from(fileBuffer).toString("base64");
    const contentType = fileRes.headers.get("content-type") || "application/pdf";

    const isPdf = contentType.includes("pdf") || fileUrl.toLowerCase().includes(".pdf");
    const isImage =
      contentType.includes("image/") ||
      /\.(png|jpg|jpeg|gif|webp)$/i.test(fileUrl);

    // ── Layer 1: Pure translation prompt (no HTML awareness) ──
    const systemPrompt = buildTranslationPrompt(sourceLanguage as TranslationLanguage);
    const userMessage = buildUserMessage(sourceLangLabel, isPdf);

    // ── Build message content based on file type ──
    let messageContent: Anthropic.MessageParam["content"];

    if (isPdf) {
      messageContent = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64Data,
          },
        } as any,
        { type: "text", text: userMessage },
      ];
    } else if (isImage) {
      const imageMediaType = contentType.includes("png")
        ? "image/png"
        : contentType.includes("gif")
        ? "image/gif"
        : contentType.includes("webp")
        ? "image/webp"
        : "image/jpeg";

      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageMediaType,
            data: base64Data,
          },
        },
        { type: "text", text: userMessage },
      ];
    } else {
      const textContent = Buffer.from(fileBuffer).toString("utf-8");
      messageContent = [
        {
          type: "text",
          text: `${userMessage}\n\n<source_document>\n${textContent}\n</source_document>`,
        },
      ];
    }

    // ── Call Claude ──
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    });

    const rawTranslation =
      response.content[0].type === "text" ? response.content[0].text : "";

    if (!rawTranslation) {
      return NextResponse.json({ error: "Claude returned empty translation" }, { status: 500 });
    }

    // ── Document classification (auxiliary — does not affect translation output) ──
    const classification = classifyDocument({ fileUrl, translatedText: rawTranslation, sourceLanguage });
    console.log(
      `[documentClassifier] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `detected document type: ${classification.documentType} (confidence: ${classification.confidence})`
    );

    // ── Structured pipeline (forced by modality when faithful_layout is selected) ──
    const structuredEligible = isEligibleForStructuredPipeline(classification.documentType);
    const structuredFamilyImplemented = isDocumentTypeInImplementedStructuredFamily(
      classification.documentType,
    );
    const shouldRunStructuredPipeline = forceBlueprintPipeline
      ? structuredFamilyImplemented
      : structuredEligible;

    console.log(
      `[structuredPipeline] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `mode=${normalizedTranslationMode} pipeline=${normalizedTranslationPipeline} ` +
      `selectionSource=${translationSelectionSource ?? "unknown"} ` +
      `forceBlueprint=${forceBlueprintPipeline ? "yes" : "no"} ` +
      `eligibleByFlag=${structuredEligible ? "yes" : "no"} ` +
      `familyImplemented=${structuredFamilyImplemented ? "yes" : "no"}`
    );

    if (forceBlueprintPipeline && !structuredFamilyImplemented) {
      return NextResponse.json(
        {
          error:
            "Faithful to the original document is not available for this document family. Choose Standard for this document.",
        },
        { status: 422 },
      );
    }

    if (shouldRunStructuredPipeline) {
      try {
        console.log(
          `[structuredPipeline] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — structured pipeline executed: yes`
        );
        const structuredResult = await dispatchStructuredPipeline(client, {
          fileBuffer,
          fileUrl,
          contentType,
          sourceLanguage,
          orderId,
          documentId,
        }, classification.documentType);

        if (forceBlueprintPipeline && !structuredResult.success) {
          return NextResponse.json(
            {
              error:
                structuredResult.error ||
                "Faithful pipeline failed for this document. Try Standard.",
            },
            { status: 502 },
          );
        }
      } catch (structuredErr) {
        // Defensive outer catch — dispatchStructuredPipeline already catches internally
        console.error(
          `[structuredPipeline] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
          `unexpected error escaped pipeline: ${structuredErr}`
        );
        if (forceBlueprintPipeline) {
          return NextResponse.json(
            {
              error:
                "Faithful pipeline failed unexpectedly. Try Standard or check document compatibility.",
            },
            { status: 502 },
          );
        }
      }
    } else {
      console.log(
        `[structuredPipeline] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — structured pipeline executed: no`
      );
    }

    // ── Layer 3: Sanitize for Gotenberg (format HTML, compact layout) ──
    const translatedText = sanitizeTranslationHtml(rawTranslation);

    console.log(
      `[/api/translate/claude] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `Raw: ${rawTranslation.length} chars → Sanitized: ${translatedText.length} chars ` +
      `(${Math.round((1 - translatedText.length / rawTranslation.length) * 100)}% reduction)`
    );

    return NextResponse.json({
      translatedText,
      translationMode: normalizedTranslationMode,
      translationPipeline: forceBlueprintPipeline
        ? "anthropic_blueprint"
        : "standard_structured",
      structuredPipelineExecuted: shouldRunStructuredPipeline,
      structuredPipelineForced: forceBlueprintPipeline,
    });
  } catch (error: any) {
    console.error("[/api/translate/claude] Error:", error);
    const anthropicStatus = error?.status ?? 0;
    const isTransient = anthropicStatus === 529 || anthropicStatus === 500 || anthropicStatus === 503
      || error?.message?.includes("overloaded") || error?.message?.includes("Internal server error");
    const status = isTransient ? 503 : 500;
    const message = isTransient
      ? "Serviço de IA temporariamente indisponível. Aguarde alguns segundos e tente novamente."
      : (error.message || String(error));
    return NextResponse.json({ error: message }, { status });
  }
}
