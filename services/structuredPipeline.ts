/**
 * services/structuredPipeline.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured translation pipeline for supported structured document families.
 *
 * This pipeline runs IN PARALLEL with the legacy pipeline when:
 *   1. USE_STRUCTURED_TRANSLATION === "true"
 *   2. The document has been classified into a supported structured family
 *
 * It does NOT replace the legacy pipeline. Its output is currently used
 * for internal logging and future use only — not sent to the frontend.
 *
 * Error policy: NEVER throws. All errors are caught, logged, and the function
 * returns a failed result so the legacy translation response is never disrupted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MarriageCertificateBrazil } from '@/types/marriageCertificate';
import {
  buildStructuredMarriageCertSystemPrompt,
  buildStructuredUserMessage,
} from '@/lib/structuredTranslationPrompt';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import type { DocumentType } from '@/services/documentClassifier';
import { PDFDocument } from 'pdf-lib';
import { renderMarriageCertificateHtml } from '@/lib/marriageCertRenderer';
import { detectOrientationFromPdfDoc, type DocumentOrientation } from '@/lib/documentOrientationDetector';
import type { CourseCertificateLandscape } from '@/types/certificateLandscape';
import {
  buildCertificateLandscapeSystemPrompt,
  buildCertificateLandscapeUserMessage,
} from '@/lib/certificateLandscapePrompt';
import { renderCertificateLandscapeHtml } from '@/lib/certificateLandscapeRenderer';
import {
  detectDocumentFamily,
  getFamilyRenderCapabilities,
  isDocumentTypeInImplementedStructuredFamily,
} from '@/services/documentFamilyRegistry';
import {
  formatStructuredRenderingFailureMessage,
  renderStructuredFamilyDocument,
  isSupportedStructuredDocumentType,
  type SupportedStructuredDocumentType,
} from '@/services/structuredDocumentRenderer';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StructuredPipelineInput {
  fileBuffer: ArrayBuffer;
  fileUrl: string;
  contentType: string;
  sourceLanguage?: string;
  orderId?: string | number;
  documentId?: string | number;
}

export interface StructuredPipelineResult {
  /** True only if the full pipeline succeeded (parse + validation). */
  success: boolean;
  /** Structured payload when available, or null on failure/non-persisted generic flows. */
  data: unknown | null;
  parseSuccess: boolean;
  validationSuccess: boolean;
  error?: string;
  /** Detected orientation of the original source document. 'unknown' if not determinable. */
  orientation?: DocumentOrientation;
}

// ── Certificate landscape result type ────────────────────────────────────────

export interface CertificateLandscapePipelineResult {
  success: boolean;
  data: unknown | null;
  parseSuccess: boolean;
  validationSuccess: boolean;
  error?: string;
  orientation?: DocumentOrientation;
}

// ── Eligibility check ─────────────────────────────────────────────────────────

/**
 * Returns true if the structured pipeline should run for this request.
 * Both conditions must be met: flag enabled AND document type supported.
 */
