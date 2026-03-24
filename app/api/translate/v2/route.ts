import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildTranslationPromptV2, buildUserMessageV2, type TranslationLanguage } from "@/lib/translationPromptV2";
import { convertTranslationXmlToHtml } from "@/lib/translationXmlToHtml";
import { sanitizeTranslationHtml } from "@/lib/translationHtmlSanitizer";

// Allow up to 5 minutes for translation (large PDFs + retries on overload)
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Promobidocs — V2 Translation API Route
//
// Pipeline:
//   1. translationPromptV2.ts → Claude produces XML semantic markup (zero HTML)
//   2. translationXmlToHtml.ts → Deterministic XML→HTML conversion
//   3. CSS in generateDeliveryKit.ts → PDF rendered by Gotenberg in 1 pass
//
// Fallback: if Claude returns HTML instead of XML, falls through to V1 sanitizer.
// ─────────────────────────────────────────────────────────────────────────────

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 4,
  timeout: 120_000,
});

const SOURCE_LANGUAGE_LABELS: Record<string, string> = {
  PT_BR: "Brazilian Portuguese",
  pt: "Portuguese",
  ES: "Spanish",
  es: "Spanish",
  FR: "French",
  fr: "French",
};

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

    const logPrefix = `[/api/translate/v2] Order #${orderId ?? "?"} Doc #${documentId ?? "?"}`;

    // Reject external_pdf pipeline
    if (translationMode === "external_pdf" || translationPipeline === "external_pdf") {
      return NextResponse.json(
        { error: "Use external PDF mode should not call translation API. Attach an external PDF instead." },
        { status: 400 },
      );
    }

    if (!fileUrl) {
      return NextResponse.json({ error: "fileUrl is required" }, { status: 400 });
    }

    const sourceLangLabel = SOURCE_LANGUAGE_LABELS[sourceLanguage] ?? sourceLanguage;

    // ── Fetch the source file ──
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch source file: ${fileRes.status}` },
        { status: 400 },
      );
    }

    const fileBuffer = await fileRes.arrayBuffer();
    const base64Data = Buffer.from(fileBuffer).toString("base64");
    const contentType = fileRes.headers.get("content-type") || "application/pdf";

    const isPdf = contentType.includes("pdf") || fileUrl.toLowerCase().includes(".pdf");
    const isImage =
      contentType.includes("image/") ||
      /\.(png|jpg|jpeg|gif|webp)$/i.test(fileUrl);

    // ── Build prompt ──
    const systemPrompt = buildTranslationPromptV2(sourceLanguage as TranslationLanguage);
    const userMessage = buildUserMessageV2(sourceLangLabel, isPdf, pageCount ?? undefined);

    console.log(`${logPrefix} — prompt=v2_xml_semantic model=claude-sonnet-4-6`);

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
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    });

    const rawTranslation =
      response.content[0].type === "text" ? response.content[0].text : "";

    if (!rawTranslation) {
      return NextResponse.json({ error: "Claude returned empty translation" }, { status: 500 });
    }

    // ── Convert XML → HTML ──
    const xmlResult = convertTranslationXmlToHtml(rawTranslation);

    let translatedText: string;
    let pipelineLabel: string;

    if (xmlResult.parseSuccess) {
      translatedText = xmlResult.html;
      pipelineLabel = "v2_xml_semantic";
      console.log(
        `${logPrefix} — xmlParseSuccess=true pageCount=${xmlResult.pageCount}`
      );
    } else {
      // FALLBACK: Claude returned HTML instead of XML — use legacy sanitizer
      console.warn(
        `${logPrefix} — FALLBACK: xmlParseSuccess=false (${xmlResult.error}), using legacy sanitizer`
      );
      translatedText = sanitizeTranslationHtml(rawTranslation);
      pipelineLabel = "v2_fallback_to_v1_sanitizer";
    }

    // ── Diagnostics ──
    const structuralElementCount =
      (translatedText.match(/<p[\s>]/gi) ?? []).length +
      (translatedText.match(/<tr[\s>]/gi) ?? []).length;
    const pageDivergenceFlag = structuralElementCount > 100;

    console.log(
      `${logPrefix} — Raw: ${rawTranslation.length} chars → HTML: ${translatedText.length} chars ` +
      `pipeline=${pipelineLabel} structuralElements=${structuralElementCount}`
    );

    // Page count chain diagnostic
    const htmlSectionPageCount =
      (translatedText.match(/<section\b[^>]*class="[^"]*\bpage\b/gi) ?? []).length;
    console.log(
      `[pageCountChain] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `sourcePdfPageCount=${pageCount ?? "unknown"} ` +
      `xmlPageCount=${xmlResult.pageCount} ` +
      `htmlSectionCount=${htmlSectionPageCount} ` +
      `stop_reason=${response.stop_reason}`
    );

    return NextResponse.json({
      translatedText,
      translationMode: translationMode ?? "standard",
      translationPipeline: pipelineLabel,
      faithfulPromptUsed: false,
      continuousTextPathUsed: false,
      structuralElementCount,
      pageDivergenceFlag,
    });
  } catch (error: any) {
    const status = error?.status;
    console.error("[/api/translate/v2] Error:", error?.message ?? error);

    if (status === 529 || status === 500 || status === 503) {
      return NextResponse.json(
        {
          error:
            "Serviço de IA temporariamente indisponível. Tente novamente em alguns instantes.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: error?.message || "Translation failed" },
      { status: 500 },
    );
  }
}
