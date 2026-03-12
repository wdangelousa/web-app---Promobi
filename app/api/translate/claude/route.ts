import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = new Anthropic({ apiKey: apiKey || "" });
const MODEL_NAME = "claude-haiku-4-5-20251001";

const STAGE_1_SYSTEM_PROMPT = `
You are PROMOBI-VISION, an expert at analyzing foreign legal and vital documents.
Your task is to analyze the provided document and output a structured DocumentMap JSON.
Do not translate. Just map the original structure.
`;

function getStage2Prompt(sourceLanguage: string = "pt") {
  const isSpanish = sourceLanguage === "es";
  const languageName = isSpanish ? "Spanish" : "Brazilian Portuguese";

  return `
You are an expert Sworn Translator and HTML Layout Engineer producing certified translations from ${languageName} to American English.

CRITICAL LAYOUT COMMANDS:
The source document is a Brazilian Certificate (Birth, Marriage, Death). These are highly structured grids.
You are STRICTLY FORBIDDEN from using plain paragraphs or inline text for the certificate fields.
You MUST build an exact replica of the grid using HTML <table> tags.

RULES FOR TABLES:
1. Use <th> for the small field labels (e.g., "Name", "Nationality", "CPF").
2. Use <td> for the actual values (e.g., "JOHN DOE", "Brazilian", "123.456").
3. Group side-by-side fields into the same <tr> using multiple <th> and <td> pairs.
4. Create separate <table> blocks for separate sections (e.g., one table for "1st Spouse", another for "2nd Spouse").

REQUIRED HTML TEMPLATE EXAMPLE:
<h3 style="text-align:center;">1st Spouse</h3>
<table>
  <tr>
    <th>Name at the time of marriage application</th>
    <td colspan="3"><strong>JOHN DOE</strong></td>
  </tr>
  <tr>
    <th>Nationality</th>
    <td>Brazilian</td>
    <th>Marital Status</th>
    <td>Single</td>
  </tr>
</table>

PAGINATION RULE: Insert <div class="page-break"></div> exactly where pages end in the original document.

Output ONLY raw HTML. No markdown fences. Do not wrap in \`\`\`html. No explanations.
`;
}

async function fetchPdfAsBase64(fileUrl: string) {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error("Failed to fetch document");
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString("base64");
}

export async function POST(req: Request) {
  try {
    const { fileUrl, documentId, sourceLanguage = "pt" } = await req.json();

    if (!apiKey) return NextResponse.json({ error: "Chave ANTHROPIC_API_KEY não encontrada" }, { status: 500 });

    const pdfBase64 = await fetchPdfAsBase64(fileUrl);
    const documentContent: any = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 }
    };

    await anthropic.messages.create({
      model: MODEL_NAME,
      max_tokens: 4096,
      temperature: 0,
      system: STAGE_1_SYSTEM_PROMPT,
      messages: [{ role: "user", content: [documentContent, { type: "text", text: "Analyze and produce DocumentMap JSON." }] }],
    });

    const stage2Response = await anthropic.messages.create({
      model: MODEL_NAME,
      max_tokens: 4096,
      temperature: 0,
      system: getStage2Prompt(sourceLanguage),
      messages: [{ role: "user", content: [documentContent, { type: "text", text: "Translate this document to HTML strictly using tables for fields according to the template." }] }],
    });

    let translatedHtml = stage2Response.content.filter(b => b.type === "text").map((b: any) => b.text).join("");
    translatedHtml = translatedHtml.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "").trim();

    await prisma.document.update({
      where: { id: documentId },
      data: { translatedText: translatedHtml, translation_status: "ai_draft" },
    });

    return NextResponse.json({ success: true, translatedText: translatedHtml });
  } catch (error: any) {
    console.error("[Claude Agent] Falha na API:", error);
    return NextResponse.json({ error: error.message, details: error.stack }, { status: 500 });
  }
}
