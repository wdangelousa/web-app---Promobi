import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    // Fetch the source file
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

    // Determine media type for Anthropic
    const isPdf = contentType.includes("pdf") || fileUrl.toLowerCase().includes(".pdf");
    const isImage =
      contentType.includes("image/") ||
      /\.(png|jpg|jpeg|gif|webp)$/i.test(fileUrl);

    const systemPrompt = `You are a professional certified translator specializing in legal and civil document translation from ${sourceLangLabel} to English (United States).

Your output must be clean HTML suitable for a certified translation document. Follow these rules exactly:
- Use <p> tags for paragraphs
- Use <table>, <tr>, <th>, <td> for any tables or form fields
- Use <h2> or <h3> for section headings
- Preserve ALL information from the original — names, dates, document numbers, addresses, signatures, seals, stamps, and notary language
- Use [ILLEGIBLE] for text that cannot be read
- Use [SEAL] or [STAMP] as placeholders for official stamps/seals
- Use [SIGNATURE] for handwritten signatures
- Do NOT add commentary, notes, or explanations
- Do NOT include <!DOCTYPE>, <html>, <head>, or <body> tags
- Output only the translated HTML content`;

    const userMessage = isPdf
      ? `Translate this ${sourceLangLabel} document to English. Output clean HTML only.`
      : `Translate this ${sourceLangLabel} document image to English. Output clean HTML only.`;

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
      // Fallback: treat as plain text
      const textContent = Buffer.from(fileBuffer).toString("utf-8");
      messageContent = [
        {
          type: "text",
          text: `${userMessage}\n\n<source_document>\n${textContent}\n</source_document>`,
        },
      ];
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    });

    const translatedText =
      response.content[0].type === "text" ? response.content[0].text : "";

    if (!translatedText) {
      return NextResponse.json({ error: "Claude returned empty translation" }, { status: 500 });
    }

    return NextResponse.json({ translatedText });
  } catch (error: any) {
    console.error("[/api/translate/claude] Error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
