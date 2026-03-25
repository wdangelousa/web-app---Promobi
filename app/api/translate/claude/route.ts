import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sanitizeTranslationHtml, sanitizeTranslationHtmlFaithful, compactParagraphsForContinuousText, compactTranslatorNoteParagraphs, validateCanonicalArtifact } from "@/lib/translationHtmlSanitizer";
import { buildTranslationPrompt, buildFaithfulTranslationPrompt, buildContinuousTextTranslationPrompt, buildUserMessage, type TranslationLanguage } from "@/lib/translationPrompt";
import { classifyDocument } from "@/services/documentClassifier";
// Used as a prompt-quality hint only — NOT a rendering gate.
import { isDocumentTypeInImplementedStructuredFamily } from "@/services/documentFamilyRegistry";

// Allow up to 5 minutes for translation (large PDFs + retries on overload)
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Promobidocs — Claude Translation API Route
//
// Canonical pipeline (single path):
//
//   Layer 1: translationPrompt.ts  → WHAT to translate (USCIS rules, bracket
//            notation, domain expertise). Pure translation, zero HTML awareness.
//            Prompt variant (standard / faithful / continuous-text) is chosen
//            as a quality hint from document pre-classification — not a gate.
//
//   Layer 2: this route (route.ts)  → HOW to call Claude (fetch file, build
//            message, invoke API, pass through sanitizer).
//
//   Layer 3: translationHtmlSanitizer.ts → HOW to format the output for
//            Gotenberg (flatten headings, compact tables, strip whitespace).
//
//   Layer 4: CSS in generateDeliveryKit.ts → HOW the PDF looks
//            (fonts, margins, spacing — all in CSS, not in the prompt).
//
// Document family/type is used ONLY as a prompt-quality hint. It does not
// gate translation, preview, or delivery.
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

    // ── Pre-classify from URL for prompt selection (quality hint only) ──
    // We pick a prompt before calling Claude using a filename-only signal.
    // If the filename hints at a structured form (e.g. "casamento", "diploma",
    // "transcript"), use the faithful prompt so Claude emits HTML tables.
    // This classification is a QUALITY HINT — it does not gate rendering or delivery.
    const preClassification = classifyDocument({ fileUrl, sourceLanguage });
    const preClassifiedAsStructured =
      isDocumentTypeInImplementedStructuredFamily(preClassification.documentType);
    console.log(
      `[/api/translate/claude] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `preClassification=${preClassification.documentType} (${preClassification.confidence}) ` +
      `preClassifiedAsStructured=${preClassifiedAsStructured} (prompt-quality hint only)`,
    );

    // ── Layer 1: Translation prompt ──
    // Continuous-text path: pre-classified as a flowing-prose family (news, editorial).
    //   Uses flowing-paragraph output rules — prevents table injection and sentence splitting.
    // Faithful path: operator requested faithful_layout OR filename hints at a structured form.
    //   Prompt instructs Claude to preserve table structure in HTML output.
    // Standard path: all other cases.
    // None of these paths gate rendering — they only tune Claude output quality.
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
    // max_tokens: 16000 — 8192 was insufficient for dense 2-page documents.
    // A scanned diploma + back-page apostille can exceed 8192 output tokens,
    // causing the second <section class="page"> to be truncated and lost.
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    });

    const rawTranslation =
      response.content[0].type === "text" ? response.content[0].text : "";

    if (!rawTranslation) {
      return NextResponse.json({ error: "Claude returned empty translation" }, { status: 500 });
    }

    // ── Post-translation classification (metadata hint only) ──
    // Used only for sanitizer selection and logging. Does NOT gate rendering.
    const classification = classifyDocument({ fileUrl, translatedText: rawTranslation, sourceLanguage });
    console.log(
      `[documentClassifier] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `detected document type: ${classification.documentType} (confidence: ${classification.confidence}) ` +
      `mode=${normalizedTranslationMode} selectionSource=${translationSelectionSource ?? "unknown"} ` +
      `faithfulPromptUsed=${useFaithfulPrompt ? "yes" : "no"} ` +
      `postClassifiedAsStructured=${isDocumentTypeInImplementedStructuredFamily(classification.documentType)}`
    );

    // ── Layer 3: Sanitize for Gotenberg ──
    // Continuous-text path: standard sanitizer (flattens spurious tables, compacts layout).
    //   Faithful sanitizer is intentionally NOT used here — it preserves tables, which
    //   inflates page count for flowing prose documents.
    // Faithful path: faithful sanitizer — preserves table structure.
    //   Triggered by EITHER pre-classification (prompt hint) OR post-classification
    //   (translated content confirms structured form).  This ensures certificates
    //   with generic filenames still get table-preserving sanitization when the
    //   post-classification detects them as structured documents.
    // Standard path: standard sanitizer (all other cases).
    const isContinuousTextPath = CONTINUOUS_TEXT_DOCUMENT_TYPES.has(classification.documentType);
    const postClassifiedAsStructured =
      isDocumentTypeInImplementedStructuredFamily(classification.documentType);
    const useFaithfulSanitizer =
      !isContinuousTextPath && (useFaithfulPrompt || postClassifiedAsStructured);
    let translatedText = useFaithfulSanitizer
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

    // ── Canonical finalization ──────────────────────────────────────────────
    // Apply all remaining cleanup BEFORE persistence so that translatedText
    // is a fully-finalized artifact.  Preview and delivery render it as-is.
    translatedText = compactParagraphsForContinuousText(translatedText);
    translatedText = compactTranslatorNoteParagraphs(translatedText);

    // ── Canonical artifact validation ─────────────────────────────────────────
    // Catch clearly broken artifacts before persistence.  Hard-fail returns a
    // 422 so the caller records a generation_error instead of saving junk.
    const validation = validateCanonicalArtifact(
      translatedText,
      pageCount,
      response.stop_reason,
    );

    console.log(
      `[artifactValidation] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `status=${validation.status} textLength=${validation.textLength} ` +
      `tagCount=${validation.tagCount} sectionCount=${validation.sectionCount}` +
      (validation.warnings.length > 0 ? ` warnings=[${validation.warnings.join('; ')}]` : '') +
      (validation.failReasons.length > 0 ? ` failReasons=[${validation.failReasons.join('; ')}]` : ''),
    );

    if (validation.status === 'fail') {
      console.error(
        `[artifactValidation] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
        `HARD FAIL: artifact rejected before persistence. Reasons: ${validation.failReasons.join('; ')}`,
      );
      return NextResponse.json(
        {
          error: `Tradução gerada com formato inválido. Tente novamente. (${validation.failReasons[0]})`,
          validationStatus: validation.status,
          failReasons: validation.failReasons,
        },
        { status: 422 },
      );
    }

    // ── Page count chain diagnostic ──────────────────────────────────────────
    // Count <section class="page"> elements in raw and sanitized output so we
    // can trace exactly where a page count drop occurs without guessing.
    const rawSectionPageCount =
      (rawTranslation.match(/<section\b[^>]*class="[^"]*\bpage\b/gi) ?? []).length;
    const sanitizedSectionPageCount =
      (translatedText.match(/<section\b[^>]*class="[^"]*\bpage\b/gi) ?? []).length;

    console.log(
      `[/api/translate/claude] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `Raw: ${rawTranslation.length} chars → Sanitized: ${translatedText.length} chars ` +
      `(${Math.round((1 - translatedText.length / rawTranslation.length) * 100)}% reduction) ` +
      `faithfulPromptUsed=${useFaithfulPrompt} faithfulSanitizerUsed=${useFaithfulSanitizer} ` +
      `continuousTextPath=${isContinuousTextPath} ` +
      `structuralElements=${structuralElementCount} pageDivergenceFlag=${pageDivergenceFlag}`
    );

    // Log full page-count chain so underflow is immediately visible in logs.
    console.log(
      `[pageCountChain] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `sourcePdfPageCount=${pageCount ?? "unknown"} ` +
      `anthropicRawSectionCount=${rawSectionPageCount} ` +
      `sanitizedSectionCount=${sanitizedSectionPageCount} ` +
      `stop_reason=${response.stop_reason}`
    );

    // Per-section content distribution — verifies page-local isolation.
    // Each entry is [sectionIndex, charCount] for diagnosing overloaded/sparse pages.
    if (sanitizedSectionPageCount > 1) {
      const sectionMatches = [...translatedText.matchAll(/<section\b[^>]*class="[^"]*\bpage\b[^"]*"[^>]*>([\s\S]*?)(?=<section\b|$)/gi)];
      const distribution = sectionMatches.map((m, i) => {
        const content = m[1] ?? '';
        const chars = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length;
        const blockTitles = (content.match(/class="block-title"/g) ?? []).length;
        const blockAuth = (content.match(/class="block-authentication"/g) ?? []).length;
        return `s${i + 1}:chars=${chars},blockTitle=${blockTitles},blockAuth=${blockAuth}`;
      });
      console.log(
        `[pageLocalFidelity] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
        `sectionDistribution=[${distribution.join(' | ')}]`
      );
    }

    if (pageCount && pageCount > 1) {
      if (response.stop_reason === 'max_tokens') {
        console.error(
          `[pageCountGuard] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
          `TRUNCATION: Claude hit max_tokens limit. Output may be incomplete. ` +
          `sourcePdfPageCount=${pageCount} sanitizedSectionCount=${sanitizedSectionPageCount}`
        );
      }
      if (sanitizedSectionPageCount > 0 && sanitizedSectionPageCount < pageCount) {
        console.warn(
          `[pageCountGuard] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
          `UNDERFLOW: source=${pageCount} translatedSections=${sanitizedSectionPageCount} — ` +
          `page(s) lost in translation output`
        );
      }
      if (sanitizedSectionPageCount === 0) {
        console.warn(
          `[pageCountGuard] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
          `NO_SECTIONS: Claude did not emit any <section class="page"> containers. ` +
          `sourcePdfPageCount=${pageCount}. Content will flow as a single block.`
        );
      }
    }

    return NextResponse.json({
      translatedText,
      translationMode: normalizedTranslationMode,
      translationPipeline: forceBlueprintPipeline
        ? "anthropic_blueprint"
        : "standard_structured",
      faithfulPromptUsed: useFaithfulPrompt,
      continuousTextPathUsed: isContinuousTextPath,
      structuralElementCount,
      pageDivergenceFlag,
      validationStatus: validation.status,
      validationWarnings: validation.warnings,
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
