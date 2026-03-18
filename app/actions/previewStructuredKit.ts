'use server';

/**
 * app/actions/previewStructuredKit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * On-demand server action: generates a structured preview kit for a document.
 *
 * Called when the operator clicks "Preview Kit" in the Workbench and selects
 * a cover language variant (PT→EN or ES→EN) from the language modal.
 *
 * This action:
 *   1. Loads the document's original file URL and metadata from the DB.
 *   2. Fetches the original source file buffer.
 *   3. Classifies the document type from available signals (using
 *      effectiveTranslatedText, not raw doc.translatedText, so editor content
 *      is factored in when the operator hasn't saved yet).
 *   4. For eligible structured document types:
 *        - marriage_certificate_brazil    → marriageCertRenderer
 *        - birth_certificate_brazil       → birthCertificateRenderer
 *        - academic_diploma_certificate   → academicDiplomaRenderer
 *        - academic_transcript            → academicTranscriptRenderer
 *        - course_certificate_landscape   → certificateLandscapeRenderer
 *        All five: re-extract structured JSON via Claude API, then render.
 *   5. For non-eligible document types: falls back to the legacy simple HTML
 *      wrapper around effectiveTranslatedText.
 *   6. Calls assembleStructuredPreviewKit with the correct structured HTML.
 *   7. Returns the preview kit URL.
 *
 * Guarantees:
 *   - Never modifies DB records, delivery_pdf_url, or translation_status.
 *   - Never affects the official delivery flow.
 *   - Never throws — errors are caught and returned as { success: false }.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import {
  assembleStructuredPreviewKit,
  buildTranslatedDocumentHtml,
} from '@/services/structuredPreviewKit';
import { classifyDocument } from '@/services/documentClassifier';
import {
  buildStructuredMarriageCertSystemPrompt,
  buildStructuredUserMessage,
} from '@/lib/structuredTranslationPrompt';
import {
  buildCertificateLandscapeSystemPrompt,
  buildCertificateLandscapeUserMessage,
} from '@/lib/certificateLandscapePrompt';
import {
  buildAcademicDiplomaSystemPrompt,
  buildAcademicDiplomaUserMessage,
} from '@/lib/academicDiplomaPrompt';
import {
  buildAcademicTranscriptSystemPrompt,
  buildAcademicTranscriptUserMessage,
} from '@/lib/academicTranscriptPrompt';
import {
  buildBirthCertificateSystemPrompt,
  buildBirthCertificateUserMessage,
} from '@/lib/birthCertificatePrompt';
import { renderMarriageCertificateHtml } from '@/lib/marriageCertRenderer';
import { renderCertificateLandscapeHtml } from '@/lib/certificateLandscapeRenderer';
import { renderAcademicDiplomaHtml } from '@/lib/academicDiplomaRenderer';
import { renderAcademicTranscriptHtml } from '@/lib/academicTranscriptRenderer';
import { renderBirthCertificateHtml } from '@/lib/birthCertificateRenderer';
import {
  detectOrientationFromPdfDoc,
  type DocumentOrientation,
} from '@/lib/documentOrientationDetector';
import type { MarriageCertificateBrazil } from '@/types/marriageCertificate';
import type { CourseCertificateLandscape } from '@/types/certificateLandscape';
import type { AcademicDiplomaCertificate } from '@/types/academicDiploma';
import type { AcademicTranscript } from '@/types/academicTranscript';
import type { BirthCertificateBrazil } from '@/types/birthCertificate';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripMarkdownFences(raw: string): string {
  return raw
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/**
 * Calls the Claude API with the given system prompt, message content, and
 * max_tokens. Returns the raw text response, or null on any failure.
 * Never throws.
 */
async function callClaudeForJson(
  client: Anthropic,
  systemPrompt: string,
  messageContent: Anthropic.MessageParam['content'],
  maxTokens: number,
  logPrefix: string,
): Promise<string | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    });
    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
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

/**
 * Builds message content for Claude from a file buffer.
 * Mirrors the logic used in structuredPipeline.ts.
 */