export function isEligibleForStructuredPipeline(documentType: DocumentType): boolean {
  return (
    FEATURE_FLAGS.USE_STRUCTURED_TRANSLATION &&
    isDocumentTypeInImplementedStructuredFamily(documentType)
  );
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * Runs the structured extraction pipeline for a Brazilian marriage certificate.
 * Never throws — returns a failed result on any error.
 */
export async function runMarriageCertStructuredPipeline(
  client: Anthropic,
  input: StructuredPipelineInput
): Promise<StructuredPipelineResult> {
  const ctx = `Order #${input.orderId ?? '?'} Doc #${input.documentId ?? '?'}`;
  const log = (msg: string) => console.log(`[structuredPipeline] ${ctx} — ${msg}`);

  try {
    // ── Build message content (same detection logic as legacy pipeline) ──
    const base64Data = Buffer.from(input.fileBuffer).toString('base64');
    const isPdf =
      input.contentType.includes('pdf') || input.fileUrl.toLowerCase().includes('.pdf');
    const isImage =
      input.contentType.includes('image/') ||
      /\.(png|jpg|jpeg|gif|webp)$/i.test(input.fileUrl);

    let messageContent: Anthropic.MessageParam['content'];

    if (isPdf) {
      messageContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
        } as any,
        { type: 'text', text: buildStructuredUserMessage() },
      ];
    } else if (isImage) {
      const imageMediaType = input.contentType.includes('png')
        ? 'image/png'
        : input.contentType.includes('gif')
        ? 'image/gif'
        : input.contentType.includes('webp')
        ? 'image/webp'
        : 'image/jpeg';

      messageContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: imageMediaType, data: base64Data },
        },
        { type: 'text', text: buildStructuredUserMessage() },
      ];
    } else {
      const textContent = Buffer.from(input.fileBuffer).toString('utf-8');
      messageContent = [
        {
          type: 'text',
          text: `${buildStructuredUserMessage()}\n\n<source_document>\n${textContent}\n</source_document>`,
        },
      ];
    }

    // ── Call Claude with structured prompt ──
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: buildStructuredMarriageCertSystemPrompt(),
      messages: [{ role: 'user', content: messageContent }],
    });

    const rawJson =
      response.content[0].type === 'text' ? response.content[0].text : '';

    if (!rawJson) {
      log('parse success: no (empty response from Claude)');
      return { success: false, data: null, parseSuccess: false, validationSuccess: false, error: 'Empty Claude response' };
    }

    // ── Parse JSON ──
    let parsed: unknown;
    try {
      // Strip potential markdown fences — defensive even though the prompt forbids them
      const cleanJson = rawJson
        .replace(/^```json?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
      log(`parse success: no (JSON.parse failed — ${parseErr})`);
      return {
        success: false,
        data: null,
        parseSuccess: false,
        validationSuccess: false,
        error: `JSON parse failed: ${parseErr}`,
      };
    }

    log('parse success: yes');

    // ── Validate ──
    if (!validateMarriageCertificate(parsed)) {
      log('validation success: no (missing required fields)');
      return {
        success: false,
        data: null,
        parseSuccess: true,
        validationSuccess: false,
        error: 'Validation failed: required fields absent',
      };
    }

    log('validation success: yes');

    // ── Documentary visual element counts ────────────────────────────────────────
    const _visualEls = (parsed as MarriageCertificateBrazil).visual_elements;
    const _visualCount = Array.isArray(_visualEls) ? _visualEls.length : 0;
    log(`documentary visual elements detected: ${_visualCount}`);
    if (_visualCount > 0) {
      const _unreadable = _visualEls!.filter(
        el => el.text === 'illegible' || el.text === 'partially legible',
      ).length;
      if (_unreadable > 0) log(`unreadable official marks detected: ${_unreadable}`);
    }

    // ── Structured HTML (internal only — never sent to frontend or DB) ──────────
    // Generates a deterministic HTML preview of the extracted certificate.
    // pageCount and orientation are extracted from the original PDF using pdf-lib
    // (already a project dependency) in a single load. If extraction fails for any
    // reason, the renderer falls back to single-page portrait layout.
    //
    // Declared here (outer scope) so orientation is available in the success return
    // even if the HTML generation block throws for an unrelated reason.
    let detectedOrientation: DocumentOrientation = 'unknown';

    try {
      // ── Extract original page count and orientation ───────────────────────────
      // Only attempted for PDF files. Images and text files are skipped (undefined).
      // Both are extracted from the SAME pdf-lib load to avoid a second buffer parse.
      let pageCount: number | undefined;
      let orientation: DocumentOrientation = 'unknown';
      if (isPdf) {
        try {
          const pdfDoc = await PDFDocument.load(input.fileBuffer, { ignoreEncryption: true });
          pageCount = pdfDoc.getPageCount();
          log(`original pdf page count: ${pageCount}`);
          const orientResult = detectOrientationFromPdfDoc(pdfDoc);
          orientation = orientResult.orientation;
          log(`original document orientation: ${orientation}`);
          log(`orientation source: ${orientResult.source}`);
        } catch (pdfErr) {
          log(`page count unavailable: yes (pdf-lib error: ${pdfErr})`);
          log('original document orientation: unknown');
          log('orientation source: unavailable');
        }
      } else {
        log('page count unavailable: yes (not a PDF)');
        log('original document orientation: unknown');
        log('orientation source: unavailable');
      }
      detectedOrientation = orientation;

      // ── Render HTML with real pageCount (or undefined → conservative fallback) ─
      const structuredHtml = renderMarriageCertificateHtml(
        parsed as MarriageCertificateBrazil,
        { pageCount, orientation },
      );
      const rendererMode =
        pageCount === 1 ? 'compact-one-page' :
        (typeof pageCount === 'number' && pageCount >= 2) ? 'standard-multipage' :
        'standard-single';
      log(
        `structured html generated: yes | length: ${structuredHtml.length} chars | ` +
        `structured renderer target page count: ${pageCount ?? 'n/a'} | ` +
        `renderer mode: ${rendererMode} | ` +
        `one-page compaction applied: ${pageCount === 1 ? 'yes' : 'no'}`,
      );
      log(`visual marks rendered: ${_visualCount}`);

      // ── Persist preview artefacts when ENABLE_STRUCTURED_PREVIEW=true ─────────
      // Dynamic import: structuredPreview.ts (and its dependencies) are only loaded
      // when the flag is enabled, keeping the footprint zero when disabled.
      const previewEnabled = FEATURE_FLAGS.ENABLE_STRUCTURED_PREVIEW;
      log(`structured preview enabled: ${previewEnabled ? 'yes' : 'no'}`);
      if (previewEnabled) {
        const { saveStructuredPreview } = await import('@/services/structuredPreview');
        const preview = await saveStructuredPreview(
          structuredHtml,
          input.documentId ?? 'unknown',
          input.orderId ?? 'unknown',
          { generatePdf: true },
        );
        log(`structured html preview saved: ${preview.htmlSaved ? 'yes' : 'no'}`);
        if (preview.htmlPath) log(`structured html preview path: ${preview.htmlPath}`);
        if (preview.htmlLocalPath) log(`structured html local path: ${preview.htmlLocalPath}`);
        log(`structured pdf preview generated: ${preview.pdfSaved ? 'yes' : 'no'}`);
        if (preview.pdfPath) log(`structured pdf preview path: ${preview.pdfPath}`);
        if (preview.pdfLocalPath) log(`structured pdf local path: ${preview.pdfLocalPath}`);
        log(`letterhead detected: ${preview.letterheadDetected ? 'yes' : 'no'}`);
        log(`letterhead reused in preview: ${preview.letterheadReused ? 'yes' : 'no'}`);
        log(`preview pagination preserved: target page count ${pageCount ?? 'n/a'}`);
      }

      // ── Structured preview kit (3-part: cover + translated doc + original) ────
      // Only runs when ENABLE_STRUCTURED_PREVIEW_KIT=true.
      // Never disrupts the extraction result — wrapped in the same try-catch above.
      const kitEnabled = FEATURE_FLAGS.ENABLE_STRUCTURED_PREVIEW_KIT;
      log(`structured preview kit eligible: ${kitEnabled ? 'yes' : 'no'}`);
      if (kitEnabled) {
        const { assembleStructuredPreviewKit } = await import('@/services/structuredPreviewKit');
        const kit = await assembleStructuredPreviewKit({
          structuredHtml,
          originalFileBuffer: input.fileBuffer,
          isOriginalPdf: isPdf,
          orderId:          input.orderId   ?? 'unknown',
          documentId:       input.documentId ?? 'unknown',
          sourceLanguage:   input.sourceLanguage,
          orientation:      detectedOrientation,
          documentTypeLabel: 'Marriage Certificate',
          sourcePageCount:  pageCount,
        });
        log(`certification cover generated: ${kit.coverGenerated ? 'yes' : 'no'}`);
        log(`translated section generated: ${kit.translatedSectionGenerated ? 'yes' : 'no'}`);
        log(`original source appended: ${kit.originalAppended ? 'yes' : 'no'}`);
        log(`structured preview kit assembled: ${kit.assembled ? 'yes' : 'no'}`);
        if (kit.kitPath)      log(`structured preview kit storage path: ${kit.kitPath}`);
        if (kit.kitUrl)       log(`structured preview kit url: ${kit.kitUrl}`);
        if (kit.kitLocalPath) log(`structured preview kit local path: ${kit.kitLocalPath}`);
      }
    } catch (htmlErr) {
      log(`structured html generated: no | renderer error: ${htmlErr}`);
    }

    return {
      success: true,
      data: parsed as MarriageCertificateBrazil,
      parseSuccess: true,
      validationSuccess: true,
      orientation: detectedOrientation,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`unexpected error: ${message}`);
    return { success: false, data: null, parseSuccess: false, validationSuccess: false, error: message };
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Minimal structural validation for marriage certificates.
 * Checks document_type and presence of the most critical sections.
 * Does NOT validate field-level values.
 */
function validateMarriageCertificate(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const obj = parsed as Record<string, unknown>;

  return (
    obj.document_type === 'marriage_certificate_brazil' &&
    typeof obj.spouse_1 === 'object' && obj.spouse_1 !== null &&
    typeof obj.spouse_2 === 'object' && obj.spouse_2 !== null &&
    (
      typeof obj.property_regime === 'string' ||
      typeof obj.registration_number === 'string' ||
      typeof obj.celebration_date === 'object'
    )
  );
}

/**
 * Minimal structural validation for landscape certificates.
 * Conservative: requires document_type plus at least 2 non-empty content fields.
 * Absence of handwritten_fields does NOT fail validation.
 */
function validateCertificateLandscape(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const obj = parsed as Record<string, unknown>;

  if (obj.document_type !== 'course_certificate_landscape') return false;

  const hasCertTitle      = typeof obj.certificate_title === 'string'       && obj.certificate_title.length > 0;
  const hasInstitution    = typeof obj.issuing_institution === 'string'      && obj.issuing_institution.length > 0;
  const hasStatement      = typeof obj.completion_statement === 'string'     && obj.completion_statement.length > 0;
  const hasRecipient      = typeof obj.recipient_name === 'string'           && obj.recipient_name.length > 0;
  const hasCourse         = typeof obj.course_or_program_name === 'string'   && obj.course_or_program_name.length > 0;

  const contentCount = [hasCertTitle, hasInstitution, hasStatement, hasRecipient, hasCourse]
    .filter(Boolean).length;

  return contentCount >= 2;
}

// ── Certificate landscape pipeline ────────────────────────────────────────────

/**
 * Runs the structured extraction pipeline for a landscape certificate.
 * Never throws — returns a failed result on any error.
 *
 * Differences from runMarriageCertStructuredPipeline:
 *   - Uses the certificate-landscape system prompt (not the marriage cert prompt)
 *   - Returns CertificateLandscapePipelineResult with CourseCertificateLandscape data
 *   - orientation and page_count are detected from PDF and injected after parsing
 *   - HTML preview is NOT saved at this stage (renderer not yet built for this class)
 */
export async function runCertificateLandscapeStructuredPipeline(
  client: Anthropic,
  input: StructuredPipelineInput
): Promise<CertificateLandscapePipelineResult> {
  const ctx = `Order #${input.orderId ?? '?'} Doc #${input.documentId ?? '?'}`;
  const log = (msg: string) => console.log(`[structuredPipeline] ${ctx} — ${msg}`);

  try {
    // ── Build message content (same detection logic as legacy pipeline) ──
    const base64Data = Buffer.from(input.fileBuffer).toString('base64');
    const isPdf =
      input.contentType.includes('pdf') || input.fileUrl.toLowerCase().includes('.pdf');
    const isImage =
      input.contentType.includes('image/') ||
      /\.(png|jpg|jpeg|gif|webp)$/i.test(input.fileUrl);

    let messageContent: Anthropic.MessageParam['content'];

    if (isPdf) {
      messageContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
        } as any,
        { type: 'text', text: buildCertificateLandscapeUserMessage() },
      ];
    } else if (isImage) {
      const imageMediaType = input.contentType.includes('png')
        ? 'image/png'
        : input.contentType.includes('gif')
        ? 'image/gif'
        : input.contentType.includes('webp')
        ? 'image/webp'
        : 'image/jpeg';

      messageContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: imageMediaType, data: base64Data },
        },
        { type: 'text', text: buildCertificateLandscapeUserMessage() },
      ];
    } else {
      const textContent = Buffer.from(input.fileBuffer).toString('utf-8');
      messageContent = [
        {
          type: 'text',
          text: `${buildCertificateLandscapeUserMessage()}\n\n<source_document>\n${textContent}\n</source_document>`,
        },
      ];
    }

    // ── Call Claude with certificate landscape prompt ──
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: buildCertificateLandscapeSystemPrompt(),
      messages: [{ role: 'user', content: messageContent }],
    });

    const rawJson =
      response.content[0].type === 'text' ? response.content[0].text : '';

    if (!rawJson) {
      log('certificate structured extraction: no (empty response from Claude)');
      return { success: false, data: null, parseSuccess: false, validationSuccess: false, error: 'Empty Claude response' };
    }

    // ── Parse JSON ──
    let parsed: unknown;
    try {
      const cleanJson = rawJson
        .replace(/^```json?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
      log(`certificate structured extraction: no (JSON.parse failed — ${parseErr})`);
      return {
        success: false,
        data: null,
        parseSuccess: false,
        validationSuccess: false,
        error: `JSON parse failed: ${parseErr}`,
      };
    }

    log('certificate parse success: yes');

    // ── Validate ──
    if (!validateCertificateLandscape(parsed)) {
      log('certificate validation success: no (missing required fields)');
      return {
        success: false,
        data: null,
        parseSuccess: true,
        validationSuccess: false,
        error: 'Validation failed: required fields absent',
      };
    }

    log('certificate validation success: yes');

    // ── Handwritten field counts ──
    const cert = parsed as CourseCertificateLandscape;
    const hwFields = Array.isArray(cert.handwritten_fields) ? cert.handwritten_fields : [];
    log(`handwritten fields detected: ${hwFields.length}`);
    if (hwFields.length > 0) {
      const illegibleHw = hwFields.filter(
        f => f.legibility === 'illegible' || f.legibility === 'partially legible'
      ).length;
      if (illegibleHw > 0) log(`handwritten fields with legibility issues: ${illegibleHw}`);
    }
    log(`recipient name source: ${cert.recipient_name_source ?? 'unknown'}`);

    const visualCount = Array.isArray(cert.visual_elements) ? cert.visual_elements.length : 0;
    log(`documentary visual elements detected: ${visualCount}`);

    // ── Detect physical orientation and page count from original PDF ──────────
    // physicalOrientation = raw value from PDF page dimensions via pdf-lib.
    // Never modified after detection — represents the actual PDF page geometry.
    let physicalOrientation: DocumentOrientation = 'unknown';
    let detectedPageCount: number | null = null;

    if (isPdf) {
      try {
        const pdfDoc = await PDFDocument.load(input.fileBuffer, { ignoreEncryption: true });
        detectedPageCount = pdfDoc.getPageCount();
        log(`original pdf page count: ${detectedPageCount}`);
        const orientResult = detectOrientationFromPdfDoc(pdfDoc);
        physicalOrientation = orientResult.orientation;
        log(`physical orientation: ${physicalOrientation}`);
        log(`orientation source: ${orientResult.source}`);
      } catch (pdfErr) {
        log(`page count unavailable: yes (pdf-lib error: ${pdfErr})`);
        log('physical orientation: unknown');
        log('orientation source: unavailable');
      }
    } else {
      log('page count unavailable: yes (not a PDF)');
      log('physical orientation: unknown');
      log('orientation source: unavailable');
    }

    // ── Effective orientation — certificate-class override ────────────────────
    // effectiveOrientation is what the renderer and preview use.
    // For course_certificate_landscape, the document class itself is strong evidence
    // of landscape layout. A landscape certificate saved into a portrait PDF wrapper
    // (common with scanned or exported certificates) will show physicalOrientation=portrait
    // even though the visual content is landscape.
    //
    // Override rule (narrow — course_certificate_landscape class only):
    //   portrait + pageCount === 1  → landscape  (single-page portrait: common scanner artifact)
    //   unknown                     → landscape  (non-PDF or unreadable: default to class expectation)
    //   landscape                   → no override needed
    //   portrait + pageCount > 1    → no override (multi-page portrait is likely genuinely portrait)
    let effectiveOrientation: DocumentOrientation = physicalOrientation;
    let orientationOverrideReason: string | null = null;

    if (physicalOrientation === 'landscape') {
      // Already landscape — no override
    } else if (physicalOrientation === 'portrait' && detectedPageCount === 1) {
      effectiveOrientation = 'landscape';
      orientationOverrideReason = 'single-page portrait PDF → landscape (course_certificate_landscape class)';
    } else if (physicalOrientation === 'unknown') {
      effectiveOrientation = 'landscape';
      orientationOverrideReason = 'unknown physical orientation → landscape default for certificate class';
    }
    // else: multi-page portrait PDF → keep portrait

    log(`effective orientation: ${effectiveOrientation}`);
    log(`orientation override applied: ${orientationOverrideReason ? 'yes' : 'no'}` +
      (orientationOverrideReason ? ` | reason: ${orientationOverrideReason}` : ''));

    // ── Inject pipeline-detected metadata into parsed data ──
    // cert.orientation stores physicalOrientation (PDF metadata ground truth).
    // effectiveOrientation may differ and is used only for rendering/preview.
    cert.orientation = physicalOrientation;
    cert.page_count  = detectedPageCount;

    log(
      `certificate structured extraction: yes | ` +
      `document type: course_certificate_landscape | ` +
      `physical orientation: ${physicalOrientation} | ` +
      `effective orientation: ${effectiveOrientation} | ` +
      `page count: ${detectedPageCount ?? 'n/a'}`,
    );

    // ── Render structured HTML and optionally save preview ──────────────────
    // Wrapped in try-catch: preview failure must never disrupt the extraction
    // result. If the renderer throws, the pipeline still returns success.
    try {
      const certHtml = renderCertificateLandscapeHtml(cert, {
        pageCount: detectedPageCount ?? undefined,
        orientation: effectiveOrientation,
      });
      log(`certificate landscape renderer used: yes`);
      log(`preview orientation applied: ${effectiveOrientation}`);
      log(`handwritten fields rendered: ${hwFields.length}`);
      log(`documentary marks rendered: ${visualCount}`);
      log(`structured html generated: yes | length: ${certHtml.length} chars`);

      const previewEnabled = FEATURE_FLAGS.ENABLE_STRUCTURED_PREVIEW;
      log(`structured preview enabled: ${previewEnabled ? 'yes' : 'no'}`);
      if (previewEnabled) {
        const { saveStructuredPreview } = await import('@/services/structuredPreview');
        const preview = await saveStructuredPreview(
          certHtml,
          input.documentId ?? 'unknown',
          input.orderId ?? 'unknown',
          { generatePdf: true, orientation: effectiveOrientation },
        );
        log(`certificate landscape html preview saved: ${preview.htmlSaved ? 'yes' : 'no'}`);
        if (preview.htmlPath) log(`certificate landscape html preview path: ${preview.htmlPath}`);
        if (preview.htmlLocalPath) log(`certificate landscape html local path: ${preview.htmlLocalPath}`);
        log(`certificate landscape pdf preview generated: ${preview.pdfSaved ? 'yes' : 'no'}`);
        if (preview.pdfPath) log(`certificate landscape pdf preview path: ${preview.pdfPath}`);
        if (preview.pdfLocalPath) log(`certificate landscape pdf local path: ${preview.pdfLocalPath}`);
      }

      // ── Structured preview kit (3-part: cover + translated doc + original) ────
      // Only runs when ENABLE_STRUCTURED_PREVIEW_KIT=true.
      // Never disrupts the extraction result — wrapped in the same try-catch above.
      const kitEnabled = FEATURE_FLAGS.ENABLE_STRUCTURED_PREVIEW_KIT;
      log(`structured preview kit eligible: ${kitEnabled ? 'yes' : 'no'}`);
      if (kitEnabled) {
        const { assembleStructuredPreviewKit } = await import('@/services/structuredPreviewKit');
        const kit = await assembleStructuredPreviewKit({
          structuredHtml:    certHtml,
          originalFileBuffer: input.fileBuffer,
          isOriginalPdf:     isPdf,
          orderId:           input.orderId   ?? 'unknown',
          documentId:        input.documentId ?? 'unknown',
          sourceLanguage:    input.sourceLanguage,
          orientation:       effectiveOrientation,
          documentTypeLabel: cert.certificate_title || 'Training Certificate',
          sourcePageCount:   detectedPageCount ?? undefined,
        });
        log(`certification cover generated: ${kit.coverGenerated ? 'yes' : 'no'}`);
        log(`translated section generated: ${kit.translatedSectionGenerated ? 'yes' : 'no'}`);
        log(`original source appended: ${kit.originalAppended ? 'yes' : 'no'}`);
        log(`structured preview kit assembled: ${kit.assembled ? 'yes' : 'no'}`);
        if (kit.kitPath)      log(`structured preview kit storage path: ${kit.kitPath}`);
        if (kit.kitUrl)       log(`structured preview kit url: ${kit.kitUrl}`);
        if (kit.kitLocalPath) log(`structured preview kit local path: ${kit.kitLocalPath}`);
      }
    } catch (htmlErr) {
      log(`certificate landscape renderer used: no | renderer error: ${htmlErr}`);
    }

    return {
      success: true,
      data: cert,
      parseSuccess: true,
      validationSuccess: true,
      orientation: effectiveOrientation,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`certificate structured extraction: no | unexpected error: ${message}`);
    return { success: false, data: null, parseSuccess: false, validationSuccess: false, error: message };
  }
}

const STRUCTURED_DOCUMENT_LABELS: Record<SupportedStructuredDocumentType, string> = {
  marriage_certificate_brazil: 'Marriage Certificate',
  birth_certificate_brazil: 'Birth Certificate',
  civil_record_general: 'Civil Record',
  identity_travel_record: 'Identity / Travel Record',
  academic_diploma_certificate: 'Academic Diploma',
  academic_transcript: 'Academic Transcript',
  academic_record_general: 'Academic Record',
  corporate_business_record: 'Corporate / Business Record',
  publication_media_record: 'Publication / Media Evidence',
  recommendation_letter: 'Recommendation / Expert Letter',
  employment_record: 'Employment Record',
  course_certificate_landscape: 'Training Certificate',
  eb1_evidence_photo_sheet: 'EB1 Evidence Photo Sheet',
};

async function runSharedStructuredPipeline(
  client: Anthropic,
  input: StructuredPipelineInput,
  family:
    | 'civil_records'
    | 'identity_travel'
    | 'academic_records'
    | 'employment_records'
    | 'corporate_business_records'
    | 'publications_media'
    | 'recommendation_letters'
    | 'relationship_evidence',
  documentType: SupportedStructuredDocumentType,
): Promise<StructuredPipelineResult> {
  const ctx = `Order #${input.orderId ?? '?'} Doc #${input.documentId ?? '?'}`;
  const log = (msg: string) => console.log(`[structuredPipeline] ${ctx} — ${msg}`);

  try {
    const isPdf =
      input.contentType.includes('pdf') || input.fileUrl.toLowerCase().includes('.pdf');

    let sourcePageCount: number | undefined;
    let detectedOrientation: DocumentOrientation = 'unknown';

    if (isPdf) {
      try {
        const pdfDoc = await PDFDocument.load(input.fileBuffer, { ignoreEncryption: true });
        sourcePageCount = pdfDoc.getPageCount();
        const orientResult = detectOrientationFromPdfDoc(pdfDoc);
        detectedOrientation = orientResult.orientation;
        log(`original pdf page count: ${sourcePageCount}`);
        log(`original document orientation: ${detectedOrientation}`);
        log(`orientation source: ${orientResult.source}`);
      } catch (pdfErr) {
        log(`page count unavailable: yes (pdf-lib error: ${pdfErr})`);
        log('original document orientation: unknown');
        log('orientation source: unavailable');
      }
    } else {
      log('page count unavailable: yes (not a PDF)');
      log('original document orientation: unknown');
      log('orientation source: unavailable');
    }

    const resolved = await renderStructuredFamilyDocument({
      client,
      family,
      documentType,
      originalFileBuffer: input.fileBuffer,
      originalFileUrl: input.fileUrl,
      contentType: input.contentType,
      sourcePageCount,
      detectedOrientation,
      orderId: input.orderId,
      documentId: input.documentId,
      sourceLanguage: input.sourceLanguage ?? null,
      targetLanguage: 'EN',
      logPrefix: `[structuredPipeline] ${ctx}`,
    });

    log(`shared structured renderer used: yes | family: ${family} | documentType: ${documentType}`);
    log(`structured html generated: yes | length: ${resolved.structuredHtml.length} chars`);

    const previewEnabled = FEATURE_FLAGS.ENABLE_STRUCTURED_PREVIEW;
    log(`structured preview enabled: ${previewEnabled ? 'yes' : 'no'}`);
    if (previewEnabled) {
      const { saveStructuredPreview } = await import('@/services/structuredPreview');
      const preview = await saveStructuredPreview(
        resolved.structuredHtml,
        input.documentId ?? 'unknown',
        input.orderId ?? 'unknown',
        {
          generatePdf: true,
          orientation: resolved.orientationForKit,
        },
      );
      log(`structured html preview saved: ${preview.htmlSaved ? 'yes' : 'no'}`);
      if (preview.htmlPath) log(`structured html preview path: ${preview.htmlPath}`);
      if (preview.htmlLocalPath) log(`structured html local path: ${preview.htmlLocalPath}`);
      log(`structured pdf preview generated: ${preview.pdfSaved ? 'yes' : 'no'}`);
      if (preview.pdfPath) log(`structured pdf preview path: ${preview.pdfPath}`);
      if (preview.pdfLocalPath) log(`structured pdf local path: ${preview.pdfLocalPath}`);
    }

    const kitEnabled = FEATURE_FLAGS.ENABLE_STRUCTURED_PREVIEW_KIT;
    log(`structured preview kit eligible: ${kitEnabled ? 'yes' : 'no'}`);
    if (kitEnabled) {
      const { assembleStructuredPreviewKit } = await import('@/services/structuredPreviewKit');
      const kit = await assembleStructuredPreviewKit({
        structuredHtml: resolved.structuredHtml,
        originalFileBuffer: input.fileBuffer,
        isOriginalPdf: isPdf,
        orderId: input.orderId ?? 'unknown',
        documentId: input.documentId ?? 'unknown',
        sourceLanguage: input.sourceLanguage,
        targetLanguage: resolved.languageIntegrity.targetLanguage,
        orientation: resolved.orientationForKit,
        documentTypeLabel: STRUCTURED_DOCUMENT_LABELS[documentType],
        sourcePageCount,
        languageIntegrity: resolved.languageIntegrity,
      });
      log(`certification cover generated: ${kit.coverGenerated ? 'yes' : 'no'}`);
      log(`translated section generated: ${kit.translatedSectionGenerated ? 'yes' : 'no'}`);
      log(`original source appended: ${kit.originalAppended ? 'yes' : 'no'}`);
      log(`structured preview kit assembled: ${kit.assembled ? 'yes' : 'no'}`);
      if (kit.kitPath) log(`structured preview kit storage path: ${kit.kitPath}`);
      if (kit.kitUrl) log(`structured preview kit url: ${kit.kitUrl}`);
      if (kit.kitLocalPath) log(`structured preview kit local path: ${kit.kitLocalPath}`);
    }

    return {
      success: true,
      data: null,
      parseSuccess: true,
      validationSuccess: true,
      orientation: resolved.orientationForKit,
    };
  } catch (err) {
    const message = formatStructuredRenderingFailureMessage(documentType, err);
    log(message);
    return {
      success: false,
      data: null,
      parseSuccess: false,
      validationSuccess: false,
      error: message,
    };
  }
}

// ── Pipeline dispatcher ────────────────────────────────────────────────────────

/**
 * Routes a structured pipeline call to the correct sub-pipeline based on
 * the classified document type.
 *
 * Called by route.ts instead of calling sub-pipelines directly, so that
 * new document classes can be added here without touching the route.
 *
 * Never throws — errors are contained inside each sub-pipeline.
 */
export async function dispatchStructuredPipeline(
  client: Anthropic,
  input: StructuredPipelineInput,
  documentType: DocumentType
): Promise<StructuredPipelineResult | CertificateLandscapePipelineResult> {
  const familyDetection = detectDocumentFamily({ documentType, fileUrl: input.fileUrl });
  const familyCapabilities = getFamilyRenderCapabilities(familyDetection.family);

  if (!familyCapabilities.structuredRendererImplemented || !isSupportedStructuredDocumentType(documentType)) {
    return {
      success: false,
      data: null,
      parseSuccess: false,
      validationSuccess: false,
      error:
        `No structured pipeline registered for document family "${familyDetection.family}" and document type "${documentType}".`,
    };
  }

  if (documentType === 'course_certificate_landscape') {
    return runCertificateLandscapeStructuredPipeline(client, input);
  }

  if (
    familyDetection.family !== 'civil_records' &&
    familyDetection.family !== 'identity_travel' &&
    familyDetection.family !== 'academic_records' &&
    familyDetection.family !== 'employment_records' &&
    familyDetection.family !== 'corporate_business_records' &&
    familyDetection.family !== 'publications_media' &&
    familyDetection.family !== 'recommendation_letters' &&
    familyDetection.family !== 'relationship_evidence'
  ) {
    return {
      success: false,
      data: null,
      parseSuccess: false,
      validationSuccess: false,
      error:
        `No shared structured pipeline family bridge for "${familyDetection.family}" (document type: ${documentType}).`,
    };
  }

  return runSharedStructuredPipeline(client, input, familyDetection.family, documentType);
}
