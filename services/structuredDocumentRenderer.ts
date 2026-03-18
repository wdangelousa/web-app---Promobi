import Anthropic from '@anthropic-ai/sdk';
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
import type { DocumentType } from '@/services/documentClassifier';
import type { DocumentOrientation } from '@/lib/documentOrientationDetector';
import type { MarriageCertificateBrazil } from '@/types/marriageCertificate';
import type { CourseCertificateLandscape } from '@/types/certificateLandscape';
import type { AcademicDiplomaCertificate } from '@/types/academicDiploma';
import type { AcademicTranscript } from '@/types/academicTranscript';
import type { BirthCertificateBrazil } from '@/types/birthCertificate';

export type SupportedStructuredDocumentType = Exclude<DocumentType, 'unknown'>;

export const SUPPORTED_STRUCTURED_DOCUMENT_TYPES: readonly SupportedStructuredDocumentType[] = [
  'marriage_certificate_brazil',
  'birth_certificate_brazil',
  'academic_diploma_certificate',
  'academic_transcript',
  'course_certificate_landscape',
] as const;

export function isSupportedStructuredDocumentType(
  documentType: DocumentType,
): documentType is SupportedStructuredDocumentType {
  return SUPPORTED_STRUCTURED_DOCUMENT_TYPES.includes(
    documentType as SupportedStructuredDocumentType,
  );
}

export class StructuredRenderingRequiredError extends Error {
  readonly code = 'STRUCTURED_RENDERING_REQUIRED';

  constructor(
    readonly documentType: SupportedStructuredDocumentType,
    message: string,
  ) {
    super(message);
    this.name = 'StructuredRenderingRequiredError';
  }
}

export interface StructuredRenderInput {
  client: Anthropic;
  documentType: SupportedStructuredDocumentType;
  originalFileBuffer: ArrayBuffer;
  originalFileUrl?: string | null;
  contentType: string;
  sourcePageCount?: number;
  detectedOrientation: DocumentOrientation;
  logPrefix: string;
}

export interface StructuredRenderOutput {
  structuredHtml: string;
  orientationForKit: DocumentOrientation;
}

function stripMarkdownFences(raw: string): string {
  return raw
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

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

  const textContent = Buffer.from(fileBuffer).toString('utf-8');
  return [
    {
      type: 'text',
      text: `${userMessage}\n\n<source_document>\n${textContent}\n</source_document>`,
    },
  ];
}

function buildStructuredFailureMessage(
  documentType: SupportedStructuredDocumentType,
  reason: string,
): string {
  return `Structured rendering failed for "${documentType}". Legacy fallback is blocked for supported document families. ${reason}`;
}

export function formatStructuredRenderingFailureMessage(
  documentType: SupportedStructuredDocumentType,
  err: unknown,
): string {
  if (err instanceof StructuredRenderingRequiredError) {
    return err.message;
  }

  const detail =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'Check server logs for details.';

  return buildStructuredFailureMessage(documentType, detail);
}

function ensureStructuredSourceAvailable(
  documentType: SupportedStructuredDocumentType,
  originalFileBuffer: ArrayBuffer,
  originalFileUrl?: string | null,
): string {
  if (!originalFileUrl || originalFileBuffer.byteLength === 0) {
    throw new StructuredRenderingRequiredError(
      documentType,
      `Structured rendering is required for "${documentType}" but the original file is not available. Re-upload the original document and try again.`,
    );
  }

  return originalFileUrl;
}

function ensureExtractionJson(
  documentType: SupportedStructuredDocumentType,
  rawJson: string | null,
): string {
  if (!rawJson) {
    throw new StructuredRenderingRequiredError(
      documentType,
      buildStructuredFailureMessage(
        documentType,
        'Claude extraction did not return structured JSON. Fix the structured renderer/input before preview or delivery.',
      ),
    );
  }

  return rawJson;
}