function buildMessageContent(
  fileBuffer: ArrayBuffer,
  fileUrl: string,
  contentType: string,
  userMessage: string,
): Anthropic.MessageParam['content'] {
  const base64Data = Buffer.from(fileBuffer).toString('base64');
  const isPdf =
    contentType.includes('pdf') || fileUrl.toLowerCase().includes('.pdf');
  const isImage =
    contentType.includes('image/') ||
    /\.(png|jpg|jpeg|gif|webp)$/i.test(fileUrl);

  if (isPdf) {
    return [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
      } as any,
      { type: 'text', text: userMessage },
    ];
  }

  if (isImage) {
    const imageMediaType: 'image/png' | 'image/gif' | 'image/webp' | 'image/jpeg' =
      contentType.includes('png')  ? 'image/png'  :
      contentType.includes('gif')  ? 'image/gif'  :
      contentType.includes('webp') ? 'image/webp' :
      'image/jpeg';

    return [
      {
        type: 'image',
        source: { type: 'base64', media_type: imageMediaType, data: base64Data },
      },
      { type: 'text', text: userMessage },
    ];
  }

  // Plain text fallback
  const textContent = Buffer.from(fileBuffer).toString('utf-8');
  return [
    {
      type: 'text',
      text: `${userMessage}\n\n<source_document>\n${textContent}\n</source_document>`,
    },
  ];
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function previewStructuredKit(
  orderId: number,
  documentId: number,
  /**
   * Cover language from the Editor language modal.
   * Accepted values: 'PT_BR' (Portuguese → English) or 'ES' (Spanish → English).
   * Any unrecognised value defaults to 'pt-en'.
   */
  coverLang: string,
  /**
   * Current editor HTML from the Workbench UI (unsaved draft).
   * When provided and non-empty, this takes priority over the saved
   * translatedText in the database — allowing operators to preview
   * in-progress translations without requiring a save first.
   */
  editorHtml?: string,
): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  const coverVariant: 'pt-en' | 'es-en' =
    coverLang.toUpperCase() === 'ES' ? 'es-en' : 'pt-en';

  const logPrefix = `[previewStructuredKit] Order #${orderId} Doc #${documentId}`;

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        translatedText: true,
        originalFileUrl: true,
        sourceLanguage: true,
        docType: true,
        exactNameOnDoc: true,
      },
    });

    if (!doc) {
      return { success: false, error: `Document #${documentId} not found` };
    }

    // Resolve translated content: editor (most current) › saved DB record › absent
    const effectiveTranslatedText: string | null =
      editorHtml && editorHtml.trim().length > 0
        ? editorHtml
        : doc.translatedText && doc.translatedText.trim().length > 0
          ? doc.translatedText
          : null;

    const effectiveSource =
      editorHtml && editorHtml.trim().length > 0 ? 'editor' : 'db';
    console.log(
      `${logPrefix} — effective translated content: ${
        effectiveTranslatedText === null
          ? 'ABSENT (editor: none, db: none)'
          : `present (${effectiveTranslatedText.length} chars, source: ${effectiveSource})`
      }`,
    );

    // ── Step 1: Fetch original file ─────────────────────────────────────────

    let originalFileBuffer: ArrayBuffer = new ArrayBuffer(0);
    let isOriginalPdf = false;
    let contentType = 'application/octet-stream';

    if (doc.originalFileUrl) {
      try {
        const res = await fetch(doc.originalFileUrl);
        if (res.ok) {
          originalFileBuffer = await res.arrayBuffer();
          contentType = res.headers.get('content-type') ?? 'application/octet-stream';
          isOriginalPdf =
            contentType.includes('pdf') ||
            doc.originalFileUrl.toLowerCase().includes('.pdf');
        }
      } catch {
        // Original file unavailable — kit will be assembled without Part 3.
        console.warn(`${logPrefix} — original file fetch failed`);
      }
    }

    // ── Step 2: Get page count and orientation from original PDF ────────────

    let sourcePageCount: number | undefined;
    let detectedOrientation: DocumentOrientation = 'unknown';

    if (isOriginalPdf && originalFileBuffer.byteLength > 0) {
      try {
        const pdfDoc = await PDFDocument.load(originalFileBuffer, {
          ignoreEncryption: true,
        });
        sourcePageCount = pdfDoc.getPageCount();
        const orientResult = detectOrientationFromPdfDoc(pdfDoc);
        detectedOrientation = orientResult.orientation;
        console.log(
          `${logPrefix} — original pages: ${sourcePageCount}, orientation: ${detectedOrientation}`,
        );
      } catch {
        console.warn(`${logPrefix} — PDF metadata extraction failed`);
      }
    }

    // ── Step 3: Classify document type ──────────────────────────────────────
    //
    // Use effectiveTranslatedText (editor content first, then DB) so the
    // classifier has access to the current translation even when it hasn't been
    // saved yet (e.g. documents with externalTranslationUrl set).

    const classification = classifyDocument({
      fileUrl: doc.originalFileUrl ?? undefined,
      translatedText: effectiveTranslatedText ?? '',
      sourceLanguage: doc.sourceLanguage ?? undefined,
    });

    console.log(
      `${logPrefix} — document type classified: ${classification.documentType} ` +
      `(confidence: ${classification.confidence})`,
    );

    // ── Step 4: Generate structured HTML via the correct renderer ───────────
    //
    // For eligible document types, re-run the Claude structured extraction and
    // pass the result through the dedicated renderer.
    //
    // For all other document types, fall back to the simple HTML wrapper
    // around effectiveTranslatedText (legacy behaviour).

    let structuredHtml: string | null = null;
    // orientationForKit: the orientation to pass to assembleStructuredPreviewKit.
    // May differ from detectedOrientation depending on per-family override logic.
    let orientationForKit: DocumentOrientation = detectedOrientation;

    const isMarriageCert      = classification.documentType === 'marriage_certificate_brazil';
    const isBirthCert         = classification.documentType === 'birth_certificate_brazil';
    const isAcademicDiploma   = classification.documentType === 'academic_diploma_certificate';
    const isAcademicTranscript = classification.documentType === 'academic_transcript';
    const isCertLandscape     = classification.documentType === 'course_certificate_landscape';
    const isEligible          = isMarriageCert || isBirthCert || isAcademicDiploma || isAcademicTranscript || isCertLandscape;

    if (isEligible && doc.originalFileUrl && originalFileBuffer.byteLength > 0) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      if (isMarriageCert) {
        // ── Marriage certificate extraction ───────────────────────────────
        const messageContent = buildMessageContent(
          originalFileBuffer,
          doc.originalFileUrl,
          contentType,
          buildStructuredUserMessage(),
        );

        const rawJson = await callClaudeForJson(
          client,
          buildStructuredMarriageCertSystemPrompt(),
          messageContent,
          8192,
          `${logPrefix} [marriage-cert]`,
        );

        if (rawJson) {
          try {
            const parsed = JSON.parse(stripMarkdownFences(rawJson)) as MarriageCertificateBrazil;
            structuredHtml = renderMarriageCertificateHtml(parsed, {
              pageCount: sourcePageCount,
              orientation: detectedOrientation === 'landscape' ? 'landscape' :
                           detectedOrientation === 'portrait'  ? 'portrait'  :
                           'unknown',
            });
            console.log(
              `${logPrefix} — structured renderer: marriageCertRenderer ` +
              `(${structuredHtml.length} chars, pages: ${sourcePageCount ?? 'n/a'}, ` +
              `orientation: ${detectedOrientation})`,
            );
          } catch (err) {
            console.error(`${logPrefix} — marriage cert render failed: ${err}`);
          }
        } else {
          console.warn(`${logPrefix} — marriage cert extraction failed`);
        }

      } else if (isCertLandscape) {
        // ── Course certificate landscape extraction ───────────────────────
        const messageContent = buildMessageContent(
          originalFileBuffer,
          doc.originalFileUrl,
          contentType,
          buildCertificateLandscapeUserMessage(),
        );

        const rawJson = await callClaudeForJson(
          client,
          buildCertificateLandscapeSystemPrompt(),
          messageContent,
          4096,
          `${logPrefix} [cert-landscape]`,
        );

        if (rawJson) {
          try {
            const parsed = JSON.parse(stripMarkdownFences(rawJson)) as CourseCertificateLandscape;

            // Apply the same orientation override logic as structuredPipeline.ts:
            // single-page portrait PDF is likely a scanner artifact for landscape certs.
            let effectiveOrientation: DocumentOrientation = detectedOrientation;
            if (detectedOrientation === 'portrait' && sourcePageCount === 1) {
              effectiveOrientation = 'landscape';
            } else if (detectedOrientation === 'unknown') {
              effectiveOrientation = 'landscape';
            }
            orientationForKit = effectiveOrientation;

            // Inject pipeline-detected metadata (mirrors structuredPipeline.ts)
            parsed.orientation = detectedOrientation;
            parsed.page_count = sourcePageCount ?? null;

            structuredHtml = renderCertificateLandscapeHtml(parsed, {
              pageCount: sourcePageCount,
              orientation: effectiveOrientation,
            });
            console.log(
              `${logPrefix} — structured renderer: certificateLandscapeRenderer ` +
              `(${structuredHtml.length} chars, pages: ${sourcePageCount ?? 'n/a'}, ` +
              `effective orientation: ${effectiveOrientation})`,
            );
          } catch (err) {
            console.error(`${logPrefix} — cert landscape render failed: ${err}`);
          }
        } else {
          console.warn(`${logPrefix} — cert landscape extraction failed`);
        }

      } else if (isAcademicDiploma) {
        // ── Academic diploma / degree certificate extraction ───────────────
        //
        // Orientation policy for academic diplomas:
        //   landscape → landscape (keep detected)
        //   portrait  → portrait  (diplomas can legitimately be portrait — no override)
        //   unknown   → landscape (landscape is the more common Brazilian diploma format)
        let effectiveOrientation: DocumentOrientation = detectedOrientation;
        if (detectedOrientation === 'unknown') {
          effectiveOrientation = 'landscape';
        }
        orientationForKit = effectiveOrientation;

        const messageContent = buildMessageContent(
          originalFileBuffer,
          doc.originalFileUrl,
          contentType,
          buildAcademicDiplomaUserMessage(),
        );

        const rawJson = await callClaudeForJson(
          client,
          buildAcademicDiplomaSystemPrompt(),
          messageContent,
          8192,
          `${logPrefix} [academic-diploma]`,
        );

        if (rawJson) {
          try {
            const parsed = JSON.parse(stripMarkdownFences(rawJson)) as AcademicDiplomaCertificate;

            // Inject pipeline-detected metadata (mirrors structuredPipeline.ts pattern)
            parsed.orientation = detectedOrientation;
            parsed.page_count = sourcePageCount ?? null;

            structuredHtml = renderAcademicDiplomaHtml(parsed, {
              pageCount: sourcePageCount,
              orientation: effectiveOrientation,
            });
            console.log(
              `${logPrefix} — structured renderer: academicDiplomaRenderer ` +
              `(${structuredHtml.length} chars, pages: ${sourcePageCount ?? 'n/a'}, ` +
              `effective orientation: ${effectiveOrientation})`,
            );
          } catch (err) {
            console.error(`${logPrefix} — academic diploma render failed: ${err}`);
          }
        } else {
          console.warn(`${logPrefix} — academic diploma extraction failed`);
        }

      } else if (isAcademicTranscript) {
        // ── Academic transcript / school record extraction ────────────────
        //
        // Orientation policy:
        //   portrait  → portrait  (most transcripts are portrait)
        //   landscape → landscape (some multi-page institutional transcripts)
        //   unknown   → portrait  (conservative default for transcripts)
        // No forced override — use detected orientation directly.

        const messageContent = buildMessageContent(
          originalFileBuffer,
          doc.originalFileUrl,
          contentType,
          buildAcademicTranscriptUserMessage(),
        );

        const rawJson = await callClaudeForJson(
          client,
          buildAcademicTranscriptSystemPrompt(),
          messageContent,
          8192,
          `${logPrefix} [academic-transcript]`,
        );

        if (rawJson) {
          try {
            const parsed = JSON.parse(stripMarkdownFences(rawJson)) as AcademicTranscript;

            // Inject pipeline-detected metadata
            parsed.orientation = detectedOrientation;
            parsed.page_count = sourcePageCount ?? null;

            structuredHtml = renderAcademicTranscriptHtml(parsed, {
              pageCount: sourcePageCount,
              orientation: detectedOrientation,
            });
            console.log(
              `${logPrefix} — structured renderer: academicTranscriptRenderer ` +
              `(${structuredHtml.length} chars, pages: ${sourcePageCount ?? 'n/a'}, ` +
              `orientation: ${detectedOrientation})`,
            );
          } catch (err) {
            console.error(`${logPrefix} — academic transcript render failed: ${err}`);
          }
        } else {
          console.warn(`${logPrefix} — academic transcript extraction failed`);
        }

      } else {
        // ── Birth certificate extraction ──────────────────────────────────
        //
        // Orientation policy: Brazilian birth certs are always portrait.
        // No orientation override needed — use detected value directly.
        // (isBirthCert must be true here since isEligible was true and no other
        //  branch matched.)

        const messageContent = buildMessageContent(
          originalFileBuffer,
          doc.originalFileUrl,
          contentType,
          buildBirthCertificateUserMessage(),
        );

        const rawJson = await callClaudeForJson(
          client,
          buildBirthCertificateSystemPrompt(),
          messageContent,
          6144,
          `${logPrefix} [birth-cert]`,
        );

        if (rawJson) {
          try {
            const parsed = JSON.parse(stripMarkdownFences(rawJson)) as BirthCertificateBrazil;

            // Inject pipeline-detected metadata
            parsed.orientation = detectedOrientation;
            parsed.page_count = sourcePageCount ?? null;

            structuredHtml = renderBirthCertificateHtml(parsed, {
              pageCount: sourcePageCount,
              orientation: detectedOrientation,
            });
            console.log(
              `${logPrefix} — structured renderer: birthCertificateRenderer ` +
              `(${structuredHtml.length} chars, pages: ${sourcePageCount ?? 'n/a'}, ` +
              `orientation: ${detectedOrientation})`,
            );
          } catch (err) {
            console.error(`${logPrefix} — birth cert render failed: ${err}`);
          }
        } else {
          console.warn(`${logPrefix} — birth cert extraction failed`);
        }
      }

    } else if (isEligible) {
      // Eligible family but original file is missing — structured rendering requires it.
      return {
        success: false,
        error: `Structured rendering is required for "${classification.documentType}" but the original file is not available. Re-upload the original document and try again.`,
      };
    } else {
      // Truly unsupported family (unknown) — legacy is the correct and only path.
      console.log(
        `${logPrefix} — non-structured document type (${classification.documentType}); using legacy HTML`,
      );
      if (!effectiveTranslatedText) {
        return {
          success: false,
          error: 'This document has no translated content. Add the translation in the workbench editor, then generate the preview kit again.',
        };
      }
      structuredHtml = buildTranslatedDocumentHtml(effectiveTranslatedText, orientationForKit === 'landscape' ? 'landscape' : 'portrait');
    }

    // ── Step 5: Assemble the preview kit ────────────────────────────────────
    //
    // Structured-first enforcement: if this family was eligible but extraction
    // or rendering failed, return an error rather than silently producing legacy output.
    if (structuredHtml === null) {
      return {
        success: false,
        error: `Structured rendering failed for "${classification.documentType}" — extraction or rendering error. Check server logs for details.`,
      };
    }

    // Cover logic, original-append logic, letterhead PNG overlay, and Gotenberg
    // margins are all handled inside assembleStructuredPreviewKit — unchanged.

    const kit = await assembleStructuredPreviewKit({
      structuredHtml,
      originalFileBuffer,
      isOriginalPdf,
      orderId,
      documentId,
      sourceLanguage: doc.sourceLanguage ?? 'pt',
      coverVariant,
      documentTypeLabel: doc.exactNameOnDoc ?? doc.docType ?? 'Document',
      sourcePageCount,
      orientation: orientationForKit === 'landscape' ? 'landscape' : undefined,
    });

    if (!kit.assembled) {
      return {
        success: false,
        error: 'Preview kit assembly failed — check server logs for details',
      };
    }

    return {
      success: true,
      previewUrl: kit.kitUrl ?? kit.kitLocalPath ?? undefined,
    };
  } catch (err: any) {
    console.error(`${logPrefix} — unexpected error: ${err}`);
    return { success: false, error: err?.message ?? String(err) };
  }
}
