import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sanitizeTranslationHtml, sanitizeTranslationHtmlFaithful, compactParagraphsForContinuousText } from "@/lib/translationHtmlSanitizer";
import { buildTranslationPrompt, buildFaithfulTranslationPrompt, buildContinuousTextTranslationPrompt, buildUserMessage, type TranslationLanguage } from "@/lib/translationPrompt";
import { selectTranslationPipeline } from "@/services/translationRouter";
import { classifyDocument } from "@/services/documentClassifier";
import { isDocumentTypeInImplementedStructuredFamily } from "@/services/documentFamilyRegistry";
import { dispatchStructuredPipeline } from "@/services/structuredPipeline";

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

// Document types whose source is continuous prose rather than structured forms.
// These use a flowing-paragraph prompt and standard (flattening) sanitizer to
// prevent table injection and per-sentence paragraph splitting.
const CONTINUOUS_TEXT_DOCUMENT_TYPES = new Set([
  'editorial_news_pages',
]);

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
      pageCount,
    } = await req.json();

    const normalizedTranslationMode = normalizeTranslationMode(translationMode);
    const normalizedTranslationPipeline = normalizeTranslationPipeline(translationPipeline);
    const forceBlueprintPipeline =
      normalizedTranslationMode === "faithful_layout" ||
      normalizedTranslationPipeline === "anthropic_blueprint";
    const externalPdfPipelineRequested =
      normalizedTranslationMode === "external_pdf" ||
      normalizedTranslationPipeline === "external_pdf";

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

    // ── Pre-classify from URL for prompt selection ──
    // Pipeline routing requires post-translation classification, but we must pick
    // a prompt before calling Claude. A fileUrl-only pre-classification provides
    // an early structural signal: if the filename reliably hints at a structured
    // family (e.g. "casamento", "diploma", "transcript"), use the faithful prompt
    // so Claude emits HTML tables. The authoritative classification (~line 215)
    // still drives routing — this only determines the prompt.
    const preClassification = classifyDocument({ fileUrl, sourceLanguage });
    const preClassifiedAsStructured =
      isDocumentTypeInImplementedStructuredFamily(preClassification.documentType);
    console.log(
      `[/api/translate/claude] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `preClassification=${preClassification.documentType} (${preClassification.confidence}) ` +
      `preClassifiedAsStructured=${preClassifiedAsStructured}`,
    );

    // ── Layer 1: Translation prompt ──
    // Continuous-text path: pre-classified as a flowing-prose family (news, editorial, etc.).
    //   Uses flowing-paragraph output rules — prevents table injection and sentence splitting.
    // Faithful path: operator forced blueprint OR pre-classified as structured civil-registry family.
    // Standard path: all other cases.
    const preClassifiedAsContinuousText = CONTINUOUS_TEXT_DOCUMENT_TYPES.has(preClassification.documentType);
    const useFaithfulPrompt = !preClassifiedAsContinuousText && (forceBlueprintPipeline || preClassifiedAsStructured);
    const systemPrompt = preClassifiedAsContinuousText
      ? buildContinuousTextTranslationPrompt(sourceLanguage as TranslationLanguage)
      : useFaithfulPrompt
        ? buildFaithfulTranslationPrompt(sourceLanguage as TranslationLanguage)
        : buildTranslationPrompt(sourceLanguage as TranslationLanguage);
    // pageCount from request body powers the density hint in the user message.
    const userMessage = buildUserMessage(sourceLangLabel, isPdf, pageCount ?? undefined);

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

    // ── Document classification ──
    const classification = classifyDocument({ fileUrl, translatedText: rawTranslation, sourceLanguage });
    console.log(
      `[documentClassifier] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `detected document type: ${classification.documentType} (confidence: ${classification.confidence})`
    );

    // ── Router: select pipeline based on classification ──
    const pipeline = selectTranslationPipeline({
      orderId,
      documentId,
      documentType: classification.documentType,
      forcedBlueprint: forceBlueprintPipeline,
    });
    const structuredFamilyImplemented = isDocumentTypeInImplementedStructuredFamily(
      classification.documentType,
    );
    const shouldRunStructuredPipeline = pipeline === 'structured';

    console.log(
      `[structuredPipeline] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `mode=${normalizedTranslationMode} pipeline=${normalizedTranslationPipeline} ` +
      `selectionSource=${translationSelectionSource ?? "unknown"} ` +
      `forceBlueprint=${forceBlueprintPipeline ? "yes" : "no"} ` +
      `routerDecision=${pipeline} familyImplemented=${structuredFamilyImplemented ? "yes" : "no"}`
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

    let structuredPipelineFailed = false;
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

        if (!structuredResult.success) {
          structuredPipelineFailed = true;
          console.warn(
            `[structuredPipeline] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
            `structured pipeline failed: ${structuredResult.error ?? "unknown error"}`
          );
          if (forceBlueprintPipeline) {
            return NextResponse.json(
              {
                error:
                  structuredResult.error ||
                  "Faithful pipeline failed for this document. Try Standard.",
              },
              { status: 502 },
            );
          }
        }
      } catch (structuredErr) {
        structuredPipelineFailed = true;
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

    // ── Layer 3: Sanitize for Gotenberg ──
    // Continuous-text path: standard sanitizer (flattens spurious tables, compacts layout).
    //   Faithful sanitizer is intentionally NOT used here — it preserves tables, which
    //   inflates page count for flowing prose documents.
    // Faithful path: faithful sanitizer — preserves table structure for civil-registry forms.
    // Standard path: standard sanitizer.
    const isFaithfulPath = pipeline === 'structured';
    const isContinuousTextPath = CONTINUOUS_TEXT_DOCUMENT_TYPES.has(classification.documentType);
    let translatedText = isFaithfulPath && !isContinuousTextPath
      ? sanitizeTranslationHtmlFaithful(rawTranslation)
      : sanitizeTranslationHtml(rawTranslation);

    // ── Early density guard ──
    // For continuous-text families, merge adjacent over-split paragraphs before
    // saving to the database. This prevents layout inflation from reaching the
    // final parity check at kit generation.
    // Heuristic: ~20 structural elements per page; compact if >2× expected count.
    const structuralElementCount =
      (translatedText.match(/<p[\s>]/gi) ?? []).length +
      (translatedText.match(/<tr[\s>]/gi) ?? []).length;
    const pageDivergenceFlag = structuralElementCount > 100;

    if (isContinuousTextPath && pageDivergenceFlag) {
      const expectedElements = (pageCount ?? 1) * 20;
      if (structuralElementCount > expectedElements * 2) {
        translatedText = compactParagraphsForContinuousText(translatedText);
        const compactedCount =
          (translatedText.match(/<p[\s>]/gi) ?? []).length +
          (translatedText.match(/<tr[\s>]/gi) ?? []).length;
        console.log(
          `[densityGuard] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
          `paragraph compaction applied: ${structuralElementCount} → ${compactedCount} structural elements ` +
          `(expected ~${expectedElements} for ${pageCount ?? 1} page(s))`
        );
      }
    }

    console.log(
      `[/api/translate/claude] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `Raw: ${rawTranslation.length} chars → Sanitized: ${translatedText.length} chars ` +
      `(${Math.round((1 - translatedText.length / rawTranslation.length) * 100)}% reduction) ` +
      `faithfulPath=${isFaithfulPath} continuousTextPath=${isContinuousTextPath} ` +
      `structuralElements=${structuralElementCount} pageDivergenceFlag=${pageDivergenceFlag}`
    );

    return NextResponse.json({
      translatedText,
      translationMode: normalizedTranslationMode,
      translationPipeline: forceBlueprintPipeline
        ? "anthropic_blueprint"
        : "standard_structured",
      structuredPipelineExecuted: shouldRunStructuredPipeline,
      structuredPipelineForced: forceBlueprintPipeline,
      structuredPipelineFailed,
      faithfulPathUsed: isFaithfulPath,
      continuousTextPathUsed: isContinuousTextPath,
      structuralElementCount,
      pageDivergenceFlag,
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
