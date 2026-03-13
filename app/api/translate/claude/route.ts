import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { sanitizeTranslationHtml } from "@/lib/translationHtmlSanitizer";
import { buildTranslationPrompt, buildUserMessage, type TranslationLanguage } from "@/lib/translationPrompt";

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

export async function POST(req: Request) {
  try {
    const { fileUrl, documentId, orderId, sourceLanguage = "pt" } = await req.json();

    if (!fileUrl) {
      return NextResponse.json({ error: "fileUrl is required" }, { status: 400 });
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

    // ── Layer 3: Sanitize for Gotenberg (format HTML, compact layout) ──
    const translatedText = sanitizeTranslationHtml(rawTranslation);

    console.log(
      `[/api/translate/claude] Order #${orderId ?? "?"} Doc #${documentId ?? "?"} — ` +
      `Raw: ${rawTranslation.length} chars → Sanitized: ${translatedText.length} chars ` +
      `(${Math.round((1 - translatedText.length / rawTranslation.length) * 100)}% reduction)`
    );

    return NextResponse.json({ translatedText });
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