function parseStructuredJson<T>(
  documentType: SupportedStructuredDocumentType,
  rawJson: string,
): T {
  try {
    return JSON.parse(stripMarkdownFences(rawJson)) as T;
  } catch (err) {
    throw new StructuredRenderingRequiredError(
      documentType,
      buildStructuredFailureMessage(
        documentType,
        `Claude returned invalid structured JSON. ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}

export async function renderSupportedStructuredDocument(
  input: StructuredRenderInput,
): Promise<StructuredRenderOutput> {
  const fileUrl = ensureStructuredSourceAvailable(
    input.documentType,
    input.originalFileBuffer,
    input.originalFileUrl,
  );

  const messageContentFor = (userMessage: string) =>
    buildMessageContent(
      input.originalFileBuffer,
      fileUrl,
      input.contentType,
      userMessage,
    );

  if (input.documentType === 'marriage_certificate_brazil') {
    const rawJson = ensureExtractionJson(
      input.documentType,
      await callClaudeForJson(
        input.client,
        buildStructuredMarriageCertSystemPrompt(),
        messageContentFor(buildStructuredUserMessage()),
        8192,
        `${input.logPrefix} [marriage-cert]`,
      ),
    );

    const parsed = parseStructuredJson<MarriageCertificateBrazil>(
      input.documentType,
      rawJson,
    );

    const structuredHtml = renderMarriageCertificateHtml(parsed, {
      pageCount: input.sourcePageCount,
      orientation:
        input.detectedOrientation === 'landscape'
          ? 'landscape'
          : input.detectedOrientation === 'portrait'
            ? 'portrait'
            : 'unknown',
    });

    return {
      structuredHtml,
      orientationForKit: input.detectedOrientation,
    };
  }

  if (input.documentType === 'course_certificate_landscape') {
    const rawJson = ensureExtractionJson(
      input.documentType,
      await callClaudeForJson(
        input.client,
        buildCertificateLandscapeSystemPrompt(),
        messageContentFor(buildCertificateLandscapeUserMessage()),
        4096,
        `${input.logPrefix} [cert-landscape]`,
      ),
    );

    const parsed = parseStructuredJson<CourseCertificateLandscape>(
      input.documentType,
      rawJson,
    );

    let effectiveOrientation: DocumentOrientation = input.detectedOrientation;
    if (input.detectedOrientation === 'portrait' && input.sourcePageCount === 1) {
      effectiveOrientation = 'landscape';
    } else if (input.detectedOrientation === 'unknown') {
      effectiveOrientation = 'landscape';
    }

    parsed.orientation = input.detectedOrientation;
    parsed.page_count = input.sourcePageCount ?? null;

    return {
      structuredHtml: renderCertificateLandscapeHtml(parsed, {
        pageCount: input.sourcePageCount,
        orientation: effectiveOrientation,
      }),
      orientationForKit: effectiveOrientation,
    };
  }

  if (input.documentType === 'academic_diploma_certificate') {
    const rawJson = ensureExtractionJson(
      input.documentType,
      await callClaudeForJson(
        input.client,
        buildAcademicDiplomaSystemPrompt(),
        messageContentFor(buildAcademicDiplomaUserMessage()),
        8192,
        `${input.logPrefix} [academic-diploma]`,
      ),
    );

    const parsed = parseStructuredJson<AcademicDiplomaCertificate>(
      input.documentType,
      rawJson,
    );

    const effectiveOrientation: DocumentOrientation =
      input.detectedOrientation === 'unknown' ? 'landscape' : input.detectedOrientation;

    parsed.orientation = input.detectedOrientation;
    parsed.page_count = input.sourcePageCount ?? null;

    return {
      structuredHtml: renderAcademicDiplomaHtml(parsed, {
        pageCount: input.sourcePageCount,
        orientation: effectiveOrientation,
      }),
      orientationForKit: effectiveOrientation,
    };
  }

  if (input.documentType === 'academic_transcript') {
    const rawJson = ensureExtractionJson(
      input.documentType,
      await callClaudeForJson(
        input.client,
        buildAcademicTranscriptSystemPrompt(),
        messageContentFor(buildAcademicTranscriptUserMessage()),
        8192,
        `${input.logPrefix} [academic-transcript]`,
      ),
    );

    const parsed = parseStructuredJson<AcademicTranscript>(
      input.documentType,
      rawJson,
    );

    parsed.orientation = input.detectedOrientation;
    parsed.page_count = input.sourcePageCount ?? null;

    return {
      structuredHtml: renderAcademicTranscriptHtml(parsed, {
        pageCount: input.sourcePageCount,
        orientation: input.detectedOrientation,
      }),
      orientationForKit: input.detectedOrientation,
    };
  }

  const rawJson = ensureExtractionJson(
    input.documentType,
    await callClaudeForJson(
      input.client,
      buildBirthCertificateSystemPrompt(),
      messageContentFor(buildBirthCertificateUserMessage()),
      6144,
      `${input.logPrefix} [birth-cert]`,
    ),
  );

  const parsed = parseStructuredJson<BirthCertificateBrazil>(
    input.documentType,
    rawJson,
  );

  parsed.orientation = input.detectedOrientation;
  parsed.page_count = input.sourcePageCount ?? null;

  return {
    structuredHtml: renderBirthCertificateHtml(parsed, {
      pageCount: input.sourcePageCount,
      orientation: input.detectedOrientation,
    }),
    orientationForKit: input.detectedOrientation,
  };
}
