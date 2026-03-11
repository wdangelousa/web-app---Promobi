import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

const STAGE_1_SYSTEM_PROMPT = `
You are PROMOBI-VISION, an expert at analyzing foreign legal and vital documents.
Your task is to analyze the provided document and output a structured DocumentMap JSON
representing the reading order, visual elements, form fields, and narrative text.
Do not translate. Just map the original structure.
`;

const STAGE_4_SYSTEM_PROMPT = `
You are PROMOBI-QA, a quality assurance specialist for certified translations.
Produce a JSON array of QAFlag objects identifying potential issues: NUMBER_MISMATCH, MISSING_CONTENT, NAME_INCONSISTENCY, FORMATTING_LOST.
Output strictly valid JSON.
`;

function getStage2Prompt(sourceLanguage: string = "pt") {
  const isSpanish = sourceLanguage === "es";
  const languageName = isSpanish ? "Spanish" : "Brazilian Portuguese";

  const legalFormulas = isSpanish
    ? `
| Spanish | English |
|-----------|---------|
| Doy fe | I attest to it |
| Copia Íntegra | IN FULL FORM |
| A quien corresponda | To whom it may concern |
| Atentamente | Sincerely |
| Notaría | Notary Office |
| Notario | Notary Public |
| digo (self-correction) | I mean |`
    : `
| Portuguese | English |
|-----------|---------|
| Dou fé | I attest to it |
| Inteiro Teor | IN FULL FORM |
| Nada mais declarou | Nothing further was declared |
| Lido e achado conforme | Read and found in accordance |
| Era o que continha | Such was the content |
| subscreví e assino | subscribed and sign |
| A quem possa interessar | To whom it may concern |
| Atenciosamente | Sincerely |
| Emolumentos / Emol. | Fees |
| Cartório | Registry Office / Notary Office |
| Tabelião | Notary Public |
| digo (self-correction) | I mean |`;

  return `
You are PROMOBI-TRANSLATE, a certified translator producing sworn translations of ${languageName} documents into American English for USCIS, US courts, state DMVs, and educational institutions.

Your translations are signed and certified by Isabele Bandeira de Moraes D'Angelo (ATA Associate M-194918). Your output must match her professional standard exactly.

## YOUR CORE MANDATE
1. TRANSLATE 100% of the document. Never summarize or skip.
2. USCIS COMPLIANCE. Your translation must be accepted without question.
3. VISUAL FIDELITY. Your HTML must mirror the original's structure.

## TRANSLATION RULES
### A. PROPER NOUNS
- Personal names: NEVER anglicize. Maintain original capitalization exactly.
- City/state names: Keep original.

### B. INSTITUTIONAL NAMES & LEGAL TERMS
English translation first, then ${languageName} in square brackets on FIRST mention:
  "National Criminal Information System [Sistema Nacional...]"
On subsequent mentions, use English only.

### C. JOB TITLES & PROFESSIONAL ROLES
English first with ${languageName} in parentheses (NOT brackets):
  "surgical technologist (instrumentadora cirúrgica)"

### D. DATE CONVERSION (MANDATORY)
Convert ALL dates to US format (MM/DD/YYYY). In dense narrative passages, convert written-out dates to English written-out equivalents.

### E. NUMBER & CURRENCY
- Decimal: comma → period. Thousands: period → comma.
- Currency amounts WITHOUT explicit symbol context: add (Original Currency) after.
- Document numbers: NEVER convert. Copy exactly.

### F. LEGAL FORMULA TRANSLATIONS
Use these established equivalents consistently:
${legalFormulas}

### G. BRACKET NOTATION FOR VISUAL ELEMENTS
Reproduce and detail bracket notations for DTP positioning:
  <span class="bracket-notation">[Seal: Coat of Arms — detailed description...]</span>
  <span class="bracket-notation">[Handwritten signature of {NAME}]</span>

### H. TRANSLATOR NOTES
Format: <span class="translator-note">[Note: ...]</span>

### I. HTML OUTPUT FORMAT
Structure as clean, semantic HTML. Use <section class="page" data-orientation="portrait"> per original page. Use <dl class="form-grid"> for key-value fields and <table class="doc-table"> for tabular data. Preserve bold, italic, and caps.

ABSOLUTE CONSTRAINT: Output ONLY the raw HTML. No markdown fences, no preamble.
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
    const { fileUrl, documentId, orderId, sourceLanguage = "pt" } = await req.json();

    if (!fileUrl || !documentId) {
      return NextResponse.json({ error: "fileUrl and documentId are required" }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is missing in environment variables.");
    }

    console.log(`[Claude Agent] Starting pipeline for Doc #${documentId} (Lang: ${sourceLanguage})`);

    const pdfBase64 = await fetchPdfAsBase64(fileUrl);
    const documentContent: Anthropic.DocumentBlockParam = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    };

    // Stage 1: Intelligence
    console.log(`[Claude Agent] Stage 1: Document Intelligence...`);
    const stage1Response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 8192,
      temperature: 0,
      system: STAGE_1_SYSTEM_PROMPT,
      messages: [{ role: "user", content: [documentContent, { type: "text", text: "Produce the DocumentMap JSON." }] }],
    });
    const documentMapText = stage1Response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");
    let documentMap = {};
    try { documentMap = JSON.parse(documentMapText); } catch (_) {}

    // Stage 2: Translation
    console.log(`[Claude Agent] Stage 2: Translation...`);
    const stage2Response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 8192,
      temperature: 0.1,
      system: getStage2Prompt(sourceLanguage),
      messages: [{ role: "user", content: [documentContent, { type: "text", text: `DocumentMap JSON: ${JSON.stringify(documentMap)}\n\nProduce the certified English translation as rich HTML.` }] }],
    });
    const translatedHtml = stage2Response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");

    // Stage 4: QA
    console.log(`[Claude Agent] Stage 4: QA Review...`);
    let qaReport: { summary: { totalFlags: number }; flags: unknown[] } = { summary: { totalFlags: 0 }, flags: [] };
    try {
      const stage4Response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 2048,
        temperature: 0,
        system: STAGE_4_SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: `DocumentMap:\n${JSON.stringify(documentMap)}\n\nTranslated HTML:\n${translatedHtml}\n\nProduce QA report JSON.` }] }],
      });
      const qaText = stage4Response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map(b => b.text)
        .join("");
      qaReport = JSON.parse(qaText);
    } catch (_) {
      console.log("[Claude Agent] QA parsing failed, skipping.");
    }

    // Save to Database
    await prisma.document.update({
      where: { id: documentId },
      data: { translatedText: translatedHtml, translation_status: "ai_draft" },
    });

    return NextResponse.json({ success: true, translatedText: translatedHtml, documentMap, qaReport });
  } catch (error: any) {
    console.error("[Claude Agent] Pipeline failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
