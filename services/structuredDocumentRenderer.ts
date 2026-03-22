import Anthropic from '@anthropic-ai/sdk';
import { FAITHFUL_PARITY_PROMPT_NOTE, type PreRenderLayoutHints } from '@/lib/parityRecovery';
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
  buildAcademicRecordGeneralSystemPrompt,
  buildAcademicRecordGeneralUserMessage,
} from '@/lib/academicRecordGeneralPrompt';
import {
  buildBirthCertificateSystemPrompt,
  buildBirthCertificateUserMessage,
} from '@/lib/birthCertificatePrompt';
import {
  buildCivilRecordGeneralSystemPrompt,
  buildCivilRecordGeneralUserMessage,
} from '@/lib/civilRecordGeneralPrompt';
import {
  buildCivilRecordGeneralCompactZoneSystemPrompt,
  buildCivilRecordGeneralCompactZoneUserMessage,
} from '@/lib/civilRecordGeneralCompactZonePrompt';
import {
  buildIdentityTravelRecordSystemPrompt,
  buildIdentityTravelRecordUserMessage,
} from '@/lib/identityTravelRecordPrompt';
import {
  buildEmploymentRecordSystemPrompt,
  buildEmploymentRecordUserMessage,
} from '@/lib/employmentRecordPrompt';
import {
  buildCorporateBusinessRecordSystemPrompt,
  buildCorporateBusinessRecordUserMessage,
} from '@/lib/corporateBusinessRecordPrompt';
import {
  buildRecommendationLetterSystemPrompt,
  buildRecommendationLetterUserMessage,
} from '@/lib/recommendationLetterPrompt';
import {
  buildPublicationMediaRecordSystemPrompt,
  buildPublicationMediaRecordUserMessage,
} from '@/lib/publicationMediaRecordPrompt';
import {
  buildLettersAndStatementsSystemPrompt,
  buildLettersAndStatementsUserMessage,
} from '@/lib/lettersAndStatementsPrompt';
import {
  buildEditorialNewsPagesSystemPrompt,
  buildEditorialNewsPagesUserMessage,
} from '@/lib/editorialNewsPagesPrompt';
import {
  buildEb1EvidencePhotoSheetSystemPrompt,
  buildEb1EvidencePhotoSheetUserMessage,
} from '@/lib/eb1EvidencePhotoSheetPrompt';
import { renderMarriageCertificateHtml } from '@/lib/marriageCertRenderer';
import { renderCertificateLandscapeHtml } from '@/lib/certificateLandscapeRenderer';
import { renderAcademicDiplomaHtml } from '@/lib/academicDiplomaRenderer';
import { renderAcademicTranscriptHtml } from '@/lib/academicTranscriptRenderer';
import { renderAcademicRecordGeneralHtml } from '@/lib/academicRecordGeneralRenderer';
import { renderBirthCertificateHtml } from '@/lib/birthCertificateRenderer';
import {
  prepareCivilRecordGeneralForRender,
  renderCivilRecordGeneralHtml,
} from '@/lib/civilRecordGeneralRenderer';
import { renderCivilRecordCompactZoneHtml } from '@/lib/civilRecordCompactZoneRenderer';
import { renderIdentityTravelRecordHtml } from '@/lib/identityTravelRecordRenderer';
import { renderEmploymentRecordHtml } from '@/lib/employmentRecordRenderer';
import { renderCorporateBusinessRecordHtml } from '@/lib/corporateBusinessRecordRenderer';
import { renderRecommendationLetterHtml } from '@/lib/recommendationLetterRenderer';
import { renderPublicationMediaRecordHtml } from '@/lib/publicationMediaRecordRenderer';
import { renderLettersAndStatementsHtml } from '@/lib/lettersAndStatementsRenderer';
import { renderEditorialNewsPagesHtml } from '@/lib/editorialNewsPagesRenderer';
import { renderEb1EvidencePhotoSheetHtml } from '@/lib/eb1EvidencePhotoSheetRenderer';
import {
  detectSourceLanguageLeakageFromSegments,
  normalizeLanguageCode,
} from '@/lib/translatedLanguageIntegrity';
import type { SourceLanguageLeakageResult } from '@/lib/translatedLanguageIntegrity';
import { resolveSourceLanguageForStructuredContext } from '@/lib/sourceLanguageResolver';
import type { DocumentType } from '@/services/documentClassifier';
import {
  detectDocumentFamily,
  getFamilyClientFacingCapabilityMap,
  getDocumentFamilyImplementationMatrixRow,
  getDocumentFamilyForType,
  getFamilyLayoutProfile,
  getFamilyRenderCapabilities,
  resolveDocumentTypeModality,
  type DocumentFamilyImplementationMatrixRow,
  type FamilyClientFacingCapabilityMap,
  type FamilyLayoutProfile,
  type FamilyRenderCapabilities,
  type RegisteredDocumentFamily,
} from '@/services/documentFamilyRegistry';
import type { DocumentOrientation } from '@/lib/documentOrientationDetector';
import type { MarriageCertificateBrazil } from '@/types/marriageCertificate';
import type { CourseCertificateLandscape } from '@/types/certificateLandscape';
import type { AcademicDiplomaCertificate } from '@/types/academicDiploma';
import type { AcademicTranscript } from '@/types/academicTranscript';
import type { AcademicRecordGeneral } from '@/types/academicRecordGeneral';
import type { BirthCertificateBrazil } from '@/types/birthCertificate';
import type {
  CivilRecordGeneral,
  CivilRecordGeneralZoneBlueprint,
  CivilRecordSubtype,
} from '@/types/civilRecordGeneral';
import type { IdentityTravelRecord } from '@/types/identityTravelRecord';
import type { EmploymentRecord } from '@/types/employmentRecord';
import type { CorporateBusinessRecord } from '@/types/corporateBusinessRecord';
import type { RecommendationLetter } from '@/types/recommendationLetter';
import type { PublicationMediaRecord } from '@/types/publicationMediaRecord';
import type {
  LettersAndStatements,
  LettersStatementsLayoutZone,
  LettersStatementsStructuredPage,
  LettersStatementsTranslatedZoneContent,
} from '@/types/lettersAndStatements';
import type {
  EditorialNewsLayoutZone,
  EditorialNewsPages,
  EditorialNewsStructuredPage,
  EditorialNewsTranslatedZoneContent,
} from '@/types/editorialNewsPages';
import type {
  Eb1EvidenceLayoutZone,
  Eb1EvidencePhotoSheet,
  Eb1EvidenceStructuredPage,
  Eb1EvidenceTranslatedZoneContent,
} from '@/types/eb1EvidencePhotoSheet';

export type SupportedStructuredDocumentType = Exclude<DocumentType, 'unknown'>;

export const STRUCTURED_RENDERER_BY_DOCUMENT_TYPE: Record<SupportedStructuredDocumentType, string> = {
  marriage_certificate_brazil: 'marriageCertRenderer',
  birth_certificate_brazil: 'birthCertificateRenderer',
  civil_record_general: 'civilRecordGeneralRenderer',
  identity_travel_record: 'identityTravelRecordRenderer',
  academic_diploma_certificate: 'academicDiplomaRenderer',
  academic_transcript: 'academicTranscriptRenderer',
  academic_record_general: 'academicRecordGeneralRenderer',
  corporate_business_record: 'corporateBusinessRecordRenderer',
  editorial_news_pages: 'editorialNewsPagesRenderer',
  publication_media_record: 'publicationMediaRecordRenderer',
  letters_and_statements: 'lettersAndStatementsRenderer',
  recommendation_letter: 'recommendationLetterRenderer',
  employment_record: 'employmentRecordRenderer',
  course_certificate_landscape: 'certificateLandscapeRenderer',
  eb1_evidence_photo_sheet: 'eb1EvidencePhotoSheetRenderer',
};

// Backward-compatible alias while older call sites are migrated.
export const STRUCTURED_RENDERER_BY_FAMILY = STRUCTURED_RENDERER_BY_DOCUMENT_TYPE;

export const SUPPORTED_STRUCTURED_DOCUMENT_TYPES: readonly SupportedStructuredDocumentType[] = [
  'marriage_certificate_brazil',
  'birth_certificate_brazil',
  'civil_record_general',
  'identity_travel_record',
  'academic_diploma_certificate',
  'academic_transcript',
  'academic_record_general',
  'corporate_business_record',
  'editorial_news_pages',
  'publication_media_record',
  'letters_and_statements',
  'recommendation_letter',
  'employment_record',
  'course_certificate_landscape',
  'eb1_evidence_photo_sheet',
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
    readonly documentType: DocumentType,
    message: string,
  ) {
    super(message);
    this.name = 'StructuredRenderingRequiredError';
  }
}

export interface StructuredClientFacingRenderAssertionInput {
  documentType: DocumentType;
  documentLabel?: string | null;
  fileUrl?: string | null;
  translatedText?: string | null;
  detectedOrientation?: DocumentOrientation;
  surface: string;
  logPrefix: string;
}

export interface StructuredClientFacingRenderAssertionResult {
  family: RegisteredDocumentFamily;
  documentType: SupportedStructuredDocumentType;
  rendererName: string;
  familyLayoutProfile: FamilyLayoutProfile;
  familyCapabilities: FamilyRenderCapabilities;
  familyClientFacingCapability: FamilyClientFacingCapabilityMap;
  implementationMatrixRow: DocumentFamilyImplementationMatrixRow;
  surfaceRequirement: 'preview' | 'delivery' | 'unknown';
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
  orderId?: string | number;
  documentId?: string | number;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  /**
   * Phase 2 pre-render layout hints. Consumed by `buildStructuredKitBuffer`
   * to select and apply an initial render profile (balanced / compact / dense)
   * before the first Gotenberg pass. Reduces reliance on the recovery ladder.
   */
  layoutHints?: PreRenderLayoutHints;
  /**
   * Human-readable document type label from the source record (e.g. the
   * exact name on the document, or the doc-type string from the order).
   * Used for pre-render diploma/certificate signal detection in the
   * letters_and_statements renderer path.
   */
  documentTypeLabel?: string | null;
}

export interface StructuredRenderLanguageIntegrity {
  targetLanguage: string;
  sourceLanguage: string;
  translatedPayloadFound: boolean;
  translatedZonesCount: number | null;
  sourceZonesCount: number | null;
  missingTranslatedZones: string[];
  sourceContentAttempted: boolean;
  sourceLanguageMarkers: string[];
  requiredZones: string[];
  translatedZonesFound: string[];
  sourceLanguageContaminatedZones: string[];
  mappedGenericZones: string[];
  languageIssueType:
    | 'none'
    | 'missing_translated_zones'
    | 'source_language_mismatch'
    | 'missing_and_source_language_mismatch';
}

export interface StructuredRenderOutput {
  structuredHtml: string;
  orientationForKit: DocumentOrientation;
  rendererName: string;
  languageIntegrity: StructuredRenderLanguageIntegrity;
}

export interface StructuredFamilyRenderInput extends StructuredRenderInput {
  family: RegisteredDocumentFamily;
}

export function getStructuredRendererName(
  documentType: SupportedStructuredDocumentType,
): string {
  return STRUCTURED_RENDERER_BY_DOCUMENT_TYPE[documentType];
}

/**
 * Appends FAITHFUL_PARITY_PROMPT_NOTE to a system prompt when the document
 * type maps to the 'faithful' translation modality.
 *
 * Centralising the note here ensures all faithful-modality rendering paths
 * receive it automatically, including any new families added in the future,
 * without requiring per-case changes in the renderer switch statement.
 */
function buildSystemPromptWithParityNote(basePrompt: string, documentType: string): string {
  if (resolveDocumentTypeModality(documentType) === 'faithful') {
    return `${basePrompt}\n\n${FAITHFUL_PARITY_PROMPT_NOTE}`;
  }
  return basePrompt;
}

function buildMissingStructuredRendererMessage(
  family: string,
  surface: string,
): string {
  return `Document family detected: ${family}. Structured translated renderer not implemented yet. Surface: ${surface}. Client-facing translated output is blocked; linear/plain fallback is not allowed.`;
}

function buildUnknownFamilyMessage(surface: string): string {
  return `Unable to determine a supported structured document family. Surface: ${surface}. Client-facing translated output is blocked; linear/plain fallback is not allowed.`;
}

function resolveSurfaceRequirement(surface: string): 'preview' | 'delivery' | 'unknown' {
  const normalized = surface.trim().toLowerCase();
  if (normalized.includes('preview')) return 'preview';
  if (
    normalized.includes('delivery') ||
    normalized.includes('/api/pdf/generate') ||
    normalized.includes('/api/generate-pdf-kit')
  ) {
    return 'delivery';
  }
  return 'unknown';
}

function isSurfaceCapabilitySatisfied(
  capability: FamilyClientFacingCapabilityMap,
  requirement: 'preview' | 'delivery' | 'unknown',
): boolean {
  if (requirement === 'preview') return capability.previewSupported;
  if (requirement === 'delivery') return capability.deliverySupported;
  return capability.previewSupported && capability.deliverySupported;
}

function summarizeCapabilityMap(capability: FamilyClientFacingCapabilityMap): string {
  return (
    `preview=${capability.previewSupported ? 'yes' : 'no'} ` +
    `delivery=${capability.deliverySupported ? 'yes' : 'no'} ` +
    `orientation=${capability.orientationSupport} ` +
    `table=${capability.tableSupport} ` +
    `signature=${capability.signatureBlockSupport} ` +
    `pageParity=${capability.exactPageParitySupported ? 'yes' : 'no'} ` +
    `compaction=${capability.parityCompactionProfile} ` +
    `maxDensity=${capability.maxSafeDensityProfile} ` +
    `certPagePolicy=${capability.certificationPagePolicy}`
  );
}

function summarizeImplementationMatrixRow(row: DocumentFamilyImplementationMatrixRow): string {
  return (
    `detection=${row.detectionImplemented ? 'yes' : 'no'} ` +
    `previewRenderer=${row.previewRendererImplemented ? 'yes' : 'no'} ` +
    `deliveryRenderer=${row.finalDeliveryRendererImplemented ? 'yes' : 'no'} ` +
    `portrait=${row.portraitSupported ? 'yes' : 'no'} ` +
    `landscape=${row.landscapeSupported ? 'yes' : 'no'} ` +
    `denseTable=${row.denseTableHandling ? 'yes' : 'no'} ` +
    `signatureSeal=${row.signatureSealHandling ? 'yes' : 'no'} ` +
    `priority=${row.priorityLevel}`
  );
}

function isOrientationSupportedByMatrix(
  row: DocumentFamilyImplementationMatrixRow,
  orientation: DocumentOrientation | undefined,
): boolean {
  if (!orientation || orientation === 'unknown') return true;
  if (orientation === 'portrait') return row.portraitSupported;
  if (orientation === 'landscape') return row.landscapeSupported;
  return true;
}

export function assertStructuredClientFacingRender(
  input: StructuredClientFacingRenderAssertionInput,
): StructuredClientFacingRenderAssertionResult {
  const {
    documentType,
    documentLabel,
    fileUrl,
    translatedText,
    detectedOrientation,
    surface,
    logPrefix,
  } = input;
  const detection = detectDocumentFamily({
    documentType,
    documentLabel,
    fileUrl,
    translatedText,
  });
  const family = detection.family;
  const familyLayoutProfile = getFamilyLayoutProfile(family);
  const familyCapabilities = getFamilyRenderCapabilities(family);
  const familyClientFacingCapability = getFamilyClientFacingCapabilityMap(family);
  const implementationMatrixRow = getDocumentFamilyImplementationMatrixRow(family);
  const surfaceRequirement = resolveSurfaceRequirement(surface);

  console.log(
    `${logPrefix} — structured render guard: evaluating surface=${surface}, docType=${documentType}, family=${family}, detection=${detection.confidence}`,
  );
  console.log(
    `${logPrefix} — structured render guard: capability map | family=${family} | ${summarizeCapabilityMap(familyClientFacingCapability)}`,
  );
  console.log(
    `${logPrefix} — structured render guard: implementation matrix | family=${family} | ${summarizeImplementationMatrixRow(implementationMatrixRow)} | notes="${implementationMatrixRow.notes}"`,
  );

  if (family === 'unknown') {
    const message = buildUnknownFamilyMessage(surface);
    console.error(`${logPrefix} — structured render guard: blocked | ${message} reason=${detection.reason}`);
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  if (!implementationMatrixRow.detectionImplemented) {
    const message =
      `Document family detected: ${family}. Matrix marks detection as not implemented. ` +
      `Surface: ${surface}. Client-facing translated output is blocked; linear/plain fallback is not allowed.`;
    console.error(
      `${logPrefix} — structured render guard: blocked | ${message} matrix=${summarizeImplementationMatrixRow(implementationMatrixRow)}`,
    );
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  if (!familyCapabilities.structuredRendererImplemented) {
    const message = buildMissingStructuredRendererMessage(family, surface);
    console.error(
      `${logPrefix} — structured render guard: blocked | ${message} status=${familyCapabilities.status} ` +
      `capabilities=${summarizeCapabilityMap(familyClientFacingCapability)} matrix=${summarizeImplementationMatrixRow(implementationMatrixRow)}`,
    );
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  if (!isSurfaceCapabilitySatisfied(familyClientFacingCapability, surfaceRequirement)) {
    const expectedSurface = surfaceRequirement === 'unknown' ? 'preview+delivery' : surfaceRequirement;
    const message =
      `Document family detected: ${family}. Structured translated renderer capability is missing for ${expectedSurface}. ` +
      `Surface: ${surface}. Client-facing translated output is blocked; linear/plain fallback is not allowed.`;
    console.error(
      `${logPrefix} — structured render guard: blocked | ${message} ` +
      `capabilities=${summarizeCapabilityMap(familyClientFacingCapability)} matrix=${summarizeImplementationMatrixRow(implementationMatrixRow)}`,
    );
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  if (!familyClientFacingCapability.exactPageParitySupported) {
    const message =
      `Document family detected: ${family}. Page-parity capability is not supported in the client-facing matrix. ` +
      `Surface: ${surface}. Output is blocked because translated_page_count must equal source_page_count.`;
    console.error(
      `${logPrefix} — structured render guard: blocked | ${message} ` +
      `capabilities=${summarizeCapabilityMap(familyClientFacingCapability)} matrix=${summarizeImplementationMatrixRow(implementationMatrixRow)}`,
    );
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  if (!isOrientationSupportedByMatrix(implementationMatrixRow, detectedOrientation)) {
    const message =
      `Document family detected: ${family}. Matrix does not support ${detectedOrientation} orientation for this family. ` +
      `Surface: ${surface}. Client-facing translated output is blocked to avoid degraded fallback layout.`;
    console.error(
      `${logPrefix} — structured render guard: blocked | ${message} matrix=${summarizeImplementationMatrixRow(implementationMatrixRow)}`,
    );
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  if (
    familyLayoutProfile.likelyTableDensity === 'high' &&
    !implementationMatrixRow.denseTableHandling
  ) {
    const message =
      `Document family detected: ${family}. Matrix reports no dense-table handling for a high-density family profile. ` +
      `Surface: ${surface}. Client-facing translated output is blocked to avoid ugly fallback rendering.`;
    console.error(
      `${logPrefix} — structured render guard: blocked | ${message} matrix=${summarizeImplementationMatrixRow(implementationMatrixRow)}`,
    );
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  if (
    (familyLayoutProfile.signatureStampPresence === 'common' ||
      familyLayoutProfile.signatureStampPresence === 'very-common') &&
    !implementationMatrixRow.signatureSealHandling
  ) {
    const message =
      `Document family detected: ${family}. Matrix reports no signature/seal handling for a signature-heavy family profile. ` +
      `Surface: ${surface}. Client-facing translated output is blocked to avoid ugly fallback rendering.`;
    console.error(
      `${logPrefix} — structured render guard: blocked | ${message} matrix=${summarizeImplementationMatrixRow(implementationMatrixRow)}`,
    );
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  if (!isSupportedStructuredDocumentType(documentType)) {
    const message =
      `Family mismatch: document family "${family}" is mapped but no structured renderer is registered for document type "${documentType}" ` +
      `(surface: ${surface}). Client-facing translated output is blocked.`;
    console.error(`${logPrefix} — structured render guard: blocked | ${message}`);
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  const mappedFamily = getDocumentFamilyForType(documentType);
  if (mappedFamily !== family) {
    const message =
      `Family mismatch: document type "${documentType}" belongs to family "${mappedFamily}" but detector selected "${family}" ` +
      `(surface: ${surface}). Client-facing translated output is blocked.`;
    console.error(`${logPrefix} — structured render guard: blocked | ${message}`);
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  if (!familyCapabilities.supportedDocumentTypes.includes(documentType)) {
    const message =
      `Family mismatch: family "${family}" has no premium renderer binding for document type "${documentType}" ` +
      `(surface: ${surface}). Client-facing translated output is blocked.`;
    console.error(`${logPrefix} — structured render guard: blocked | ${message}`);
    throw new StructuredRenderingRequiredError(documentType, message);
  }

  const rendererName = getStructuredRendererName(documentType);
  console.log(
    `${logPrefix} — structured render guard: allowed | family=${family} | renderer=${rendererName} | ` +
    `defaultOrientation=${familyLayoutProfile.defaultOrientation} | safeMarginExpansion=${familyLayoutProfile.safeMarginExpansionLikely ? 'yes' : 'no'} | ` +
    `${summarizeCapabilityMap(familyClientFacingCapability)} | matrix=${summarizeImplementationMatrixRow(implementationMatrixRow)} | ` +
    `surfaceRequirement=${surfaceRequirement} | detectedOrientation=${detectedOrientation ?? 'n/a'}`,
  );
  return {
    family,
    documentType,
    rendererName,
    familyLayoutProfile,
    familyCapabilities,
    familyClientFacingCapability,
    implementationMatrixRow,
    surfaceRequirement,
  };
}

function stripMarkdownFences(raw: string): string {
  return raw
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

type JsonParseAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function getJsonParseAttemptError<T>(attempt: JsonParseAttempt<T>): string {
  if ('error' in attempt && typeof attempt.error === 'string') {
    return attempt.error;
  }
  return 'unknown_parse_error';
}

const STRICT_JSON_RETRY_INSTRUCTION = `
Return STRICT JSON ONLY.
Do not write any introductory sentence.
Do not explain anything.
Do not use markdown.
Do not wrap JSON in code fences.
Do not write text before or after the JSON object.
If you cannot comply, return exactly: {"error":"invalid_output"}
`.trim();

function withStrictJsonRetryInstruction(basePrompt: string): string {
  return `${basePrompt}\n\n${STRICT_JSON_RETRY_INSTRUCTION}`;
}

function tryParseStrictJsonObject<T>(raw: string): JsonParseAttempt<T> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return {
      ok: false,
      error:
        'Output is not a pure JSON object (missing opening/closing object delimiters at boundaries).',
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        ok: false,
        error: 'Output parsed but top-level value is not a JSON object.',
      };
    }
    return { ok: true, value: parsed as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function extractFirstJsonObjectCandidate(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      continue;
    }

    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1).trim();
      }
    }
  }

  return null;
}

function tryRepairStructuredJsonObject<T>(raw: string): JsonParseAttempt<T> {
  const candidates = [
    stripMarkdownFences(raw),
    extractFirstJsonObjectCandidate(raw),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  const uniqueCandidates = Array.from(new Set(candidates));
  for (const candidate of uniqueCandidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        continue;
      }
      return { ok: true, value: parsed as T };
    } catch {
      continue;
    }
  }

  return {
    ok: false,
    error:
      'JSON repair could not recover a valid top-level JSON object from model output.',
  };
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
  documentType: DocumentType,
  reason: string,
): string {
  return `Structured rendering failed for "${documentType}". Legacy/plain fallback is blocked for client-facing translated output. ${reason}`;
}

export function formatStructuredRenderingFailureMessage(
  documentType: DocumentType,
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

export async function renderStructuredFamilyDocument(
  input: StructuredFamilyRenderInput,
): Promise<StructuredRenderOutput> {
  const expectedFamily = getDocumentFamilyForType(input.documentType);
  if (expectedFamily !== input.family) {
    throw new StructuredRenderingRequiredError(
      input.documentType,
      `Family mismatch: render request declared "${input.family}" but document type "${input.documentType}" belongs to "${expectedFamily}". Client-facing translated output is blocked.`,
    );
  }

  const capabilities = getFamilyRenderCapabilities(input.family);
  if (!capabilities.structuredRendererImplemented) {
    throw new StructuredRenderingRequiredError(
      input.documentType,
      `Missing structured renderer for document family "${input.family}". Client-facing translated output is blocked.`,
    );
  }

  return renderSupportedStructuredDocument(input);
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

function isInvalidOutputSentinel(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return value.error === 'invalid_output';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExpectedDocumentTypeTag(
  expectedType: SupportedStructuredDocumentType,
  parsed: unknown,
): void {
  if (!isPlainObject(parsed)) {
    throw new StructuredRenderingRequiredError(
      expectedType,
      buildStructuredFailureMessage(
        expectedType,
        'Structured payload is not a valid JSON object.',
      ),
    );
  }

  const actual = parsed.document_type;
  if (typeof actual !== 'string') {
    throw new StructuredRenderingRequiredError(
      expectedType,
      buildStructuredFailureMessage(
        expectedType,
        'Structured payload missing required "document_type" discriminator.',
      ),
    );
  }

  if (actual !== expectedType) {
    throw new StructuredRenderingRequiredError(
      expectedType,
      buildStructuredFailureMessage(
        expectedType,
        `Structured payload discriminator mismatch: expected "${expectedType}" but got "${actual}".`,
      ),
    );
  }
}

const BIRTH_FORBIDDEN_MARRIAGE_KEYS = new Set([
  'spouse_1',
  'spouse_2',
  'spouse_1_current',
  'spouse_2_current',
  'property_regime',
  'celebration_date',
]);

function collectForbiddenKeyPaths(
  value: unknown,
  forbiddenKeys: ReadonlySet<string>,
  path = 'root',
): string[] {
  if (Array.isArray(value)) {
    const paths: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      paths.push(...collectForbiddenKeyPaths(value[i], forbiddenKeys, `${path}[${i}]`));
    }
    return paths;
  }

  if (!isPlainObject(value)) {
    return [];
  }

  const paths: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    const keyPath = `${path}.${key}`;
    if (forbiddenKeys.has(key)) {
      paths.push(keyPath);
    }
    paths.push(...collectForbiddenKeyPaths(nested, forbiddenKeys, keyPath));
  }
  return paths;
}

function assertBirthPayloadCompliance(parsed: unknown): void {
  assertExpectedDocumentTypeTag('birth_certificate_brazil', parsed);

  if (!isPlainObject(parsed)) return;

  const forbiddenPaths = collectForbiddenKeyPaths(parsed, BIRTH_FORBIDDEN_MARRIAGE_KEYS);
  if (forbiddenPaths.length > 0) {
    throw new StructuredRenderingRequiredError(
      'birth_certificate_brazil',
      buildStructuredFailureMessage(
        'birth_certificate_brazil',
        `Birth-certificate compliance check failed: marriage-only fields detected (${forbiddenPaths.join(', ')}).`,
      ),
    );
  }

  const requiredBirthKeys: Array<keyof Record<string, unknown>> = [
    'child_name',
    'mother',
    'father',
  ];
  const missingBirthKeys = requiredBirthKeys.filter((key) => !(key in parsed));

  if (missingBirthKeys.length > 0) {
    throw new StructuredRenderingRequiredError(
      'birth_certificate_brazil',
      buildStructuredFailureMessage(
        'birth_certificate_brazil',
        `Birth-certificate compliance check failed: missing required birth fields (${missingBirthKeys.join(', ')}).`,
      ),
    );
  }
}

type BirthRendererZoneId =
  | 'z_document_header'
  | 'z_document_title'
  | 'z_child_identity'
  | 'z_mother_identity'
  | 'z_father_identity'
  | 'z_registration_block'
  | 'z_annotations_endorsements'
  | 'z_certification_block'
  | 'z_registry_office_contact'
  | 'z_validation_block';

interface BirthRendererZoneDefinition {
  zoneId: BirthRendererZoneId;
  requiredPaths: string[];
  translatablePaths: string[];
}

const BIRTH_RENDERER_ZONE_DEFINITIONS: BirthRendererZoneDefinition[] = [
  {
    zoneId: 'z_document_header',
    requiredPaths: [
      'country_header',
      'registry_office_header',
      'registration_number',
    ],
    translatablePaths: [
      'country_header',
      'registry_office_header',
    ],
  },
  {
    zoneId: 'z_document_title',
    requiredPaths: ['certificate_title'],
    translatablePaths: ['certificate_title'],
  },
  {
    zoneId: 'z_child_identity',
    requiredPaths: [
      'child_name',
      'date_of_birth',
      'time_of_birth',
      'place_of_birth',
      'gender',
      'nationality',
    ],
    translatablePaths: [
      'date_of_birth',
      'gender',
      'nationality',
    ],
  },
  {
    zoneId: 'z_mother_identity',
    requiredPaths: [
      'mother.name',
      'mother.nationality',
      'mother.date_of_birth',
      'mother.cpf',
      'mother.parents',
    ],
    translatablePaths: [
      'mother.nationality',
      'mother.date_of_birth',
    ],
  },
  {
    zoneId: 'z_father_identity',
    requiredPaths: [
      'father.name',
      'father.nationality',
      'father.date_of_birth',
      'father.cpf',
      'father.parents',
    ],
    translatablePaths: [
      'father.nationality',
      'father.date_of_birth',
    ],
  },
  {
    zoneId: 'z_registration_block',
    requiredPaths: [
      'declarant_name',
      'declarant_relationship',
      'registration_date',
    ],
    translatablePaths: [
      'declarant_relationship',
      'registration_date',
    ],
  },
  {
    zoneId: 'z_annotations_endorsements',
    requiredPaths: [
      'annotations_endorsements.text',
      'voluntary_registry_annotations',
    ],
    translatablePaths: [
      'annotations_endorsements.text',
      'voluntary_registry_annotations',
    ],
  },
  {
    zoneId: 'z_certification_block',
    requiredPaths: [
      'certification.attestation',
      'certification.date_location',
      'certification.digital_seal',
      'certification.amount_charged',
      'certification.qr_notice',
      'certification.electronic_signature',
    ],
    translatablePaths: [
      'certification.attestation',
      'certification.date_location',
      'certification.amount_charged',
      'certification.qr_notice',
      'certification.electronic_signature',
    ],
  },
  {
    zoneId: 'z_registry_office_contact',
    requiredPaths: [
      'officer_contact.cns_number',
      'officer_contact.officer_role',
      'officer_contact.location',
      'officer_contact.officer_name',
      'officer_contact.address',
      'officer_contact.cep',
      'officer_contact.phone',
      'officer_contact.email',
    ],
    translatablePaths: [
      'officer_contact.officer_role',
      'officer_contact.location',
      'officer_contact.address',
    ],
  },
  {
    zoneId: 'z_validation_block',
    requiredPaths: [
      'validation.cns_clerk_reference',
      'validation.validation_url',
      'validation.validation_code',
    ],
    translatablePaths: [
      'validation.cns_clerk_reference',
    ],
  },
];

function normalizeAsciiToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getObjectPathValue(value: unknown, path: string): unknown {
  const segments = path.split('.');
  let cursor: unknown = value;
  for (const segment of segments) {
    if (!isPlainObject(cursor) || !(segment in cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function hasObjectPath(value: unknown, path: string): boolean {
  return getObjectPathValue(value, path) !== undefined;
}

function collectStringValuesAtPaths(
  payload: unknown,
  paths: string[],
): string[] {
  const collected: string[] = [];
  for (const path of paths) {
    collectStringSegments(getObjectPathValue(payload, path), collected);
  }
  return collected
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
}

function mapBirthGenericZoneIdToSemanticZone(
  zoneIdRaw: string,
  zoneTypeRaw: string,
  contentRaw: string,
): BirthRendererZoneId | null {
  const signal = normalizeAsciiToken(`${zoneIdRaw} ${zoneTypeRaw} ${contentRaw}`);

  if (/(^| )z?0?1($| )|header|logo|country|registry office|cartorio/.test(signal)) {
    return 'z_document_header';
  }
  if (/(^| )z?0?2($| )|title|certificate title|certidao de nascimento|birth certificate/.test(signal)) {
    return 'z_document_title';
  }
  if (/(^| )z?0?3($| )|child|newborn|registered person|date of birth|place of birth/.test(signal)) {
    return 'z_child_identity';
  }
  if (/(^| )z?0?4($| )|mother|mae|mãe|maternal/.test(signal)) {
    return 'z_mother_identity';
  }
  if (/(^| )z?0?5($| )|father|pai|paternal/.test(signal)) {
    return 'z_father_identity';
  }
  if (/(^| )z?0?6($| )|declarant|registration date|registered on/.test(signal)) {
    return 'z_registration_block';
  }
  if (/(^| )z?0?7($| )|annotation|endorsement|averbacao|averba[çc][aã]o/.test(signal)) {
    return 'z_annotations_endorsements';
  }
  if (/(^| )z?0?8($| )|certification|attestation|digital seal|amount charged/.test(signal)) {
    return 'z_certification_block';
  }
  if (/(^| )z?0?9($| )|officer|registry office contact|cns number|address/.test(signal)) {
    return 'z_registry_office_contact';
  }
  if (/z?1?0($| )|validation|validation code|validation url/.test(signal)) {
    return 'z_validation_block';
  }

  return null;
}

function collectBirthGenericSemanticZones(payload: unknown): string[] {
  if (!isPlainObject(payload)) return [];

  const rootEntries: unknown[] = Array.isArray(payload.TRANSLATED_CONTENT_BY_ZONE)
    ? payload.TRANSLATED_CONTENT_BY_ZONE
    : [];
  const pageEntries: unknown[] = Array.isArray(payload.PAGES)
    ? payload.PAGES.flatMap((page) => {
        if (!isPlainObject(page)) return [];
        return Array.isArray(page.TRANSLATED_CONTENT_BY_ZONE)
          ? page.TRANSLATED_CONTENT_BY_ZONE
          : [];
      })
    : [];

  const mapped = new Set<string>();
  const candidates = [...rootEntries, ...pageEntries];
  for (const candidate of candidates) {
    if (!isPlainObject(candidate)) continue;
    const zoneIdRaw = normalizeWhitespace(
      typeof candidate.zone_id === 'string' ? candidate.zone_id : '',
    );
    const zoneTypeRaw = normalizeWhitespace(
      typeof candidate.zone_type === 'string' ? candidate.zone_type : '',
    );
    const contentRaw = normalizeWhitespace(
      typeof candidate.content === 'string'
        ? candidate.content
        : typeof candidate.text === 'string'
          ? candidate.text
          : '',
    );
    if (!zoneIdRaw && !zoneTypeRaw && !contentRaw) continue;

    const semantic = mapBirthGenericZoneIdToSemanticZone(
      zoneIdRaw,
      zoneTypeRaw,
      contentRaw,
    );
    if (semantic) mapped.add(semantic);
  }

  return Array.from(mapped);
}

function resolveLanguageIssueType(
  hasMissingTranslatedZones: boolean,
  hasSourceLanguageContamination: boolean,
): StructuredRenderLanguageIntegrity['languageIssueType'] {
  if (hasMissingTranslatedZones && hasSourceLanguageContamination) {
    return 'missing_and_source_language_mismatch';
  }
  if (hasMissingTranslatedZones) return 'missing_translated_zones';
  if (hasSourceLanguageContamination) return 'source_language_mismatch';
  return 'none';
}

const BIRTH_CERTIFICATION_WEAK_MARKERS = new Set<string>([
  'folio',
]);

const BIRTH_CERTIFICATION_ENGLISH_TRANSLATION_CUES = [
  'i certify',
  'under number',
  'book a',
  'witnesses dispensed',
  'live birth declaration',
  'authorized clerk',
  'this is what was',
  'the declarant',
  'ministry of health',
];

function shouldSuppressBirthCertificationLeakage(
  leakage: SourceLanguageLeakageResult,
  translatableSegments: string[],
): boolean {
  const normalizedMarkers = leakage.matchedMarkers.map((marker) =>
    normalizeAsciiToken(marker),
  );
  if (normalizedMarkers.length === 0) return false;
  if (
    normalizedMarkers.some(
      (marker) => !BIRTH_CERTIFICATION_WEAK_MARKERS.has(marker),
    )
  ) {
    return false;
  }

  const normalizedContent = normalizeAsciiToken(translatableSegments.join(' '));
  const englishCueHits = BIRTH_CERTIFICATION_ENGLISH_TRANSLATION_CUES.filter(
    (cue) => normalizedContent.includes(cue),
  ).length;

  if (englishCueHits < 2) return false;
  if (
    /\b(certidao|nascimento|cartorio|registro civil|livro|folha|termo|averbacao|declarante|filiacao|naturalidade)\b/.test(
      normalizedContent,
    )
  ) {
    return false;
  }

  return true;
}

function buildBirthLanguageIntegrity(
  input: StructuredRenderInput,
  payload: BirthCertificateBrazil,
): StructuredRenderLanguageIntegrity {
  const diagnostics = buildDefaultLanguageIntegrity(input);
  diagnostics.translatedPayloadFound = true;
  diagnostics.requiredZones = BIRTH_RENDERER_ZONE_DEFINITIONS.map(
    (zone) => zone.zoneId,
  );
  diagnostics.sourceZonesCount = diagnostics.requiredZones.length;

  const translatedZonesFound: string[] = [];
  const missingTranslatedZones: string[] = [];
  const sourceLanguageContaminatedZones: string[] = [];
  const sourceLanguageMarkers = new Set<string>();

  for (const zone of BIRTH_RENDERER_ZONE_DEFINITIONS) {
    const zonePresent = zone.requiredPaths.every((path) => hasObjectPath(payload, path));
    if (!zonePresent) {
      missingTranslatedZones.push(zone.zoneId);
      continue;
    }

    translatedZonesFound.push(zone.zoneId);
    const translatableSegments = collectStringValuesAtPaths(
      payload,
      zone.translatablePaths,
    );
    if (translatableSegments.length === 0) continue;

    const leakage = detectSourceLanguageLeakageFromSegments(
      translatableSegments,
      {
        sourceLanguage: diagnostics.sourceLanguage,
        targetLanguage: diagnostics.targetLanguage,
      },
    );
    if (!leakage.detected) continue;
    if (
      zone.zoneId === 'z_certification_block' &&
      shouldSuppressBirthCertificationLeakage(leakage, translatableSegments)
    ) {
      continue;
    }

    sourceLanguageContaminatedZones.push(zone.zoneId);
    for (const marker of leakage.matchedMarkers) {
      sourceLanguageMarkers.add(`${zone.zoneId}:${marker}`);
    }
  }

  diagnostics.translatedZonesFound = translatedZonesFound;
  diagnostics.translatedZonesCount = translatedZonesFound.length;
  diagnostics.missingTranslatedZones = missingTranslatedZones;
  diagnostics.sourceLanguageContaminatedZones = sourceLanguageContaminatedZones;
  diagnostics.sourceLanguageMarkers = Array.from(sourceLanguageMarkers);
  diagnostics.sourceContentAttempted =
    missingTranslatedZones.length > 0 ||
    sourceLanguageContaminatedZones.length > 0;
  diagnostics.languageIssueType = resolveLanguageIssueType(
    missingTranslatedZones.length > 0,
    sourceLanguageContaminatedZones.length > 0,
  );
  diagnostics.mappedGenericZones = collectBirthGenericSemanticZones(payload);

  return diagnostics;
}

function assertMarriagePayloadCompliance(parsed: unknown): void {
  assertExpectedDocumentTypeTag('marriage_certificate_brazil', parsed);

  if (!isPlainObject(parsed)) return;

  const requiredMarriageKeys: Array<keyof Record<string, unknown>> = [
    'spouse_1',
    'spouse_2',
    'property_regime',
    'celebration_date',
  ];
  const missingMarriageKeys = requiredMarriageKeys.filter((key) => !(key in parsed));

  if (missingMarriageKeys.length > 0) {
    throw new StructuredRenderingRequiredError(
      'marriage_certificate_brazil',
      buildStructuredFailureMessage(
        'marriage_certificate_brazil',
        `Marriage-certificate compliance check failed: missing required marriage fields (${missingMarriageKeys.join(', ')}).`,
      ),
    );
  }
}

const CIVIL_COMPACT_SUBTYPES = new Set<CivilRecordSubtype>([
  'birth_certificate_full_content_compact',
  'civil_registry_full_text_single_page',
  'birth_certificate_boxed_single_page',
  'annotated_civil_record',
]);

function isCivilRecordGeneralZoneBlueprint(
  parsed: unknown,
): parsed is CivilRecordGeneralZoneBlueprint {
  if (!isPlainObject(parsed)) return false;
  if (parsed.document_type !== 'civil_record_general') return false;
  return Array.isArray(parsed.PAGES);
}

function collectCivilZoneBlueprintText(payload: CivilRecordGeneralZoneBlueprint): string {
  const parts: string[] = [];
  parts.push(payload.document_subtype ?? '');
  parts.push(payload.document_style ?? '');
  for (const page of payload.PAGES ?? []) {
    parts.push(page.PAGE_METADATA?.detected_document_type ?? '');
    for (const zone of page.LAYOUT_ZONES ?? []) {
      parts.push(zone.zone_id ?? '');
      parts.push(zone.zone_type ?? '');
    }
    for (const content of page.TRANSLATED_CONTENT_BY_ZONE ?? []) {
      parts.push(content.content ?? '');
    }
  }
  return parts.join(' ').toLowerCase();
}

function inferCompactCivilSubtype(payload: CivilRecordGeneralZoneBlueprint): CivilRecordSubtype {
  if (CIVIL_COMPACT_SUBTYPES.has(payload.document_subtype)) {
    return payload.document_subtype;
  }

  const text = collectCivilZoneBlueprintText(payload);

  if (/\bbirth\b|\bnascimento\b|\bcertidao de nascimento\b/.test(text)) {
    const hasBoxedSignal = /\bbox(ed|section)?\b|boxed_sections|compact-grid|compact_grid/.test(text);
    return hasBoxedSignal
      ? 'birth_certificate_boxed_single_page'
      : 'birth_certificate_full_content_compact';
  }

  if (/\bannotation\b|\baverba[cç][aã]o\b|\bmarginal\b|\bmargin note\b/.test(text)) {
    return 'annotated_civil_record';
  }

  return 'civil_registry_full_text_single_page';
}

function normalizeCivilCompactZonePayload(
  payload: CivilRecordGeneralZoneBlueprint,
): CivilRecordGeneralZoneBlueprint {
  const normalizedSubtype = inferCompactCivilSubtype(payload);
  return {
    ...payload,
    blueprint_profile:
      payload.blueprint_profile && payload.blueprint_profile !== 'unknown'
        ? payload.blueprint_profile
        : 'compact_civil_single_page',
    document_subtype: normalizedSubtype,
  };
}

function inferCivilZoneOrientation(
  payload: CivilRecordGeneralZoneBlueprint,
): DocumentOrientation {
  if (payload.orientation === 'landscape') return 'landscape';
  const pageHint = payload.PAGES?.[0]?.PAGE_METADATA?.suggested_orientation;
  return pageHint === 'landscape' ? 'landscape' : 'portrait';
}

function resolveTargetLanguage(input: StructuredRenderInput): string {
  const normalized = normalizeLanguageCode(input.targetLanguage ?? 'EN');
  return normalized === 'EN' ? 'EN' : (input.targetLanguage ?? 'EN').toUpperCase();
}

function resolveSourceLanguage(input: StructuredRenderInput): string {
  return resolveSourceLanguageForStructuredContext({
    sourceLanguage: input.sourceLanguage,
    documentType: input.documentType,
    originalFileUrl: input.originalFileUrl,
  });
}

function buildDefaultLanguageIntegrity(
  input: StructuredRenderInput,
): StructuredRenderLanguageIntegrity {
  return {
    targetLanguage: resolveTargetLanguage(input),
    sourceLanguage: resolveSourceLanguage(input),
    translatedPayloadFound: false,
    translatedZonesCount: null,
    sourceZonesCount: null,
    missingTranslatedZones: [],
    sourceContentAttempted: false,
    sourceLanguageMarkers: [],
    requiredZones: [],
    translatedZonesFound: [],
    sourceLanguageContaminatedZones: [],
    mappedGenericZones: [],
    languageIssueType: 'none',
  };
}

function normalizeWhitespace(value: string | undefined | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function collectStringSegments(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) out.push(trimmed);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStringSegments(item, out);
    return out;
  }

  if (!isPlainObject(value)) {
    return out;
  }

  for (const nested of Object.values(value)) {
    collectStringSegments(nested, out);
  }
  return out;
}

// ── Diploma payload language integrity ───────────────────────────────────────
//
// Diploma documents, by USCIS certified-translation policy, preserve proper
// nouns in their source language: institution names, person names, location
// names, registration number values. These fields are EXCLUDED from leakage
// detection entirely.
//
// Only "body text" fields that must be translated to English are scanned:
// conferral statement, degree title, program/course, supplementary notes,
// document label, registration number labels, signatory roles, and visual
// element descriptions.
//
// Within scanned body text, leakage caused by embedded institution name
// references or proper-noun diacritics inside an otherwise-English conferral
// statement is suppressed when at least one clear English conferral cue is
// present in the suspicious segment. Fatal leakage (e.g. untranslated main
// body clauses using civil-record vocabulary) always throws.

/** Body text fields of AcademicDiplomaCertificate that must be in English. */
const DIPLOMA_BODY_FIELD_KEYS: ReadonlyArray<keyof AcademicDiplomaCertificate> = [
  'conferral_statement',
  'degree_title',
  'program_or_course',
  'supplementary_notes',
  'document_label',
  'diploma_title',
];

/**
 * English words/phrases that prove a body segment was intentionally translated.
 * At least one must be present in a suspicious segment for leakage suppression
 * to apply (demonstrating the field IS in English with retained proper nouns).
 */
const DIPLOMA_ENGLISH_CONFERRAL_CUES = [
  'confers upon',
  'hereby grants',
  'the degree of',
  'academic degree',
  'bachelor',
  'master',
  'doctorate',
  'technologist',
  'rector',
  'dean',
  'having taken',
  'pursuant to',
  'in the exercise',
  'in the use of',
  'by law',
  'law no',
  'hereby conferred',
  'fulfillment of',
  'diploma number',
] as const;

/**
 * Source-language markers that are always fatal for diploma body text — these
 * indicate structurally untranslated content using civil-registry or civil-
 * record vocabulary that must never appear in a properly translated diploma.
 * Strong institutional phrases (e.g. "republica federativa do brasil") are NOT
 * listed here because they can legitimately appear in translated authority
 * references; they are handled by the English-cue suppression check instead.
 */
const DIPLOMA_FATAL_BODY_MARKERS = new Set([
  'certidao de nascimento',
  'certidao de casamento',
  'registro civil das pessoas naturais',
  'acta de nacimiento',
  'oficial del registro civil',
  'certidao',
  'nascimento',
  'casamento',
  'cartorio',
  'averbacao',
  'declarante',
  'naturalidade',
  'filiacao',
  'assento',
  'registrado sob',
  'nome do registrado',
  'emitida em',
  'oficial de registro',
  'acta',
  'inscrito',
  'nacimiento',
  'matrimonio',
  'expedida',
  'numero de acta',
]);

/**
 * Collects labelled body segments from a diploma payload — only fields that
 * must be in English. Proper noun fields (institution name, person name,
 * location, dates, registration values, stamp text) are excluded from the
 * returned set so they never contribute to leakage detection.
 */
function collectDiplomaBodySegments(
  parsed: AcademicDiplomaCertificate,
): Array<{ field: string; value: string }> {
  const out: Array<{ field: string; value: string }> = [];

  for (const key of DIPLOMA_BODY_FIELD_KEYS) {
    const val = parsed[key];
    if (typeof val === 'string' && val.trim()) {
      out.push({ field: key as string, value: val.trim() });
    }
  }

  // registration_numbers: label must be English; value is a numeric code → excluded
  for (const rn of parsed.registration_numbers ?? []) {
    if (typeof rn.label === 'string' && rn.label.trim()) {
      out.push({ field: 'registration_numbers.label', value: rn.label.trim() });
    }
  }

  // signatories: role must be English; name and institution are proper nouns → excluded
  for (const sig of parsed.signatories ?? []) {
    if (typeof sig.role === 'string' && sig.role.trim()) {
      out.push({ field: 'signatories.role', value: sig.role.trim() });
    }
  }

  // visual_elements: description must be English; text inside stamp/seal may
  // be source-language text (official marks are preserved by policy) → text excluded
  for (const el of parsed.visual_elements ?? []) {
    if (typeof el.description === 'string' && el.description.trim()) {
      out.push({ field: 'visual_elements.description', value: el.description.trim() });
    }
  }

  return out;
}

/**
 * Returns true when leakage detected in a diploma body field should be treated
 * as acceptable retained content (embedded institution name / proper noun in an
 * otherwise-English translated text) rather than a fatal translation failure.
 *
 * Suppression requires:
 *   1. No diploma-fatal civil-record marker is present.
 *   2. Every suspicious segment contains at least one English conferral cue
 *      proving the field IS translated.
 *
 * degree_title and program_or_course are never suppressed — the degree name and
 * program must always be rendered in English.
 */
function shouldSuppressDiplomaBodyLeakage(
  leakage: SourceLanguageLeakageResult,
  fieldName: string,
): boolean {
  if (fieldName === 'degree_title' || fieldName === 'program_or_course') {
    return false;
  }

  const normalizedMatched = leakage.matchedMarkers.map((m) => normalizeAsciiToken(m));
  const hasFatalMarker = normalizedMatched.some((m) => DIPLOMA_FATAL_BODY_MARKERS.has(m));
  if (hasFatalMarker) return false;

  for (const seg of leakage.suspiciousSegments) {
    const lower = normalizeAsciiToken(seg);
    const hasCue = DIPLOMA_ENGLISH_CONFERRAL_CUES.some((cue) => lower.includes(cue));
    if (!hasCue) return false;
  }

  return true;
}

/**
 * Diploma-specific payload language integrity check.
 *
 * Replaces the generic assertPayloadLanguageIntegrity for academic_diploma_certificate.
 * Key differences from the generic check:
 *   - Only body text fields are scanned (DIPLOMA_BODY_FIELD_KEYS + sub-labels).
 *   - Proper noun fields (issuing_institution, institution_subheading, recipient_name,
 *     location, dates, registration values, signatories.name/institution, stamp text)
 *     are excluded from scanning per USCIS policy.
 *   - Suppression applies when leakage traces to embedded proper nouns inside an
 *     otherwise-English conferral statement (institution name reference).
 *   - Fatal leakage (genuinely untranslated body text with civil-record vocabulary)
 *     still throws immediately.
 *   - Per-field diagnostics are logged for observability.
 */
function assertDiplomaPayloadLanguageIntegrity(
  input: StructuredRenderInput,
  parsed: AcademicDiplomaCertificate,
  diagnostics: StructuredRenderLanguageIntegrity,
): void {
  const targetLanguage = resolveTargetLanguage(input);
  if (normalizeLanguageCode(targetLanguage) !== 'EN') return;

  const sourceLanguage = resolveSourceLanguage(input);
  const labelledSegments = collectDiplomaBodySegments(parsed);

  const properNounSample = [
    parsed.issuing_institution,
    parsed.recipient_name,
    parsed.location,
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0).slice(0, 3);

  console.log(
    `${input.logPrefix} [diploma-integrity] scanning body fields: ` +
    `body_fields=${labelledSegments.length} ` +
    `proper_noun_fields_excluded=[${properNounSample.map((v) => `"${v.slice(0, 28)}"`).join('; ')}] ` +
    `source_lang=${sourceLanguage}`,
  );

  const allFatalMarkers = new Set<string>();
  const suppressedFields: string[] = [];
  const fatalFields: string[] = [];

  for (const { field, value } of labelledSegments) {
    const leakage = detectSourceLanguageLeakageFromSegments([value], {
      sourceLanguage,
      targetLanguage,
    });

    if (!leakage.detected) continue;

    if (shouldSuppressDiplomaBodyLeakage(leakage, field)) {
      suppressedFields.push(`${field}:${leakage.matchedMarkers.join(',')}`);
      console.log(
        `${input.logPrefix} [diploma-integrity] suppressed leakage in "${field}": ` +
        `markers=[${leakage.matchedMarkers.join(', ')}] — ` +
        `treated as retained proper noun / institutional name reference`,
      );
      continue;
    }

    fatalFields.push(field);
    leakage.matchedMarkers.forEach((m) => allFatalMarkers.add(m));
    console.warn(
      `${input.logPrefix} [diploma-integrity] fatal leakage in "${field}": ` +
      `markers=[${leakage.matchedMarkers.join(', ')}] ` +
      `suspicious_segments=${leakage.suspiciousSegments.length}`,
    );
  }

  diagnostics.sourceLanguageMarkers = [
    ...Array.from(allFatalMarkers),
    ...suppressedFields.map((f) => `[suppressed]${f}`),
  ];
  diagnostics.sourceContentAttempted =
    fatalFields.length > 0 || suppressedFields.length > 0;

  if (fatalFields.length > 0) {
    diagnostics.sourceLanguageContaminatedZones = fatalFields;
    diagnostics.languageIssueType = 'source_language_mismatch';
    throw new StructuredRenderingRequiredError(
      input.documentType,
      buildStructuredFailureMessage(
        input.documentType,
        `Structured translated diploma blocked: untranslated body text detected in ` +
        `[${fatalFields.join(', ')}]. Conferral statement, degree title, program name, ` +
        `and supplementary notes must be in English. ` +
        `Proper nouns (institution name, recipient name, location) are excluded from validation.`,
      ),
    );
  }

  diagnostics.sourceLanguageContaminatedZones = [];
  diagnostics.languageIssueType = 'none';

  console.log(
    `${input.logPrefix} [diploma-integrity] passed — ` +
    `body_fields_clean=${labelledSegments.length - suppressedFields.length} ` +
    `suppressed_proper_noun_leakage=${suppressedFields.length}`,
  );
}

function assertPayloadLanguageIntegrity(
  input: StructuredRenderInput,
  payload: unknown,
  diagnostics: StructuredRenderLanguageIntegrity,
  payloadLabel: string,
): void {
  const targetLanguage = resolveTargetLanguage(input);
  if (normalizeLanguageCode(targetLanguage) !== 'EN') return;

  const sourceLanguage = resolveSourceLanguage(input);
  const segments = collectStringSegments(payload);
  const leakage = detectSourceLanguageLeakageFromSegments(segments, {
    sourceLanguage,
    targetLanguage,
  });

  diagnostics.sourceLanguageMarkers = leakage.matchedMarkers;
  diagnostics.sourceContentAttempted = diagnostics.sourceContentAttempted || leakage.detected;
  diagnostics.sourceLanguageContaminatedZones = leakage.detected ? ['payload'] : [];
  diagnostics.languageIssueType = leakage.detected
    ? 'source_language_mismatch'
    : 'none';

  if (!leakage.detected) return;

  throw new StructuredRenderingRequiredError(
    input.documentType,
    buildStructuredFailureMessage(
      input.documentType,
      `Structured translated ${payloadLabel} blocked: translated zone content missing or source-language content detected in translated client-facing surface.`,
    ),
  );
}

function normalizeZoneBindingId(value: string | undefined | null): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isGenericCivilZoneId(value: string): boolean {
  return /^z?_?\d{1,3}$/.test(value);
}

interface CompactCivilZoneBindingResolution {
  requiredZones: string[];
  translatedZonesFound: string[];
  missingTranslatedZones: string[];
  mappedGenericZones: string[];
  resolvedZoneContents: Array<{ zoneLabel: string; content: string }>;
  allTranslatedSegments: string[];
}

function resolveCompactCivilZoneBindings(
  payload: CivilRecordGeneralZoneBlueprint,
): CompactCivilZoneBindingResolution {
  const requiredZones: string[] = [];
  const translatedZonesFound: string[] = [];
  const missingTranslatedZones: string[] = [];
  const mappedGenericZones: string[] = [];
  const resolvedZoneContent = new Map<string, string>();
  const allTranslatedSegments: string[] = [];

  for (const page of payload.PAGES ?? []) {
    const pageNumber = page.PAGE_METADATA?.page_number ?? '?';
    const layoutZones = (page.LAYOUT_ZONES ?? [])
      .map((zone, index) => {
        const originalId = normalizeWhitespace(zone.zone_id);
        const normalizedId = normalizeZoneBindingId(zone.zone_id);
        if (!originalId || !normalizedId) return null;
        return {
          index,
          originalId,
          normalizedId,
          label: `page_${pageNumber}:${originalId}`,
        };
      })
      .filter((zone): zone is {
        index: number;
        originalId: string;
        normalizedId: string;
        label: string;
      } => zone !== null);

    const translatedEntries = (page.TRANSLATED_CONTENT_BY_ZONE ?? [])
      .map((entry, index) => {
        const originalId = normalizeWhitespace(entry.zone_id);
        const normalizedId = normalizeZoneBindingId(entry.zone_id);
        const content = normalizeWhitespace(entry.content);
        if (!originalId || !normalizedId || !content) return null;
        return { index, originalId, normalizedId, content };
      })
      .filter((entry): entry is {
        index: number;
        originalId: string;
        normalizedId: string;
        content: string;
      } => entry !== null);

    for (const entry of translatedEntries) {
      allTranslatedSegments.push(entry.content);
    }

    requiredZones.push(...layoutZones.map((zone) => zone.label));

    const layoutByNormalizedId = new Map<string, number[]>();
    for (const zone of layoutZones) {
      const existing = layoutByNormalizedId.get(zone.normalizedId) ?? [];
      existing.push(zone.index);
      layoutByNormalizedId.set(zone.normalizedId, existing);
    }

    const consumedTranslatedIndexes = new Set<number>();
    const consumedLayoutIndexes = new Set<number>();

    const assign = (
      layoutIndex: number,
      translatedIndex: number,
      mappedGenericSource?: string,
    ): void => {
      const layoutZone = layoutZones.find((zone) => zone.index === layoutIndex);
      const translatedEntry = translatedEntries.find(
        (entry) => entry.index === translatedIndex,
      );
      if (!layoutZone || !translatedEntry) return;

      consumedLayoutIndexes.add(layoutZone.index);
      consumedTranslatedIndexes.add(translatedEntry.index);
      translatedZonesFound.push(layoutZone.label);
      const existing = resolvedZoneContent.get(layoutZone.label) ?? '';
      resolvedZoneContent.set(
        layoutZone.label,
        existing ? `${existing}\n${translatedEntry.content}` : translatedEntry.content,
      );

      if (mappedGenericSource) {
        mappedGenericZones.push(
          `page_${pageNumber}:${mappedGenericSource}->${layoutZone.originalId}`,
        );
      }
    };

    for (const entry of translatedEntries) {
      const candidates = layoutByNormalizedId.get(entry.normalizedId) ?? [];
      const availableLayout = candidates.find(
        (candidateIndex) => !consumedLayoutIndexes.has(candidateIndex),
      );
      if (availableLayout === undefined) continue;
      assign(availableLayout, entry.index);
    }

    const unmatchedLayout = layoutZones.filter(
      (zone) => !consumedLayoutIndexes.has(zone.index),
    );
    const unmatchedGenericTranslated = translatedEntries.filter(
      (entry) =>
        !consumedTranslatedIndexes.has(entry.index) &&
        isGenericCivilZoneId(entry.normalizedId),
    );

    const fallbackMappings = Math.min(
      unmatchedLayout.length,
      unmatchedGenericTranslated.length,
    );
    for (let i = 0; i < fallbackMappings; i += 1) {
      const zone = unmatchedLayout[i];
      const entry = unmatchedGenericTranslated[i];
      assign(zone.index, entry.index, entry.originalId);
    }

    for (const zone of layoutZones) {
      if (!consumedLayoutIndexes.has(zone.index)) {
        missingTranslatedZones.push(zone.label);
      }
    }
  }

  return {
    requiredZones,
    translatedZonesFound: Array.from(new Set(translatedZonesFound)),
    missingTranslatedZones,
    mappedGenericZones,
    resolvedZoneContents: Array.from(resolvedZoneContent.entries()).map(
      ([zoneLabel, content]) => ({ zoneLabel, content }),
    ),
    allTranslatedSegments,
  };
}

function buildCompactCivilLanguageIntegrity(
  input: StructuredRenderInput,
  payload: CivilRecordGeneralZoneBlueprint,
): StructuredRenderLanguageIntegrity {
  const diagnostics = buildDefaultLanguageIntegrity(input);
  const resolvedBindings = resolveCompactCivilZoneBindings(payload);
  diagnostics.translatedPayloadFound = true;
  diagnostics.requiredZones = resolvedBindings.requiredZones;
  diagnostics.sourceZonesCount = resolvedBindings.requiredZones.length;
  diagnostics.translatedZonesFound = resolvedBindings.translatedZonesFound;
  diagnostics.translatedZonesCount = resolvedBindings.translatedZonesFound.length;
  diagnostics.missingTranslatedZones = resolvedBindings.missingTranslatedZones;
  diagnostics.mappedGenericZones = resolvedBindings.mappedGenericZones;
  diagnostics.sourceContentAttempted = diagnostics.missingTranslatedZones.length > 0;

  const sourceLanguageContaminatedZones: string[] = [];
  const sourceLanguageMarkers = new Set<string>();
  for (const resolvedZone of resolvedBindings.resolvedZoneContents) {
    const zoneLeakage = detectSourceLanguageLeakageFromSegments(
      [resolvedZone.content],
      {
        sourceLanguage: diagnostics.sourceLanguage,
        targetLanguage: diagnostics.targetLanguage,
      },
    );
    if (!zoneLeakage.detected) continue;
    sourceLanguageContaminatedZones.push(resolvedZone.zoneLabel);
    for (const marker of zoneLeakage.matchedMarkers) {
      sourceLanguageMarkers.add(`${resolvedZone.zoneLabel}:${marker}`);
    }
  }

  const globalLeakage = detectSourceLanguageLeakageFromSegments(
    resolvedBindings.allTranslatedSegments,
    {
      sourceLanguage: diagnostics.sourceLanguage,
      targetLanguage: diagnostics.targetLanguage,
    },
  );
  for (const marker of globalLeakage.matchedMarkers) {
    sourceLanguageMarkers.add(marker);
  }
  if (
    globalLeakage.detected &&
    sourceLanguageContaminatedZones.length === 0
  ) {
    sourceLanguageContaminatedZones.push('payload');
  }

  diagnostics.sourceLanguageMarkers = Array.from(sourceLanguageMarkers);
  diagnostics.sourceLanguageContaminatedZones = sourceLanguageContaminatedZones;
  diagnostics.sourceContentAttempted =
    diagnostics.sourceContentAttempted ||
    sourceLanguageContaminatedZones.length > 0;
  diagnostics.languageIssueType = resolveLanguageIssueType(
    diagnostics.missingTranslatedZones.length > 0,
    sourceLanguageContaminatedZones.length > 0,
  );

  const leakage = detectSourceLanguageLeakageFromSegments(
    resolvedBindings.allTranslatedSegments,
    {
    sourceLanguage: diagnostics.sourceLanguage,
    targetLanguage: diagnostics.targetLanguage,
    },
  );
  if (leakage.detected && diagnostics.sourceLanguageMarkers.length === 0) {
    diagnostics.sourceLanguageMarkers = leakage.matchedMarkers;
  }

  return diagnostics;
}

function isEditorialNewsStructuredPage(
  value: unknown,
): value is EditorialNewsStructuredPage {
  if (!isPlainObject(value)) return false;
  const hasLayoutZones =
    Array.isArray(value.LAYOUT_ZONES) || isPlainObject(value.LAYOUT_ZONES);
  const hasTranslatedZones =
    Array.isArray(value.TRANSLATED_CONTENT_BY_ZONE) ||
    isPlainObject(value.TRANSLATED_CONTENT_BY_ZONE);
  return isPlainObject(value.PAGE_METADATA) && hasLayoutZones && hasTranslatedZones;
}

function normalizeEditorialNewsLayoutZones(
  raw: unknown,
): EditorialNewsLayoutZone[] {
  const normalized: EditorialNewsLayoutZone[] = [];

  const pushZone = (
    zoneIdRaw: unknown,
    zoneTypeRaw: unknown,
    relativePositionRaw: unknown,
    visualStyleRaw: unknown,
    compactionPriorityRaw: unknown,
  ): void => {
    const zoneId = normalizeWhitespace(
      typeof zoneIdRaw === 'string' ? zoneIdRaw : '',
    );
    if (!zoneId) return;

    normalized.push({
      zone_id: zoneId,
      zone_type:
        normalizeWhitespace(
          typeof zoneTypeRaw === 'string' ? zoneTypeRaw : '',
        ) || 'other',
      relative_position:
        normalizeWhitespace(
          typeof relativePositionRaw === 'string' ? relativePositionRaw : '',
        ) || 'center',
      visual_style:
        normalizeWhitespace(
          typeof visualStyleRaw === 'string' ? visualStyleRaw : '',
        ) || 'other',
      compaction_priority:
        normalizeWhitespace(
          typeof compactionPriorityRaw === 'string' ? compactionPriorityRaw : '',
        ) || 'medium',
    });
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isPlainObject(entry)) continue;
      pushZone(
        typeof entry.zone_id === 'string'
          ? entry.zone_id
          : typeof entry.zoneId === 'string'
            ? entry.zoneId
            : '',
        entry.zone_type,
        entry.relative_position,
        entry.visual_style,
        entry.compaction_priority,
      );
    }
    return normalized;
  }

  if (!isPlainObject(raw)) return normalized;

  for (const [key, value] of Object.entries(raw)) {
    if (isPlainObject(value)) {
      pushZone(
        typeof value.zone_id === 'string'
          ? value.zone_id
          : typeof value.zoneId === 'string'
            ? value.zoneId
            : key,
        value.zone_type,
        value.relative_position,
        value.visual_style,
        value.compaction_priority,
      );
      continue;
    }

    pushZone(key, 'other', 'center', 'other', 'medium');
  }

  return normalized;
}

function normalizeEditorialNewsTranslatedZones(
  raw: unknown,
): EditorialNewsTranslatedZoneContent[] {
  const normalized: EditorialNewsTranslatedZoneContent[] = [];

  const pushContent = (zoneIdRaw: unknown, contentRaw: unknown): void => {
    const zoneId = normalizeWhitespace(
      typeof zoneIdRaw === 'string' ? zoneIdRaw : '',
    );
    if (!zoneId) return;
    const content = normalizeWhitespace(
      typeof contentRaw === 'string'
        ? contentRaw
        : collectStringSegments(contentRaw).join('\n'),
    );
    if (!content) return;
    normalized.push({ zone_id: zoneId, content });
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isPlainObject(entry)) continue;
      const zoneId =
        typeof entry.zone_id === 'string'
          ? entry.zone_id
          : typeof entry.zoneId === 'string'
            ? entry.zoneId
            : typeof entry.id === 'string'
              ? entry.id
              : '';
      const contentCandidate =
        typeof entry.content === 'string'
          ? entry.content
          : typeof entry.text === 'string'
            ? entry.text
            : typeof entry.translated_content === 'string'
              ? entry.translated_content
              : typeof entry.translatedText === 'string'
                ? entry.translatedText
                : typeof entry.value === 'string'
                  ? entry.value
                  : collectStringSegments(entry.content ?? entry.text ?? entry).join('\n');
      pushContent(zoneId, contentCandidate);
    }
    return normalized;
  }

  if (!isPlainObject(raw)) return normalized;

  for (const [zoneId, value] of Object.entries(raw)) {
    pushContent(zoneId, value);
  }

  return normalized;
}

function normalizeEditorialNewsStructuredPage(
  raw: unknown,
  fallbackPageNumber: number,
): EditorialNewsStructuredPage | null {
  if (!isPlainObject(raw) || !isPlainObject(raw.PAGE_METADATA)) return null;

  const metadata = raw.PAGE_METADATA;
  const pageNumber =
    typeof metadata.page_number === 'number' && Number.isFinite(metadata.page_number)
      ? metadata.page_number
      : fallbackPageNumber;
  const detectedDocumentType =
    typeof metadata.detected_document_type === 'string'
      ? metadata.detected_document_type
      : 'editorial/news page';
  const suggestedOrientation =
    metadata.suggested_orientation === 'portrait' ||
    metadata.suggested_orientation === 'landscape' ||
    metadata.suggested_orientation === 'unknown'
      ? metadata.suggested_orientation
      : 'unknown';
  const estimatedDensity =
    metadata.estimated_density === 'low' ||
    metadata.estimated_density === 'medium' ||
    metadata.estimated_density === 'high'
      ? metadata.estimated_density
      : 'medium';
  const suggestedFontStyle =
    typeof metadata.suggested_font_style === 'string'
      ? metadata.suggested_font_style
      : 'unknown';
  const suggestedModelKey =
    metadata.suggested_model_key === 'print_news_clipping' ||
    metadata.suggested_model_key === 'web_news_article' ||
    metadata.suggested_model_key === 'web_news_printview' ||
    metadata.suggested_model_key === 'editorial_article_cover_or_metadata' ||
    metadata.suggested_model_key === 'editorial_news_generic_structured'
      ? metadata.suggested_model_key
      : 'editorial_news_generic_structured';
  const suggestedFontSizes = isPlainObject(metadata.suggested_font_size_by_section)
    ? Object.fromEntries(
        Object.entries(metadata.suggested_font_size_by_section).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

  const normalizedLayoutZones = normalizeEditorialNewsLayoutZones(raw.LAYOUT_ZONES);
  const normalizedTranslatedZones = normalizeEditorialNewsTranslatedZones(
    raw.TRANSLATED_CONTENT_BY_ZONE,
  );
  const normalizedNonTextualElements = Array.isArray(raw.NON_TEXTUAL_ELEMENTS)
    ? raw.NON_TEXTUAL_ELEMENTS
        .map((entry) => normalizeWhitespace(typeof entry === 'string' ? entry : ''))
        .filter((entry): entry is string => entry.length > 0)
    : [];
  const renderingHints = isPlainObject(raw.RENDERING_HINTS)
    ? raw.RENDERING_HINTS
    : {};

  return {
    PAGE_METADATA: {
      page_number: pageNumber,
      detected_document_type: detectedDocumentType,
      suggested_family:
        typeof metadata.suggested_family === 'string'
          ? metadata.suggested_family
          : 'editorial_news_pages',
      suggested_model_key: suggestedModelKey,
      suggested_orientation: suggestedOrientation,
      estimated_density: estimatedDensity,
      suggested_font_style: suggestedFontStyle,
      suggested_font_size_by_section: suggestedFontSizes,
      is_scanned_clipping: metadata.is_scanned_clipping === true,
      has_graphic_elements: metadata.has_graphic_elements === true,
    },
    LAYOUT_ZONES: normalizedLayoutZones,
    TRANSLATED_CONTENT_BY_ZONE: normalizedTranslatedZones,
    NON_TEXTUAL_ELEMENTS: normalizedNonTextualElements,
    RENDERING_HINTS: {
      recommended_spacing_profile:
        typeof renderingHints.recommended_spacing_profile === 'string'
          ? renderingHints.recommended_spacing_profile
          : 'normal',
      recommended_line_height:
        typeof renderingHints.recommended_line_height === 'string'
          ? renderingHints.recommended_line_height
          : '1.25',
      recommended_layout_mode:
        typeof renderingHints.recommended_layout_mode === 'string'
          ? renderingHints.recommended_layout_mode
          : 'single-column editorial',
      page_parity_risk_notes:
        typeof renderingHints.page_parity_risk_notes === 'string'
          ? renderingHints.page_parity_risk_notes
          : '',
    },
  };
}

function normalizeEditorialNewsPagesPayload(
  parsed: unknown,
): EditorialNewsPages {
  if (!isPlainObject(parsed)) {
    throw new StructuredRenderingRequiredError(
      'editorial_news_pages',
      buildStructuredFailureMessage(
        'editorial_news_pages',
        'Editorial/news payload is not a valid JSON object.',
      ),
    );
  }

  const rootDocumentType = typeof parsed.document_type === 'string'
    ? parsed.document_type
    : '';
  if (rootDocumentType !== 'editorial_news_pages') {
    throw new StructuredRenderingRequiredError(
      'editorial_news_pages',
      buildStructuredFailureMessage(
        'editorial_news_pages',
        `Structured payload discriminator mismatch: expected "editorial_news_pages" but got "${rootDocumentType || 'missing'}".`,
      ),
    );
  }

  const rootTranslatedZones = normalizeEditorialNewsTranslatedZones(
    parsed.TRANSLATED_CONTENT_BY_ZONE,
  );
  const pages = Array.isArray(parsed.PAGES)
    ? parsed.PAGES
        .map((page, index) =>
          isEditorialNewsStructuredPage(page)
            ? normalizeEditorialNewsStructuredPage(page, index + 1)
            : null,
        )
        .filter((page): page is EditorialNewsStructuredPage => page !== null)
    : [];

  if (
    pages.length === 1 &&
    pages[0].TRANSLATED_CONTENT_BY_ZONE.length === 0 &&
    rootTranslatedZones.length > 0
  ) {
    pages[0] = {
      ...pages[0],
      TRANSLATED_CONTENT_BY_ZONE: rootTranslatedZones,
    };
  }

  if (pages.length > 0) {
    return {
      document_type: 'editorial_news_pages',
      family:
        parsed.family === 'editorial_news_pages' ||
        parsed.family === 'publications_media'
          ? parsed.family
          : 'editorial_news_pages',
      model_key:
        parsed.model_key === 'print_news_clipping' ||
        parsed.model_key === 'web_news_article' ||
        parsed.model_key === 'web_news_printview' ||
        parsed.model_key === 'editorial_article_cover_or_metadata' ||
        parsed.model_key === 'editorial_news_generic_structured'
          ? parsed.model_key
          : 'editorial_news_generic_structured',
      PAGES: pages,
      QUALITY_FLAGS: Array.isArray(parsed.QUALITY_FLAGS)
        ? parsed.QUALITY_FLAGS.filter((item): item is string => typeof item === 'string')
        : [],
      orientation:
        parsed.orientation === 'landscape' || parsed.orientation === 'portrait'
          ? parsed.orientation
          : 'unknown',
      page_count:
        typeof parsed.page_count === 'number' ? parsed.page_count : null,
    };
  }

  if (isEditorialNewsStructuredPage(parsed) && !Array.isArray(parsed.PAGES)) {
    const normalizedSinglePage = normalizeEditorialNewsStructuredPage(parsed, 1);
    if (!normalizedSinglePage) {
      throw new StructuredRenderingRequiredError(
        'editorial_news_pages',
        buildStructuredFailureMessage(
          'editorial_news_pages',
          'Editorial/news extraction requires PAGE_METADATA/LAYOUT_ZONES/TRANSLATED_CONTENT_BY_ZONE schema with page entries.',
        ),
      );
    }
    return {
      document_type: 'editorial_news_pages',
      family: 'editorial_news_pages',
      model_key: 'editorial_news_generic_structured',
      PAGES: [normalizedSinglePage],
      QUALITY_FLAGS: [],
      orientation: 'unknown',
      page_count: null,
    };
  }

  throw new StructuredRenderingRequiredError(
    'editorial_news_pages',
    buildStructuredFailureMessage(
      'editorial_news_pages',
      'Editorial/news extraction requires PAGE_METADATA/LAYOUT_ZONES/TRANSLATED_CONTENT_BY_ZONE schema with page entries.',
    ),
  );
}

function isEditorialNewsTextBearingZone(zone: EditorialNewsLayoutZone): boolean {
  const signal = normalizeZoneBindingId(
    `${zone.zone_type} ${zone.zone_id} ${zone.visual_style}`,
  );
  if (!signal) return true;

  const nonTextKeywords = [
    'photo',
    'image',
    'hero_image',
    'gallery',
    'figure',
    'illustration',
    'logo',
    'seal',
    'watermark',
    'icon',
    'ornament',
    'decorative',
    'border',
    'frame',
  ];
  if (nonTextKeywords.some((keyword) => signal.includes(keyword))) {
    return false;
  }

  return true;
}

function isEditorialBodyContinuationZoneCandidate(zone: {
  normalizedId: string;
  zoneType: string;
  visualStyle: string;
}): boolean {
  const idSignal = normalizeZoneBindingId(zone.normalizedId);
  const zoneTypeSignal = normalizeZoneBindingId(zone.zoneType);
  const styleSignal = normalizeZoneBindingId(zone.visualStyle);

  const idLooksLikeColumnBody =
    /^z?_?col(?:umn)?_?\d+_body$/.test(idSignal) ||
    (idSignal.includes('col') && idSignal.includes('body'));
  const paragraphLike = zoneTypeSignal.includes('paragraph');
  const multiColumnLike =
    styleSignal.includes('multi_column') || styleSignal.includes('column');

  return idLooksLikeColumnBody && paragraphLike && multiColumnLike;
}

interface EditorialNewsZoneBindingResolution {
  requiredZones: string[];
  translatedZonesFound: string[];
  missingTranslatedZones: string[];
  mappedGenericZones: string[];
  resolvedZoneContents: Array<{ zoneLabel: string; content: string }>;
  allTranslatedSegments: string[];
}

function resolveEditorialNewsZoneBindings(
  payload: EditorialNewsPages,
): EditorialNewsZoneBindingResolution {
  const requiredZones: string[] = [];
  const translatedZonesFound: string[] = [];
  const missingTranslatedZones: string[] = [];
  const mappedGenericZones: string[] = [];
  const resolvedZoneContents = new Map<string, string>();
  const allTranslatedSegments: string[] = [];

  for (const page of payload.PAGES ?? []) {
    const pageNumber = page.PAGE_METADATA?.page_number ?? '?';
    const layoutZones = (page.LAYOUT_ZONES ?? [])
      .map((zone, index) => {
        const originalId = normalizeWhitespace(zone.zone_id);
        const normalizedId = normalizeZoneBindingId(zone.zone_id);
        if (!originalId || !normalizedId) return null;
        return {
          index,
          originalId,
          normalizedId,
          label: `page_${pageNumber}:${originalId}`,
          textBearing: isEditorialNewsTextBearingZone(zone),
          zoneType: normalizeWhitespace(zone.zone_type),
          visualStyle: normalizeWhitespace(zone.visual_style),
        };
      })
      .filter((zone): zone is {
        index: number;
        originalId: string;
        normalizedId: string;
        label: string;
        textBearing: boolean;
        zoneType: string;
        visualStyle: string;
      } => zone !== null);

    const translatedEntries = (page.TRANSLATED_CONTENT_BY_ZONE ?? [])
      .map((entry, index) => {
        const originalId = normalizeWhitespace(entry.zone_id);
        const normalizedId = normalizeZoneBindingId(entry.zone_id);
        const content = normalizeWhitespace(entry.content);
        if (!originalId || !normalizedId || !content) return null;
        return { index, originalId, normalizedId, content };
      })
      .filter((entry): entry is {
        index: number;
        originalId: string;
        normalizedId: string;
        content: string;
      } => entry !== null);

    for (const entry of translatedEntries) {
      allTranslatedSegments.push(entry.content);
    }

    requiredZones.push(
      ...layoutZones
        .filter((zone) => zone.textBearing)
        .map((zone) => zone.label),
    );

    const layoutByNormalizedId = new Map<string, number[]>();
    for (const zone of layoutZones) {
      const existing = layoutByNormalizedId.get(zone.normalizedId) ?? [];
      existing.push(zone.index);
      layoutByNormalizedId.set(zone.normalizedId, existing);
    }

    const consumedTranslatedIndexes = new Set<number>();
    const consumedLayoutIndexes = new Set<number>();

    const assign = (
      layoutIndex: number,
      translatedIndex: number,
      mappedGenericSource?: string,
    ): void => {
      const layoutZone = layoutZones.find((zone) => zone.index === layoutIndex);
      const translatedEntry = translatedEntries.find(
        (entry) => entry.index === translatedIndex,
      );
      if (!layoutZone || !translatedEntry) return;

      consumedLayoutIndexes.add(layoutZone.index);
      consumedTranslatedIndexes.add(translatedEntry.index);
      if (layoutZone.textBearing) {
        translatedZonesFound.push(layoutZone.label);
      }
      const existing = resolvedZoneContents.get(layoutZone.label) ?? '';
      resolvedZoneContents.set(
        layoutZone.label,
        existing ? `${existing}\n${translatedEntry.content}` : translatedEntry.content,
      );

      if (mappedGenericSource) {
        mappedGenericZones.push(
          `page_${pageNumber}:${mappedGenericSource}->${layoutZone.originalId}`,
        );
      }
    };

    for (const entry of translatedEntries) {
      const candidates = layoutByNormalizedId.get(entry.normalizedId) ?? [];
      const availableLayout = candidates.find(
        (candidateIndex) => !consumedLayoutIndexes.has(candidateIndex),
      );
      if (availableLayout === undefined) continue;
      assign(availableLayout, entry.index);
    }

    const unmatchedLayout = layoutZones.filter(
      (zone) => !consumedLayoutIndexes.has(zone.index),
    );
    const unmatchedGenericTranslated = translatedEntries.filter(
      (entry) =>
        !consumedTranslatedIndexes.has(entry.index) &&
        isGenericCivilZoneId(entry.normalizedId),
    );

    const fallbackMappings = Math.min(
      unmatchedLayout.length,
      unmatchedGenericTranslated.length,
    );
    for (let i = 0; i < fallbackMappings; i += 1) {
      const zone = unmatchedLayout[i];
      const entry = unmatchedGenericTranslated[i];
      assign(zone.index, entry.index, entry.originalId);
    }

    const unresolvedTextBearingZones = layoutZones.filter(
      (zone) => zone.textBearing && !consumedLayoutIndexes.has(zone.index),
    );
    const unresolvedBodyContinuationZones = unresolvedTextBearingZones.filter(
      (zone) => isEditorialBodyContinuationZoneCandidate(zone),
    );
    const translatedBodyContinuationZones = layoutZones.filter(
      (zone) =>
        zone.textBearing &&
        consumedLayoutIndexes.has(zone.index) &&
        isEditorialBodyContinuationZoneCandidate(zone),
    );
    const remainingTranslatedEntries = translatedEntries.filter(
      (entry) => !consumedTranslatedIndexes.has(entry.index),
    );

    const allowBodyContinuationCarryover =
      (payload.model_key === 'print_news_clipping' ||
        payload.model_key === 'web_news_printview') &&
      unresolvedTextBearingZones.length > 0 &&
      unresolvedTextBearingZones.length === unresolvedBodyContinuationZones.length &&
      unresolvedBodyContinuationZones.length <= 1 &&
      translatedBodyContinuationZones.length >= 2 &&
      remainingTranslatedEntries.length === 0;

    if (allowBodyContinuationCarryover) {
      for (const missingZone of unresolvedBodyContinuationZones) {
        const nearestTranslatedZone = translatedBodyContinuationZones
          .slice()
          .sort(
            (a, b) =>
              Math.abs(a.index - missingZone.index) -
              Math.abs(b.index - missingZone.index),
          )[0];
        if (!nearestTranslatedZone) continue;

        const sourceContent = resolvedZoneContents.get(nearestTranslatedZone.label);
        if (!sourceContent) continue;

        consumedLayoutIndexes.add(missingZone.index);
        translatedZonesFound.push(missingZone.label);
        resolvedZoneContents.set(missingZone.label, sourceContent);
        mappedGenericZones.push(
          `page_${pageNumber}:body_continuation_carryover:${nearestTranslatedZone.originalId}->${missingZone.originalId}`,
        );
      }
    }

    for (const zone of layoutZones) {
      if (!zone.textBearing) continue;
      if (!consumedLayoutIndexes.has(zone.index)) {
        missingTranslatedZones.push(zone.label);
      }
    }
  }

  return {
    requiredZones,
    translatedZonesFound: Array.from(new Set(translatedZonesFound)),
    missingTranslatedZones,
    mappedGenericZones,
    resolvedZoneContents: Array.from(resolvedZoneContents.entries()).map(
      ([zoneLabel, content]) => ({ zoneLabel, content }),
    ),
    allTranslatedSegments,
  };
}

function inferEditorialNewsOrientation(
  payload: EditorialNewsPages,
): DocumentOrientation {
  if (payload.orientation === 'portrait' || payload.orientation === 'landscape') {
    return payload.orientation;
  }

  const pageHint = payload.PAGES?.[0]?.PAGE_METADATA?.suggested_orientation;
  if (pageHint === 'portrait' || pageHint === 'landscape') {
    return pageHint;
  }

  return 'portrait';
}

function buildEditorialNewsLanguageIntegrity(
  input: StructuredRenderInput,
  payload: EditorialNewsPages,
): StructuredRenderLanguageIntegrity {
  const diagnostics = buildDefaultLanguageIntegrity(input);
  const resolvedBindings = resolveEditorialNewsZoneBindings(payload);

  diagnostics.translatedPayloadFound = true;
  diagnostics.requiredZones = resolvedBindings.requiredZones;
  diagnostics.sourceZonesCount = resolvedBindings.requiredZones.length;
  diagnostics.translatedZonesFound = resolvedBindings.translatedZonesFound;
  diagnostics.translatedZonesCount = resolvedBindings.translatedZonesFound.length;
  diagnostics.missingTranslatedZones = resolvedBindings.missingTranslatedZones;
  diagnostics.mappedGenericZones = resolvedBindings.mappedGenericZones;
  diagnostics.sourceContentAttempted = diagnostics.missingTranslatedZones.length > 0;

  const sourceLanguageContaminatedZones: string[] = [];
  const sourceLanguageMarkers = new Set<string>();

  for (const resolvedZone of resolvedBindings.resolvedZoneContents) {
    const zoneLeakage = detectSourceLanguageLeakageFromSegments(
      [resolvedZone.content],
      {
        sourceLanguage: diagnostics.sourceLanguage,
        targetLanguage: diagnostics.targetLanguage,
      },
    );
    if (!zoneLeakage.detected) continue;
    sourceLanguageContaminatedZones.push(resolvedZone.zoneLabel);
    for (const marker of zoneLeakage.matchedMarkers) {
      sourceLanguageMarkers.add(`${resolvedZone.zoneLabel}:${marker}`);
    }
  }

  const globalLeakage = detectSourceLanguageLeakageFromSegments(
    resolvedBindings.allTranslatedSegments,
    {
      sourceLanguage: diagnostics.sourceLanguage,
      targetLanguage: diagnostics.targetLanguage,
    },
  );
  for (const marker of globalLeakage.matchedMarkers) {
    sourceLanguageMarkers.add(marker);
  }
  if (
    globalLeakage.detected &&
    sourceLanguageContaminatedZones.length === 0
  ) {
    sourceLanguageContaminatedZones.push('payload');
  }

  diagnostics.sourceLanguageMarkers = Array.from(sourceLanguageMarkers);
  diagnostics.sourceLanguageContaminatedZones = sourceLanguageContaminatedZones;
  diagnostics.sourceContentAttempted =
    diagnostics.sourceContentAttempted ||
    sourceLanguageContaminatedZones.length > 0;
  diagnostics.languageIssueType = resolveLanguageIssueType(
    diagnostics.missingTranslatedZones.length > 0,
    sourceLanguageContaminatedZones.length > 0,
  );

  return diagnostics;
}

function isLettersStatementsStructuredPage(
  value: unknown,
): value is LettersStatementsStructuredPage {
  if (!isPlainObject(value)) return false;
  const hasLayoutZones =
    Array.isArray(value.LAYOUT_ZONES) || isPlainObject(value.LAYOUT_ZONES);
  const hasTranslatedZones =
    Array.isArray(value.TRANSLATED_CONTENT_BY_ZONE) ||
    isPlainObject(value.TRANSLATED_CONTENT_BY_ZONE);
  return isPlainObject(value.PAGE_METADATA) && hasLayoutZones && hasTranslatedZones;
}

function normalizeLettersStatementsLayoutZones(
  raw: unknown,
): LettersStatementsLayoutZone[] {
  const normalized: LettersStatementsLayoutZone[] = [];

  const pushZone = (
    zoneIdRaw: unknown,
    zoneTypeRaw: unknown,
    relativePositionRaw: unknown,
    visualStyleRaw: unknown,
    compactionPriorityRaw: unknown,
  ): void => {
    const zoneId = normalizeWhitespace(
      typeof zoneIdRaw === 'string' ? zoneIdRaw : '',
    );
    if (!zoneId) return;
    normalized.push({
      zone_id: zoneId,
      zone_type:
        normalizeWhitespace(
          typeof zoneTypeRaw === 'string' ? zoneTypeRaw : '',
        ) || 'other',
      relative_position:
        normalizeWhitespace(
          typeof relativePositionRaw === 'string' ? relativePositionRaw : '',
        ) || 'center',
      visual_style:
        normalizeWhitespace(
          typeof visualStyleRaw === 'string' ? visualStyleRaw : '',
        ) || 'other',
      compaction_priority:
        normalizeWhitespace(
          typeof compactionPriorityRaw === 'string' ? compactionPriorityRaw : '',
        ) || 'medium',
    });
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isPlainObject(entry)) continue;
      pushZone(
        typeof entry.zone_id === 'string'
          ? entry.zone_id
          : typeof entry.zoneId === 'string'
            ? entry.zoneId
            : '',
        entry.zone_type,
        entry.relative_position,
        entry.visual_style,
        entry.compaction_priority,
      );
    }
    return normalized;
  }

  if (!isPlainObject(raw)) return normalized;

  for (const [key, value] of Object.entries(raw)) {
    if (isPlainObject(value)) {
      pushZone(
        typeof value.zone_id === 'string'
          ? value.zone_id
          : typeof value.zoneId === 'string'
            ? value.zoneId
            : key,
        value.zone_type,
        value.relative_position,
        value.visual_style,
        value.compaction_priority,
      );
      continue;
    }

    pushZone(key, 'other', 'center', 'other', 'medium');
  }

  return normalized;
}

function normalizeLettersStatementsTranslatedZones(
  raw: unknown,
): LettersStatementsTranslatedZoneContent[] {
  const normalized: LettersStatementsTranslatedZoneContent[] = [];

  const pushContent = (zoneIdRaw: unknown, contentRaw: unknown): void => {
    const zoneId = normalizeWhitespace(
      typeof zoneIdRaw === 'string' ? zoneIdRaw : '',
    );
    if (!zoneId) return;
    const content = normalizeWhitespace(
      typeof contentRaw === 'string'
        ? contentRaw
        : collectStringSegments(contentRaw).join('\n'),
    );
    if (!content) return;
    normalized.push({ zone_id: zoneId, content });
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isPlainObject(entry)) continue;
      const zoneId =
        typeof entry.zone_id === 'string'
          ? entry.zone_id
          : typeof entry.zoneId === 'string'
            ? entry.zoneId
            : typeof entry.id === 'string'
              ? entry.id
              : '';
      const contentCandidate =
        typeof entry.content === 'string'
          ? entry.content
          : typeof entry.text === 'string'
            ? entry.text
            : typeof entry.translated_content === 'string'
              ? entry.translated_content
              : typeof entry.translatedText === 'string'
                ? entry.translatedText
                : typeof entry.value === 'string'
                  ? entry.value
                  : collectStringSegments(entry.content ?? entry.text ?? entry).join('\n');
      pushContent(zoneId, contentCandidate);
    }
    return normalized;
  }

  if (!isPlainObject(raw)) return normalized;

  for (const [zoneId, value] of Object.entries(raw)) {
    pushContent(zoneId, value);
  }

  return normalized;
}

function normalizeLettersStatementsStructuredPage(
  raw: unknown,
  fallbackPageNumber: number,
): LettersStatementsStructuredPage | null {
  if (!isPlainObject(raw) || !isPlainObject(raw.PAGE_METADATA)) return null;

  const metadata = raw.PAGE_METADATA;
  const pageNumber =
    typeof metadata.page_number === 'number' && Number.isFinite(metadata.page_number)
      ? metadata.page_number
      : fallbackPageNumber;
  const detectedDocumentType =
    typeof metadata.detected_document_type === 'string'
      ? metadata.detected_document_type
      : 'letter/declaration';
  const suggestedOrientation =
    metadata.suggested_orientation === 'portrait' ||
    metadata.suggested_orientation === 'landscape' ||
    metadata.suggested_orientation === 'unknown'
      ? metadata.suggested_orientation
      : 'unknown';
  const estimatedDensity =
    metadata.estimated_density === 'low' ||
    metadata.estimated_density === 'medium' ||
    metadata.estimated_density === 'high'
      ? metadata.estimated_density
      : 'medium';
  const suggestedFontStyle =
    typeof metadata.suggested_font_style === 'string'
      ? metadata.suggested_font_style
      : 'unknown';
  const suggestedModelKey =
    metadata.suggested_model_key === 'institutional_declaration_single_page' ||
    metadata.suggested_model_key === 'recommendation_letter_single_page' ||
    metadata.suggested_model_key === 'recommendation_letter_multi_page' ||
    metadata.suggested_model_key === 'declaration_with_letterhead_footer' ||
    metadata.suggested_model_key === 'reference_letter_with_attached_resume' ||
    metadata.suggested_model_key === 'letters_and_statements_generic_structured'
      ? metadata.suggested_model_key
      : 'letters_and_statements_generic_structured';
  const suggestedFontSizes = isPlainObject(metadata.suggested_font_size_by_section)
    ? Object.fromEntries(
        Object.entries(metadata.suggested_font_size_by_section).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

  const normalizedLayoutZones = normalizeLettersStatementsLayoutZones(raw.LAYOUT_ZONES);
  const normalizedTranslatedZones = normalizeLettersStatementsTranslatedZones(
    raw.TRANSLATED_CONTENT_BY_ZONE,
  );
  const normalizedNonTextualElements = Array.isArray(raw.NON_TEXTUAL_ELEMENTS)
    ? raw.NON_TEXTUAL_ELEMENTS
        .map((entry) => normalizeWhitespace(typeof entry === 'string' ? entry : ''))
        .filter((entry): entry is string => entry.length > 0)
    : [];
  const renderingHints = isPlainObject(raw.RENDERING_HINTS)
    ? raw.RENDERING_HINTS
    : {};

  return {
    PAGE_METADATA: {
      page_number: pageNumber,
      detected_document_type: detectedDocumentType,
      suggested_family:
        typeof metadata.suggested_family === 'string'
          ? metadata.suggested_family
          : 'letters_and_statements',
      suggested_model_key: suggestedModelKey,
      suggested_orientation: suggestedOrientation,
      estimated_density: estimatedDensity,
      suggested_font_style: suggestedFontStyle,
      suggested_font_size_by_section: suggestedFontSizes,
    },
    LAYOUT_ZONES: normalizedLayoutZones,
    TRANSLATED_CONTENT_BY_ZONE: normalizedTranslatedZones,
    NON_TEXTUAL_ELEMENTS: normalizedNonTextualElements,
    RENDERING_HINTS: {
      recommended_spacing_profile:
        typeof renderingHints.recommended_spacing_profile === 'string'
          ? renderingHints.recommended_spacing_profile
          : 'normal',
      recommended_line_height:
        typeof renderingHints.recommended_line_height === 'string'
          ? renderingHints.recommended_line_height
          : '1.3',
      recommended_layout_mode:
        typeof renderingHints.recommended_layout_mode === 'string'
          ? renderingHints.recommended_layout_mode
          : 'formal letter single-column',
      page_parity_risk_notes:
        typeof renderingHints.page_parity_risk_notes === 'string'
          ? renderingHints.page_parity_risk_notes
          : '',
    },
  };
}

// ── Diploma / certificate candidate detection ─────────────────────────────────
//
// A one-page document classified as letters_and_statements may actually be a
// diploma or certificate that was misrouted.  These helpers detect that case
// and redirect to the academic_diploma_certificate renderer before the
// letters/statements layout — which generates tall structured blocks — forces
// the document onto a second page.

/**
 * Keywords that strongly indicate a diploma, degree certificate, or graduation
 * document — in English and in common Portuguese / Spanish equivalents.
 */
const DIPLOMA_KEYWORD_RE =
  /\bdiploma\b|\bcertificate\b|\bdegr[aeo]{1,2}\b|\bgraduat|\bbacharelado\b|\blicenciatura\b|\bmestrado\b|\bdoutorado\b|\bcertificado\b|\btítulo\b|\btitulo\b|\bconclus[ãa]/i;

/**
 * Returns true when the document type label contains diploma / certificate
 * keywords strong enough to warrant routing to the diploma renderer before
 * attempting letters_and_statements extraction.
 *
 * Only called for 1-page source documents — multi-page diplomas are rare
 * enough that a false-positive here carries more risk than reward.
 */
function hasDiplomaCandidateLabelSignal(label?: string | null): boolean {
  if (!label) return false;
  return DIPLOMA_KEYWORD_RE.test(label);
}

/**
 * Returns true when the normalized letters_and_statements payload contains
 * diploma / certificate signals in the fields Claude populated during
 * extraction.  Used as a post-extraction gate before rendering.
 *
 * Checks (in priority order):
 *   1. Claude's own `detected_document_type` field for the first page.
 *   2. Claude's `suggested_family` pointing to 'academic_records'.
 *   3. The translated zone text of the first page.
 */
function hasDiplomaCandidatePayloadSignals(payload: LettersAndStatements): boolean {
  const firstPage = payload.PAGES[0];
  if (!firstPage) return false;

  const detectedType = (firstPage.PAGE_METADATA.detected_document_type ?? '').toLowerCase();
  if (DIPLOMA_KEYWORD_RE.test(detectedType)) return true;

  const suggestedFamily = (firstPage.PAGE_METADATA.suggested_family ?? '').toLowerCase();
  if (suggestedFamily === 'academic_records') return true;

  const allZoneText = firstPage.TRANSLATED_CONTENT_BY_ZONE.map((z) => z.content).join(' ');
  if (DIPLOMA_KEYWORD_RE.test(allZoneText)) return true;

  return false;
}

/**
 * Re-extracts the document using the academic_diploma_certificate renderer and
 * returns a diploma-style StructuredRenderOutput.
 *
 * Called from the letters_and_statements case when diploma signals are detected
 * before layout HTML is produced, avoiding the tall structured-block layout that
 * would otherwise push a one-page diploma onto a second page.
 *
 * The returned `rendererName` encodes the reroute reason so callers and logs can
 * distinguish this path from a normal diploma render.
 */
async function extractAndRenderAsDiploma(
  input: StructuredRenderInput,
  messageContentFor: (userMessage: string) => Anthropic.MessageParam['content'],
  defaultLanguageIntegrity: StructuredRenderLanguageIntegrity,
  rerouteReason: 'label_signal' | 'payload_signal',
): Promise<StructuredRenderOutput> {
  console.log(
    `${input.logPrefix} [letters-and-statements→diploma-reroute] ` +
    `reason=${rerouteReason} source_page_count=${input.sourcePageCount ?? 'unknown'} — ` +
    `re-extracting with academic_diploma_certificate renderer`,
  );

  const rawJson = ensureExtractionJson(
    'academic_diploma_certificate',
    await callClaudeForJson(
      input.client,
      buildAcademicDiplomaSystemPrompt(),
      messageContentFor(buildAcademicDiplomaUserMessage()),
      8192,
      `${input.logPrefix} [letters-and-statements→diploma-reroute]`,
    ),
  );

  const parsed = parseStructuredJson<AcademicDiplomaCertificate>(
    'academic_diploma_certificate',
    rawJson,
  );

  const languageIntegrity: StructuredRenderLanguageIntegrity = {
    ...defaultLanguageIntegrity,
    translatedPayloadFound: true,
  };
  assertDiplomaPayloadLanguageIntegrity(input, parsed, languageIntegrity);

  // Diplomas are almost always portrait; fall back to portrait if orientation unknown.
  const effectiveOrientation: DocumentOrientation =
    input.detectedOrientation === 'unknown' ? 'portrait' : input.detectedOrientation;
  parsed.orientation = input.detectedOrientation;
  parsed.page_count = input.sourcePageCount ?? null;

  console.log(
    `${input.logPrefix} [letters-and-statements→diploma-reroute] ` +
    `extraction complete — rendering as academic_diploma_certificate`,
  );

  return {
    structuredHtml: renderAcademicDiplomaHtml(parsed, {
      pageCount: input.sourcePageCount,
      orientation: effectiveOrientation,
    }),
    orientationForKit: effectiveOrientation,
    rendererName: `letters_and_statements_diploma_reroute:${rerouteReason}`,
    languageIntegrity,
  };
}

function normalizeLettersAndStatementsPayload(
  parsed: unknown,
): LettersAndStatements {
  if (!isPlainObject(parsed)) {
    throw new StructuredRenderingRequiredError(
      'letters_and_statements',
      buildStructuredFailureMessage(
        'letters_and_statements',
        'Letters/statements payload is not a valid JSON object.',
      ),
    );
  }

  const rootDocumentType = typeof parsed.document_type === 'string'
    ? parsed.document_type
    : '';
  if (rootDocumentType !== 'letters_and_statements') {
    throw new StructuredRenderingRequiredError(
      'letters_and_statements',
      buildStructuredFailureMessage(
        'letters_and_statements',
        `Structured payload discriminator mismatch: expected "letters_and_statements" but got "${rootDocumentType || 'missing'}".`,
      ),
    );
  }

  const rootTranslatedZones = normalizeLettersStatementsTranslatedZones(
    parsed.TRANSLATED_CONTENT_BY_ZONE,
  );
  const pages = Array.isArray(parsed.PAGES)
    ? parsed.PAGES
        .map((page, index) =>
          isLettersStatementsStructuredPage(page)
            ? normalizeLettersStatementsStructuredPage(page, index + 1)
            : null,
        )
        .filter((page): page is LettersStatementsStructuredPage => page !== null)
    : [];

  if (
    pages.length === 1 &&
    pages[0].TRANSLATED_CONTENT_BY_ZONE.length === 0 &&
    rootTranslatedZones.length > 0
  ) {
    pages[0] = {
      ...pages[0],
      TRANSLATED_CONTENT_BY_ZONE: rootTranslatedZones,
    };
  }

  if (pages.length > 0) {
    return {
      document_type: 'letters_and_statements',
      family:
        parsed.family === 'letters_and_statements' ||
        parsed.family === 'recommendation_letters' ||
        parsed.family === 'employment_records' ||
        parsed.family === 'academic_records'
          ? parsed.family
          : 'letters_and_statements',
      model_key:
        parsed.model_key === 'institutional_declaration_single_page' ||
        parsed.model_key === 'recommendation_letter_single_page' ||
        parsed.model_key === 'recommendation_letter_multi_page' ||
        parsed.model_key === 'declaration_with_letterhead_footer' ||
        parsed.model_key === 'reference_letter_with_attached_resume' ||
        parsed.model_key === 'letters_and_statements_generic_structured'
          ? parsed.model_key
          : 'letters_and_statements_generic_structured',
      PAGES: pages,
      QUALITY_FLAGS: Array.isArray(parsed.QUALITY_FLAGS)
        ? parsed.QUALITY_FLAGS.filter((item): item is string => typeof item === 'string')
        : [],
      orientation:
        parsed.orientation === 'landscape' || parsed.orientation === 'portrait'
          ? parsed.orientation
          : 'unknown',
      page_count:
        typeof parsed.page_count === 'number' ? parsed.page_count : null,
    };
  }

  if (isLettersStatementsStructuredPage(parsed) && !Array.isArray(parsed.PAGES)) {
    const normalizedSinglePage = normalizeLettersStatementsStructuredPage(parsed, 1);
    if (!normalizedSinglePage) {
      throw new StructuredRenderingRequiredError(
        'letters_and_statements',
        buildStructuredFailureMessage(
          'letters_and_statements',
          'Letters/statements extraction requires PAGE_METADATA/LAYOUT_ZONES/TRANSLATED_CONTENT_BY_ZONE schema with page entries.',
        ),
      );
    }
    return {
      document_type: 'letters_and_statements',
      family: 'letters_and_statements',
      model_key: 'letters_and_statements_generic_structured',
      PAGES: [normalizedSinglePage],
      QUALITY_FLAGS: [],
      orientation: 'unknown',
      page_count: null,
    };
  }

  throw new StructuredRenderingRequiredError(
    'letters_and_statements',
    buildStructuredFailureMessage(
      'letters_and_statements',
      'Letters/statements extraction requires PAGE_METADATA/LAYOUT_ZONES/TRANSLATED_CONTENT_BY_ZONE schema with page entries.',
    ),
  );
}

function isLettersStatementsTextBearingZone(zone: LettersStatementsLayoutZone): boolean {
  const signal = normalizeZoneBindingId(
    `${zone.zone_type} ${zone.zone_id} ${zone.visual_style}`,
  );
  if (!signal) return true;

  const nonTextKeywords = [
    'logo',
    'seal',
    'stamp',
    'watermark',
    'barcode',
    'qr',
    'photo',
    'image',
    'illustration',
    'icon',
    'decorative',
    'ornament',
    'border',
    'frame',
  ];
  if (nonTextKeywords.some((keyword) => signal.includes(keyword))) {
    return false;
  }

  return true;
}

interface LettersStatementsZoneBindingResolution {
  requiredZones: string[];
  translatedZonesFound: string[];
  missingTranslatedZones: string[];
  mappedGenericZones: string[];
  resolvedZoneContents: Array<{ zoneLabel: string; content: string }>;
  allTranslatedSegments: string[];
}

function resolveLettersStatementsZoneBindings(
  payload: LettersAndStatements,
): LettersStatementsZoneBindingResolution {
  const requiredZones: string[] = [];
  const translatedZonesFound: string[] = [];
  const missingTranslatedZones: string[] = [];
  const mappedGenericZones: string[] = [];
  const resolvedZoneContents = new Map<string, string>();
  const allTranslatedSegments: string[] = [];

  for (const page of payload.PAGES ?? []) {
    const pageNumber = page.PAGE_METADATA?.page_number ?? '?';
    const layoutZones = (page.LAYOUT_ZONES ?? [])
      .map((zone, index) => {
        const originalId = normalizeWhitespace(zone.zone_id);
        const normalizedId = normalizeZoneBindingId(zone.zone_id);
        if (!originalId || !normalizedId) return null;
        return {
          index,
          originalId,
          normalizedId,
          label: `page_${pageNumber}:${originalId}`,
          textBearing: isLettersStatementsTextBearingZone(zone),
        };
      })
      .filter((zone): zone is {
        index: number;
        originalId: string;
        normalizedId: string;
        label: string;
        textBearing: boolean;
      } => zone !== null);

    const translatedEntries = (page.TRANSLATED_CONTENT_BY_ZONE ?? [])
      .map((entry, index) => {
        const originalId = normalizeWhitespace(entry.zone_id);
        const normalizedId = normalizeZoneBindingId(entry.zone_id);
        const content = normalizeWhitespace(entry.content);
        if (!originalId || !normalizedId || !content) return null;
        return { index, originalId, normalizedId, content };
      })
      .filter((entry): entry is {
        index: number;
        originalId: string;
        normalizedId: string;
        content: string;
      } => entry !== null);

    for (const entry of translatedEntries) {
      allTranslatedSegments.push(entry.content);
    }

    requiredZones.push(
      ...layoutZones
        .filter((zone) => zone.textBearing)
        .map((zone) => zone.label),
    );

    const layoutByNormalizedId = new Map<string, number[]>();
    for (const zone of layoutZones) {
      const existing = layoutByNormalizedId.get(zone.normalizedId) ?? [];
      existing.push(zone.index);
      layoutByNormalizedId.set(zone.normalizedId, existing);
    }

    const consumedTranslatedIndexes = new Set<number>();
    const consumedLayoutIndexes = new Set<number>();

    const assign = (
      layoutIndex: number,
      translatedIndex: number,
      mappedGenericSource?: string,
    ): void => {
      const layoutZone = layoutZones.find((zone) => zone.index === layoutIndex);
      const translatedEntry = translatedEntries.find(
        (entry) => entry.index === translatedIndex,
      );
      if (!layoutZone || !translatedEntry) return;

      consumedLayoutIndexes.add(layoutZone.index);
      consumedTranslatedIndexes.add(translatedEntry.index);
      if (layoutZone.textBearing) {
        translatedZonesFound.push(layoutZone.label);
      }
      const existing = resolvedZoneContents.get(layoutZone.label) ?? '';
      resolvedZoneContents.set(
        layoutZone.label,
        existing ? `${existing}\n${translatedEntry.content}` : translatedEntry.content,
      );

      if (mappedGenericSource) {
        mappedGenericZones.push(
          `page_${pageNumber}:${mappedGenericSource}->${layoutZone.originalId}`,
        );
      }
    };

    for (const entry of translatedEntries) {
      const candidates = layoutByNormalizedId.get(entry.normalizedId) ?? [];
      const availableLayout = candidates.find(
        (candidateIndex) => !consumedLayoutIndexes.has(candidateIndex),
      );
      if (availableLayout === undefined) continue;
      assign(availableLayout, entry.index);
    }

    const unmatchedLayout = layoutZones.filter(
      (zone) => !consumedLayoutIndexes.has(zone.index),
    );
    const unmatchedGenericTranslated = translatedEntries.filter(
      (entry) =>
        !consumedTranslatedIndexes.has(entry.index) &&
        isGenericCivilZoneId(entry.normalizedId),
    );

    const fallbackMappings = Math.min(
      unmatchedLayout.length,
      unmatchedGenericTranslated.length,
    );
    for (let i = 0; i < fallbackMappings; i += 1) {
      const zone = unmatchedLayout[i];
      const entry = unmatchedGenericTranslated[i];
      assign(zone.index, entry.index, entry.originalId);
    }

    for (const zone of layoutZones) {
      if (!zone.textBearing) continue;
      if (!consumedLayoutIndexes.has(zone.index)) {
        missingTranslatedZones.push(zone.label);
      }
    }
  }

  return {
    requiredZones,
    translatedZonesFound: Array.from(new Set(translatedZonesFound)),
    missingTranslatedZones,
    mappedGenericZones,
    resolvedZoneContents: Array.from(resolvedZoneContents.entries()).map(
      ([zoneLabel, content]) => ({ zoneLabel, content }),
    ),
    allTranslatedSegments,
  };
}

function inferLettersStatementsOrientation(
  payload: LettersAndStatements,
): DocumentOrientation {
  if (payload.orientation === 'portrait' || payload.orientation === 'landscape') {
    return payload.orientation;
  }

  const pageHint = payload.PAGES?.[0]?.PAGE_METADATA?.suggested_orientation;
  if (pageHint === 'portrait' || pageHint === 'landscape') {
    return pageHint;
  }

  return 'portrait';
}

function buildLettersStatementsLanguageIntegrity(
  input: StructuredRenderInput,
  payload: LettersAndStatements,
): StructuredRenderLanguageIntegrity {
  const diagnostics = buildDefaultLanguageIntegrity(input);
  const resolvedBindings = resolveLettersStatementsZoneBindings(payload);

  diagnostics.translatedPayloadFound = true;
  diagnostics.requiredZones = resolvedBindings.requiredZones;
  diagnostics.sourceZonesCount = resolvedBindings.requiredZones.length;
  diagnostics.translatedZonesFound = resolvedBindings.translatedZonesFound;
  diagnostics.translatedZonesCount = resolvedBindings.translatedZonesFound.length;
  diagnostics.missingTranslatedZones = resolvedBindings.missingTranslatedZones;
  diagnostics.mappedGenericZones = resolvedBindings.mappedGenericZones;
  diagnostics.sourceContentAttempted = diagnostics.missingTranslatedZones.length > 0;

  const sourceLanguageContaminatedZones: string[] = [];
  const sourceLanguageMarkers = new Set<string>();

  for (const resolvedZone of resolvedBindings.resolvedZoneContents) {
    const zoneLeakage = detectSourceLanguageLeakageFromSegments(
      [resolvedZone.content],
      {
        sourceLanguage: diagnostics.sourceLanguage,
        targetLanguage: diagnostics.targetLanguage,
      },
    );
    if (!zoneLeakage.detected) continue;
    sourceLanguageContaminatedZones.push(resolvedZone.zoneLabel);
    for (const marker of zoneLeakage.matchedMarkers) {
      sourceLanguageMarkers.add(`${resolvedZone.zoneLabel}:${marker}`);
    }
  }

  const globalLeakage = detectSourceLanguageLeakageFromSegments(
    resolvedBindings.allTranslatedSegments,
    {
      sourceLanguage: diagnostics.sourceLanguage,
      targetLanguage: diagnostics.targetLanguage,
    },
  );
  for (const marker of globalLeakage.matchedMarkers) {
    sourceLanguageMarkers.add(marker);
  }
  if (
    globalLeakage.detected &&
    sourceLanguageContaminatedZones.length === 0
  ) {
    sourceLanguageContaminatedZones.push('payload');
  }

  diagnostics.sourceLanguageMarkers = Array.from(sourceLanguageMarkers);
  diagnostics.sourceLanguageContaminatedZones = sourceLanguageContaminatedZones;
  diagnostics.sourceContentAttempted =
    diagnostics.sourceContentAttempted ||
    sourceLanguageContaminatedZones.length > 0;
  diagnostics.languageIssueType = resolveLanguageIssueType(
    diagnostics.missingTranslatedZones.length > 0,
    sourceLanguageContaminatedZones.length > 0,
  );

  return diagnostics;
}

function isEb1EvidenceStructuredPage(
  value: unknown,
): value is Eb1EvidenceStructuredPage {
  if (!isPlainObject(value)) return false;
  const hasLayoutZones =
    Array.isArray(value.LAYOUT_ZONES) || isPlainObject(value.LAYOUT_ZONES);
  const hasTranslatedZones =
    Array.isArray(value.TRANSLATED_CONTENT_BY_ZONE) ||
    isPlainObject(value.TRANSLATED_CONTENT_BY_ZONE);
  return isPlainObject(value.PAGE_METADATA) && hasLayoutZones && hasTranslatedZones;
}

function normalizeEb1EvidenceLayoutZones(
  raw: unknown,
): Eb1EvidenceLayoutZone[] {
  const normalized: Eb1EvidenceLayoutZone[] = [];

  const pushZone = (
    zoneIdRaw: unknown,
    zoneTypeRaw: unknown,
    relativePositionRaw: unknown,
    visualStyleRaw: unknown,
    compactionPriorityRaw: unknown,
  ): void => {
    const zoneId = normalizeWhitespace(
      typeof zoneIdRaw === 'string' ? zoneIdRaw : '',
    );
    if (!zoneId) return;
    normalized.push({
      zone_id: zoneId,
      zone_type:
        normalizeWhitespace(
          typeof zoneTypeRaw === 'string' ? zoneTypeRaw : '',
        ) || 'other',
      relative_position:
        normalizeWhitespace(
          typeof relativePositionRaw === 'string' ? relativePositionRaw : '',
        ) || 'center',
      visual_style:
        normalizeWhitespace(
          typeof visualStyleRaw === 'string' ? visualStyleRaw : '',
        ) || 'other',
      compaction_priority:
        normalizeWhitespace(
          typeof compactionPriorityRaw === 'string' ? compactionPriorityRaw : '',
        ) || 'medium',
    });
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isPlainObject(entry)) continue;
      pushZone(
        typeof entry.zone_id === 'string'
          ? entry.zone_id
          : typeof entry.zoneId === 'string'
            ? entry.zoneId
            : '',
        entry.zone_type,
        entry.relative_position,
        entry.visual_style,
        entry.compaction_priority,
      );
    }
    return normalized;
  }

  if (!isPlainObject(raw)) return normalized;

  for (const [key, value] of Object.entries(raw)) {
    if (isPlainObject(value)) {
      pushZone(
        typeof value.zone_id === 'string'
          ? value.zone_id
          : typeof value.zoneId === 'string'
            ? value.zoneId
            : key,
        value.zone_type,
        value.relative_position,
        value.visual_style,
        value.compaction_priority,
      );
      continue;
    }

    pushZone(key, 'other', 'center', 'other', 'medium');
  }

  return normalized;
}

function normalizeEb1EvidenceTranslatedZones(
  raw: unknown,
): Eb1EvidenceTranslatedZoneContent[] {
  const normalized: Eb1EvidenceTranslatedZoneContent[] = [];

  const pushContent = (zoneIdRaw: unknown, contentRaw: unknown): void => {
    const zoneId = normalizeWhitespace(
      typeof zoneIdRaw === 'string' ? zoneIdRaw : '',
    );
    if (!zoneId) return;
    const content = normalizeWhitespace(
      typeof contentRaw === 'string'
        ? contentRaw
        : collectStringSegments(contentRaw).join('\n'),
    );
    if (!content) return;
    normalized.push({ zone_id: zoneId, content });
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isPlainObject(entry)) continue;
      const zoneId =
        typeof entry.zone_id === 'string'
          ? entry.zone_id
          : typeof entry.zoneId === 'string'
            ? entry.zoneId
            : typeof entry.id === 'string'
              ? entry.id
              : '';
      const contentCandidate =
        typeof entry.content === 'string'
          ? entry.content
          : typeof entry.text === 'string'
            ? entry.text
            : typeof entry.translated_content === 'string'
              ? entry.translated_content
              : typeof entry.translatedText === 'string'
                ? entry.translatedText
                : typeof entry.value === 'string'
                  ? entry.value
                  : collectStringSegments(entry.content ?? entry.text ?? entry).join('\n');
      pushContent(zoneId, contentCandidate);
    }
    return normalized;
  }

  if (!isPlainObject(raw)) return normalized;

  for (const [zoneId, value] of Object.entries(raw)) {
    pushContent(zoneId, value);
  }

  return normalized;
}

function normalizeEb1EvidenceStructuredPage(
  raw: unknown,
  fallbackPageNumber: number,
): Eb1EvidenceStructuredPage | null {
  if (!isPlainObject(raw) || !isPlainObject(raw.PAGE_METADATA)) return null;

  const metadata = raw.PAGE_METADATA;
  const pageNumber =
    typeof metadata.page_number === 'number' && Number.isFinite(metadata.page_number)
      ? metadata.page_number
      : fallbackPageNumber;
  const detectedDocumentType =
    typeof metadata.detected_document_type === 'string'
      ? metadata.detected_document_type
      : 'EB1 evidence photo sheet';
  const suggestedOrientation =
    metadata.suggested_orientation === 'portrait' ||
    metadata.suggested_orientation === 'landscape' ||
    metadata.suggested_orientation === 'unknown'
      ? metadata.suggested_orientation
      : 'unknown';
  const estimatedDensity =
    metadata.estimated_density === 'low' ||
    metadata.estimated_density === 'medium' ||
    metadata.estimated_density === 'high'
      ? metadata.estimated_density
      : 'medium';
  const suggestedFontStyle =
    typeof metadata.suggested_font_style === 'string'
      ? metadata.suggested_font_style
      : 'unknown';
  const suggestedFontSizes = isPlainObject(metadata.suggested_font_size_by_section)
    ? Object.fromEntries(
        Object.entries(metadata.suggested_font_size_by_section).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

  const normalizedLayoutZones = normalizeEb1EvidenceLayoutZones(raw.LAYOUT_ZONES);
  const normalizedTranslatedZones = normalizeEb1EvidenceTranslatedZones(
    raw.TRANSLATED_CONTENT_BY_ZONE,
  );
  const normalizedNonTextualElements = Array.isArray(raw.NON_TEXTUAL_ELEMENTS)
    ? raw.NON_TEXTUAL_ELEMENTS
        .map((entry) => normalizeWhitespace(typeof entry === 'string' ? entry : ''))
        .filter((entry): entry is string => entry.length > 0)
    : [];
  const renderingHints = isPlainObject(raw.RENDERING_HINTS)
    ? raw.RENDERING_HINTS
    : {};

  return {
    PAGE_METADATA: {
      page_number: pageNumber,
      detected_document_type: detectedDocumentType,
      suggested_family:
        typeof metadata.suggested_family === 'string'
          ? metadata.suggested_family
          : 'eb1_evidence_photo_sheet',
      suggested_model_key:
        typeof metadata.suggested_model_key === 'string'
          ? metadata.suggested_model_key
          : 'unknown',
      suggested_orientation: suggestedOrientation,
      estimated_density: estimatedDensity,
      suggested_font_style: suggestedFontStyle,
      suggested_font_size_by_section: suggestedFontSizes,
    },
    LAYOUT_ZONES: normalizedLayoutZones,
    TRANSLATED_CONTENT_BY_ZONE: normalizedTranslatedZones,
    NON_TEXTUAL_ELEMENTS: normalizedNonTextualElements,
    RENDERING_HINTS: {
      recommended_spacing_profile:
        typeof renderingHints.recommended_spacing_profile === 'string'
          ? renderingHints.recommended_spacing_profile
          : 'normal',
      recommended_line_height:
        typeof renderingHints.recommended_line_height === 'string'
          ? renderingHints.recommended_line_height
          : '1.25',
      recommended_photo_layout_mode:
        typeof renderingHints.recommended_photo_layout_mode === 'string'
          ? renderingHints.recommended_photo_layout_mode
          : 'single centered portrait photo block',
      whether_images_must_remain_side_by_side_or_stacked:
        typeof renderingHints.whether_images_must_remain_side_by_side_or_stacked === 'string'
          ? renderingHints.whether_images_must_remain_side_by_side_or_stacked
          : 'single',
      page_parity_risk_notes:
        typeof renderingHints.page_parity_risk_notes === 'string'
          ? renderingHints.page_parity_risk_notes
          : '',
    },
  };
}

function normalizeEb1EvidencePhotoSheetPayload(
  parsed: unknown,
): Eb1EvidencePhotoSheet {
  if (!isPlainObject(parsed)) {
    throw new StructuredRenderingRequiredError(
      'eb1_evidence_photo_sheet',
      buildStructuredFailureMessage(
        'eb1_evidence_photo_sheet',
        'EB1 evidence payload is not a valid JSON object.',
      ),
    );
  }

  const rootDocumentType = typeof parsed.document_type === 'string'
    ? parsed.document_type
    : '';
  if (rootDocumentType !== 'eb1_evidence_photo_sheet') {
    throw new StructuredRenderingRequiredError(
      'eb1_evidence_photo_sheet',
      buildStructuredFailureMessage(
        'eb1_evidence_photo_sheet',
        `Structured payload discriminator mismatch: expected "eb1_evidence_photo_sheet" but got "${rootDocumentType || 'missing'}".`,
      ),
    );
  }

  const rootTranslatedZones = normalizeEb1EvidenceTranslatedZones(
    parsed.TRANSLATED_CONTENT_BY_ZONE,
  );
  const pages = Array.isArray(parsed.PAGES)
    ? parsed.PAGES
        .map((page, index) =>
          isEb1EvidenceStructuredPage(page)
            ? normalizeEb1EvidenceStructuredPage(page, index + 1)
            : null,
        )
        .filter((page): page is Eb1EvidenceStructuredPage => page !== null)
    : [];

  if (pages.length === 1 && pages[0].TRANSLATED_CONTENT_BY_ZONE.length === 0 && rootTranslatedZones.length > 0) {
    pages[0] = {
      ...pages[0],
      TRANSLATED_CONTENT_BY_ZONE: rootTranslatedZones,
    };
  }

  if (pages.length > 0) {
    return {
      document_type: 'eb1_evidence_photo_sheet',
      family:
        parsed.family === 'eb1_evidence_photo_sheet' ||
        parsed.family === 'relationship_evidence'
          ? parsed.family
          : 'relationship_evidence',
      model_key:
        parsed.model_key === 'eb1_single_photo_with_highlight_footer_v1' ||
        parsed.model_key === 'eb1_two_photo_sheet_v1' ||
        parsed.model_key === 'eb1_two_plus_one_photo_sheet_v1'
          ? parsed.model_key
          : 'unknown',
      PAGES: pages,
      QUALITY_FLAGS: Array.isArray(parsed.QUALITY_FLAGS)
        ? parsed.QUALITY_FLAGS.filter((item): item is string => typeof item === 'string')
        : [],
      orientation:
        parsed.orientation === 'landscape' || parsed.orientation === 'portrait'
          ? parsed.orientation
          : 'unknown',
      page_count:
        typeof parsed.page_count === 'number' ? parsed.page_count : null,
    };
  }

  if (isEb1EvidenceStructuredPage(parsed) && !Array.isArray(parsed.PAGES)) {
    const normalizedSinglePage = normalizeEb1EvidenceStructuredPage(parsed, 1);
    if (!normalizedSinglePage) {
      throw new StructuredRenderingRequiredError(
        'eb1_evidence_photo_sheet',
        buildStructuredFailureMessage(
          'eb1_evidence_photo_sheet',
          'EB1 evidence extraction requires PAGE_METADATA/LAYOUT_ZONES/TRANSLATED_CONTENT_BY_ZONE schema with page entries.',
        ),
      );
    }
    return {
      document_type: 'eb1_evidence_photo_sheet',
      family: 'relationship_evidence',
      model_key: 'unknown',
      PAGES: [normalizedSinglePage],
      QUALITY_FLAGS: [],
      orientation: 'unknown',
      page_count: null,
    };
  }

  throw new StructuredRenderingRequiredError(
    'eb1_evidence_photo_sheet',
    buildStructuredFailureMessage(
      'eb1_evidence_photo_sheet',
      'EB1 evidence extraction requires PAGE_METADATA/LAYOUT_ZONES/TRANSLATED_CONTENT_BY_ZONE schema with page entries.',
    ),
  );
}

function isEb1EvidenceTextBearingZone(zone: Eb1EvidenceLayoutZone): boolean {
  const signal = normalizeZoneBindingId(
    `${zone.zone_type} ${zone.zone_id} ${zone.visual_style}`,
  );
  if (!signal) return true;

  const nonTextKeywords = [
    'photo',
    'image',
    'highlight',
    'marker',
    'arrow',
    'gallery',
    'logo',
    'seal',
    'border',
    'ornamental',
    'ornament',
    'decorative',
    'decoration',
    'watermark',
    'badge',
    'icon',
    'emblem',
    'coat',
    'insignia',
    'frame',
    'non_text',
    'nontext',
  ];

  if (nonTextKeywords.some((keyword) => signal.includes(keyword))) {
    return false;
  }

  return true;
}

interface Eb1EvidenceZoneBindingResolution {
  requiredZones: string[];
  translatedZonesFound: string[];
  missingTranslatedZones: string[];
  mappedGenericZones: string[];
  resolvedZoneContents: Array<{ zoneLabel: string; content: string }>;
  allTranslatedSegments: string[];
}

function resolveEb1EvidenceZoneBindings(
  payload: Eb1EvidencePhotoSheet,
): Eb1EvidenceZoneBindingResolution {
  const requiredZones: string[] = [];
  const translatedZonesFound: string[] = [];
  const missingTranslatedZones: string[] = [];
  const mappedGenericZones: string[] = [];
  const resolvedZoneContents = new Map<string, string>();
  const allTranslatedSegments: string[] = [];

  for (const page of payload.PAGES ?? []) {
    const pageNumber = page.PAGE_METADATA?.page_number ?? '?';
    const layoutZones = (page.LAYOUT_ZONES ?? [])
      .map((zone, index) => {
        const originalId = normalizeWhitespace(zone.zone_id);
        const normalizedId = normalizeZoneBindingId(zone.zone_id);
        if (!originalId || !normalizedId) return null;
        return {
          index,
          originalId,
          normalizedId,
          label: `page_${pageNumber}:${originalId}`,
          textBearing: isEb1EvidenceTextBearingZone(zone),
        };
      })
      .filter((zone): zone is {
        index: number;
        originalId: string;
        normalizedId: string;
        label: string;
        textBearing: boolean;
      } => zone !== null);

    const translatedEntries = (page.TRANSLATED_CONTENT_BY_ZONE ?? [])
      .map((entry, index) => {
        const originalId = normalizeWhitespace(entry.zone_id);
        const normalizedId = normalizeZoneBindingId(entry.zone_id);
        const content = normalizeWhitespace(entry.content);
        if (!originalId || !normalizedId || !content) return null;
        return { index, originalId, normalizedId, content };
      })
      .filter((entry): entry is {
        index: number;
        originalId: string;
        normalizedId: string;
        content: string;
      } => entry !== null);

    for (const entry of translatedEntries) {
      allTranslatedSegments.push(entry.content);
    }

    requiredZones.push(
      ...layoutZones
        .filter((zone) => zone.textBearing)
        .map((zone) => zone.label),
    );

    const layoutByNormalizedId = new Map<string, number[]>();
    for (const zone of layoutZones) {
      const existing = layoutByNormalizedId.get(zone.normalizedId) ?? [];
      existing.push(zone.index);
      layoutByNormalizedId.set(zone.normalizedId, existing);
    }

    const consumedTranslatedIndexes = new Set<number>();
    const consumedLayoutIndexes = new Set<number>();

    const assign = (
      layoutIndex: number,
      translatedIndex: number,
      mappedGenericSource?: string,
    ): void => {
      const layoutZone = layoutZones.find((zone) => zone.index === layoutIndex);
      const translatedEntry = translatedEntries.find(
        (entry) => entry.index === translatedIndex,
      );
      if (!layoutZone || !translatedEntry) return;

      consumedLayoutIndexes.add(layoutZone.index);
      consumedTranslatedIndexes.add(translatedEntry.index);
      if (layoutZone.textBearing) {
        translatedZonesFound.push(layoutZone.label);
      }
      const existing = resolvedZoneContents.get(layoutZone.label) ?? '';
      resolvedZoneContents.set(
        layoutZone.label,
        existing ? `${existing}\n${translatedEntry.content}` : translatedEntry.content,
      );

      if (mappedGenericSource) {
        mappedGenericZones.push(
          `page_${pageNumber}:${mappedGenericSource}->${layoutZone.originalId}`,
        );
      }
    };

    for (const entry of translatedEntries) {
      const candidates = layoutByNormalizedId.get(entry.normalizedId) ?? [];
      const availableLayout = candidates.find(
        (candidateIndex) => !consumedLayoutIndexes.has(candidateIndex),
      );
      if (availableLayout === undefined) continue;
      assign(availableLayout, entry.index);
    }

    const unmatchedLayout = layoutZones.filter(
      (zone) => !consumedLayoutIndexes.has(zone.index),
    );
    const unmatchedGenericTranslated = translatedEntries.filter(
      (entry) =>
        !consumedTranslatedIndexes.has(entry.index) &&
        isGenericCivilZoneId(entry.normalizedId),
    );

    const fallbackMappings = Math.min(
      unmatchedLayout.length,
      unmatchedGenericTranslated.length,
    );
    for (let i = 0; i < fallbackMappings; i += 1) {
      const zone = unmatchedLayout[i];
      const entry = unmatchedGenericTranslated[i];
      assign(zone.index, entry.index, entry.originalId);
    }

    for (const zone of layoutZones) {
      if (!zone.textBearing) continue;
      if (!consumedLayoutIndexes.has(zone.index)) {
        missingTranslatedZones.push(zone.label);
      }
    }
  }

  return {
    requiredZones,
    translatedZonesFound: Array.from(new Set(translatedZonesFound)),
    missingTranslatedZones,
    mappedGenericZones,
    resolvedZoneContents: Array.from(resolvedZoneContents.entries()).map(
      ([zoneLabel, content]) => ({ zoneLabel, content }),
    ),
    allTranslatedSegments,
  };
}

function inferEb1EvidenceOrientation(
  payload: Eb1EvidencePhotoSheet,
): DocumentOrientation {
  if (payload.orientation === 'portrait' || payload.orientation === 'landscape') {
    return payload.orientation;
  }

  const pageHint = payload.PAGES?.[0]?.PAGE_METADATA?.suggested_orientation;
  if (pageHint === 'portrait' || pageHint === 'landscape') {
    return pageHint;
  }

  return 'portrait';
}

function buildEb1EvidenceLanguageIntegrity(
  input: StructuredRenderInput,
  payload: Eb1EvidencePhotoSheet,
): StructuredRenderLanguageIntegrity {
  const diagnostics = buildDefaultLanguageIntegrity(input);
  const resolvedBindings = resolveEb1EvidenceZoneBindings(payload);

  diagnostics.translatedPayloadFound = true;
  diagnostics.requiredZones = resolvedBindings.requiredZones;
  diagnostics.sourceZonesCount = resolvedBindings.requiredZones.length;
  diagnostics.translatedZonesFound = resolvedBindings.translatedZonesFound;
  diagnostics.translatedZonesCount = resolvedBindings.translatedZonesFound.length;
  diagnostics.missingTranslatedZones = resolvedBindings.missingTranslatedZones;
  diagnostics.mappedGenericZones = resolvedBindings.mappedGenericZones;
  diagnostics.sourceContentAttempted = diagnostics.missingTranslatedZones.length > 0;

  const sourceLanguageContaminatedZones: string[] = [];
  const sourceLanguageMarkers = new Set<string>();

  for (const resolvedZone of resolvedBindings.resolvedZoneContents) {
    const zoneLeakage = detectSourceLanguageLeakageFromSegments(
      [resolvedZone.content],
      {
        sourceLanguage: diagnostics.sourceLanguage,
        targetLanguage: diagnostics.targetLanguage,
      },
    );
    if (!zoneLeakage.detected) continue;
    sourceLanguageContaminatedZones.push(resolvedZone.zoneLabel);
    for (const marker of zoneLeakage.matchedMarkers) {
      sourceLanguageMarkers.add(`${resolvedZone.zoneLabel}:${marker}`);
    }
  }

  const globalLeakage = detectSourceLanguageLeakageFromSegments(
    resolvedBindings.allTranslatedSegments,
    {
      sourceLanguage: diagnostics.sourceLanguage,
      targetLanguage: diagnostics.targetLanguage,
    },
  );
  for (const marker of globalLeakage.matchedMarkers) {
    sourceLanguageMarkers.add(marker);
  }
  if (globalLeakage.detected && sourceLanguageContaminatedZones.length === 0) {
    sourceLanguageContaminatedZones.push('payload');
  }

  diagnostics.sourceLanguageMarkers = Array.from(sourceLanguageMarkers);
  diagnostics.sourceLanguageContaminatedZones = sourceLanguageContaminatedZones;
  diagnostics.sourceContentAttempted =
    diagnostics.sourceContentAttempted ||
    sourceLanguageContaminatedZones.length > 0;
  diagnostics.languageIssueType = resolveLanguageIssueType(
    diagnostics.missingTranslatedZones.length > 0,
    sourceLanguageContaminatedZones.length > 0,
  );

  return diagnostics;
}

export async function renderSupportedStructuredDocument(
  input: StructuredRenderInput,
): Promise<StructuredRenderOutput> {
  const rendererName = getStructuredRendererName(input.documentType);
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
  const defaultLanguageIntegrity = buildDefaultLanguageIntegrity(input);

  switch (input.documentType) {
    case 'marriage_certificate_brazil': {
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
      assertMarriagePayloadCompliance(parsed);
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertPayloadLanguageIntegrity(input, parsed, languageIntegrity, 'preview');

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
        rendererName,
        languageIntegrity,
      };
    }

    case 'civil_record_general': {
      const requiresCompactZoneModel = input.sourcePageCount === 1;
      const civilPromptLabel = requiresCompactZoneModel
        ? 'civil-record-general-compact-zones'
        : 'civil-record-general';
      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          requiresCompactZoneModel
            ? buildCivilRecordGeneralCompactZoneSystemPrompt()
            : buildCivilRecordGeneralSystemPrompt(),
          messageContentFor(
            requiresCompactZoneModel
              ? buildCivilRecordGeneralCompactZoneUserMessage({
                  sourcePageCount: input.sourcePageCount ?? null,
                })
              : buildCivilRecordGeneralUserMessage({
                  sourcePageCount: input.sourcePageCount ?? null,
                }),
          ),
          requiresCompactZoneModel ? 16384 : 12288,
          `${input.logPrefix} [${civilPromptLabel}]`,
        ),
      );

      const parsed = parseStructuredJson<unknown>(
        input.documentType,
        rawJson,
      );
      assertExpectedDocumentTypeTag('civil_record_general', parsed);

      if (requiresCompactZoneModel) {
        if (!isCivilRecordGeneralZoneBlueprint(parsed)) {
          throw new StructuredRenderingRequiredError(
            input.documentType,
            buildStructuredFailureMessage(
              input.documentType,
              'Compact civil one-page rendering requires Anthropic zone blueprint fields (PAGE_METADATA/LAYOUT_ZONES/TRANSLATED_CONTENT_BY_ZONE/RENDERING_HINTS). Payload did not match required zone model.',
            ),
          );
        }

        const normalizedCompactPayload = normalizeCivilCompactZonePayload(parsed);
        const languageIntegrity = buildCompactCivilLanguageIntegrity(
          input,
          normalizedCompactPayload,
        );
        const compactCivilBlockingReason =
          languageIntegrity.languageIssueType !== 'none'
            ? 'translated_zone_content_missing_or_source_language_detected'
            : 'none';
        console.log(
          `${input.logPrefix} [${civilPromptLabel}] language integrity diagnostics: ` +
            JSON.stringify({
              orderId: input.orderId ?? null,
              docId: input.documentId ?? null,
              family: 'civil_records',
              subtype: normalizedCompactPayload.document_subtype,
              targetLanguage: languageIntegrity.targetLanguage,
              sourceLanguage: languageIntegrity.sourceLanguage,
              translatedPayloadFound: languageIntegrity.translatedPayloadFound ? 'yes' : 'no',
              requiredZones: languageIntegrity.requiredZones,
              translatedZonesFound: languageIntegrity.translatedZonesFound,
              translatedZonesCount: languageIntegrity.translatedZonesCount,
              sourceZonesCount: languageIntegrity.sourceZonesCount,
              missingTranslatedZones: languageIntegrity.missingTranslatedZones,
              sourceLanguageContaminatedZones:
                languageIntegrity.sourceLanguageContaminatedZones,
              sourceContentAttempted: languageIntegrity.sourceContentAttempted ? 'yes' : 'no',
              sourceLanguageMarkers: languageIntegrity.sourceLanguageMarkers,
              mappedGenericZones: languageIntegrity.mappedGenericZones,
              issueType: languageIntegrity.languageIssueType,
              issueIsMissingContent:
                languageIntegrity.languageIssueType ===
                  'missing_translated_zones' ||
                languageIntegrity.languageIssueType ===
                  'missing_and_source_language_mismatch',
              issueIsLanguageMismatch:
                languageIntegrity.languageIssueType ===
                  'source_language_mismatch' ||
                languageIntegrity.languageIssueType ===
                  'missing_and_source_language_mismatch',
              blockingReason: compactCivilBlockingReason,
            }),
        );
        if (compactCivilBlockingReason !== 'none') {
          throw new StructuredRenderingRequiredError(
            input.documentType,
            buildStructuredFailureMessage(
              input.documentType,
              'Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface.',
            ),
          );
        }

        if (
          typeof input.sourcePageCount === 'number' &&
          input.sourcePageCount > 0 &&
          normalizedCompactPayload.PAGES.length !== input.sourcePageCount
        ) {
          throw new StructuredRenderingRequiredError(
            input.documentType,
            buildStructuredFailureMessage(
              input.documentType,
              `Compact civil zone blueprint page mismatch: source_page_count=${input.sourcePageCount} but blueprint_pages=${normalizedCompactPayload.PAGES.length}.`,
            ),
          );
        }

        const effectiveOrientation: DocumentOrientation =
          input.detectedOrientation === 'unknown'
            ? inferCivilZoneOrientation(normalizedCompactPayload)
            : input.detectedOrientation;

        const totalZones = normalizedCompactPayload.PAGES.reduce(
          (sum, page) => sum + (page.LAYOUT_ZONES?.length ?? 0),
          0,
        );
        const totalContentBlocks = normalizedCompactPayload.PAGES.reduce(
          (sum, page) => sum + (page.TRANSLATED_CONTENT_BY_ZONE?.length ?? 0),
          0,
        );

        console.log(
          `${input.logPrefix} [${civilPromptLabel}] layout diagnostics | ` +
            `pageTarget=${input.sourcePageCount ?? 'n/a'} zoneModelUsed=yes pages=${normalizedCompactPayload.PAGES.length} ` +
            `zones=${totalZones} translatedBlocks=${totalContentBlocks} subtype=${normalizedCompactPayload.document_subtype} ` +
            `blueprintProfile=${normalizedCompactPayload.blueprint_profile} orientation=${effectiveOrientation}`,
        );

        return {
          structuredHtml: renderCivilRecordCompactZoneHtml(normalizedCompactPayload, {
            pageCount: input.sourcePageCount,
            orientation: effectiveOrientation,
          }),
          orientationForKit: effectiveOrientation,
          rendererName,
          languageIntegrity,
        };
      }

      const parsedLegacy = parsed as CivilRecordGeneral;
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertPayloadLanguageIntegrity(input, parsedLegacy, languageIntegrity, 'preview');

      parsedLegacy.orientation = input.detectedOrientation;
      parsedLegacy.page_count = input.sourcePageCount ?? null;

      const effectiveOrientation: DocumentOrientation =
        input.detectedOrientation === 'unknown' ? 'portrait' : input.detectedOrientation;
      const preparedCivil = prepareCivilRecordGeneralForRender(parsedLegacy, {
        targetPageCount: input.sourcePageCount,
      });

      console.log(
        `${input.logPrefix} [civil-record-general] layout diagnostics | ` +
          `zoneModelUsed=no ` +
          `pageTarget=${input.sourcePageCount ?? 'n/a'} compactOnePage=${preparedCivil.compactOnePage ? 'yes' : 'no'} ` +
          `compactionRecommended=${preparedCivil.compactionRecommended ? 'yes' : 'no'} ` +
          `rows(before->after)=${preparedCivil.densityBefore.totalRows}->${preparedCivil.densityAfter.totalRows} ` +
          `narrativeChars(before->after)=${preparedCivil.densityBefore.totalNarrativeChars}->${preparedCivil.densityAfter.totalNarrativeChars} ` +
          `dedupeRowsRemoved=${preparedCivil.duplicateEntryRowsRemoved} ` +
          `dedupeNarrativeRemoved=${preparedCivil.duplicateNarrativeBlocksRemoved}`,
      );

      return {
        structuredHtml: renderCivilRecordGeneralHtml(preparedCivil.data, {
          pageCount: input.sourcePageCount,
          orientation: effectiveOrientation,
        }),
        orientationForKit: effectiveOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'identity_travel_record': {
      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          buildIdentityTravelRecordSystemPrompt(),
          messageContentFor(buildIdentityTravelRecordUserMessage()),
          8192,
          `${input.logPrefix} [identity-travel]`,
        ),
      );

      const parsed = parseStructuredJson<IdentityTravelRecord>(
        input.documentType,
        rawJson,
      );
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertPayloadLanguageIntegrity(input, parsed, languageIntegrity, 'preview');

      parsed.orientation = input.detectedOrientation;
      parsed.page_count = input.sourcePageCount ?? null;

      const effectiveOrientation: DocumentOrientation =
        input.detectedOrientation === 'unknown' ? 'portrait' : input.detectedOrientation;

      return {
        structuredHtml: renderIdentityTravelRecordHtml(parsed, {
          pageCount: input.sourcePageCount,
          orientation: effectiveOrientation,
        }),
        orientationForKit: effectiveOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'course_certificate_landscape': {
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
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertPayloadLanguageIntegrity(input, parsed, languageIntegrity, 'preview');

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
        rendererName,
        languageIntegrity,
      };
    }

    case 'academic_diploma_certificate': {
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
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertDiplomaPayloadLanguageIntegrity(input, parsed, languageIntegrity);

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
        rendererName,
        languageIntegrity,
      };
    }

    case 'academic_transcript': {
      const transcriptSystemPrompt = buildAcademicTranscriptSystemPrompt();
      const transcriptUserMessage = buildAcademicTranscriptUserMessage();
      const transcriptLogPrefix = `${input.logPrefix} [academic-transcript]`;

      const initialRawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          transcriptSystemPrompt,
          messageContentFor(transcriptUserMessage),
          8192,
          transcriptLogPrefix,
        ),
      );

      let strictParse = tryParseStrictJsonObject<AcademicTranscript>(initialRawJson);
      let rawForRepair = initialRawJson;

      if (!strictParse.ok) {
        const firstAttemptError = getJsonParseAttemptError(strictParse);
        console.warn(
          `${transcriptLogPrefix} strict JSON parse failed on first attempt: ${firstAttemptError}. Retrying once with strict JSON-only enforcement.`,
        );

        const retryRawJson = ensureExtractionJson(
          input.documentType,
          await callClaudeForJson(
            input.client,
            withStrictJsonRetryInstruction(transcriptSystemPrompt),
            messageContentFor(withStrictJsonRetryInstruction(transcriptUserMessage)),
            8192,
            `${transcriptLogPrefix} [json-retry]`,
          ),
        );

        strictParse = tryParseStrictJsonObject<AcademicTranscript>(retryRawJson);
        rawForRepair = retryRawJson;
      }

      let parsed: AcademicTranscript;
      if (strictParse.ok) {
        parsed = strictParse.value;
      } else {
        const repaired = tryRepairStructuredJsonObject<AcademicTranscript>(rawForRepair);
        if (repaired.ok) {
          console.warn(
            `${transcriptLogPrefix} strict JSON contract still violated after retry; repaired JSON object from wrapped output.`,
          );
          parsed = repaired.value;
        } else {
          const primaryParseError = getJsonParseAttemptError(strictParse);
          const repairError = getJsonParseAttemptError(repaired);
          throw new StructuredRenderingRequiredError(
            input.documentType,
            buildStructuredFailureMessage(
              input.documentType,
              `Claude returned invalid structured JSON after strict retry. Primary parse error: ${primaryParseError}. Repair error: ${repairError}`,
            ),
          );
        }
      }

      if (isInvalidOutputSentinel(parsed)) {
        throw new StructuredRenderingRequiredError(
          input.documentType,
          buildStructuredFailureMessage(
            input.documentType,
            'Claude returned {"error":"invalid_output"} for strict JSON contract.',
          ),
        );
      }

      assertExpectedDocumentTypeTag('academic_transcript', parsed);
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertPayloadLanguageIntegrity(input, parsed, languageIntegrity, 'preview');

      parsed.orientation = input.detectedOrientation;
      parsed.page_count = input.sourcePageCount ?? null;

      return {
        structuredHtml: renderAcademicTranscriptHtml(parsed, {
          pageCount: input.sourcePageCount,
          orientation: input.detectedOrientation,
        }),
        orientationForKit: input.detectedOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'academic_record_general': {
      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          buildAcademicRecordGeneralSystemPrompt(),
          messageContentFor(buildAcademicRecordGeneralUserMessage()),
          12288,
          `${input.logPrefix} [academic-general]`,
        ),
      );

      const parsed = parseStructuredJson<AcademicRecordGeneral>(
        input.documentType,
        rawJson,
      );
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertPayloadLanguageIntegrity(input, parsed, languageIntegrity, 'preview');

      parsed.orientation = input.detectedOrientation;
      parsed.page_count = input.sourcePageCount ?? null;

      const hasDenseSubjectTable = (parsed.subject_grade_table?.length ?? 0) >= 12;
      const effectiveOrientation: DocumentOrientation =
        input.detectedOrientation === 'unknown'
          ? hasDenseSubjectTable
            ? 'landscape'
            : 'portrait'
          : input.detectedOrientation;

      return {
        structuredHtml: renderAcademicRecordGeneralHtml(parsed, {
          pageCount: input.sourcePageCount,
          orientation: effectiveOrientation,
        }),
        orientationForKit: effectiveOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'employment_record': {
      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          buildEmploymentRecordSystemPrompt(),
          messageContentFor(buildEmploymentRecordUserMessage()),
          8192,
          `${input.logPrefix} [employment-record]`,
        ),
      );

      const parsed = parseStructuredJson<EmploymentRecord>(
        input.documentType,
        rawJson,
      );
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertPayloadLanguageIntegrity(input, parsed, languageIntegrity, 'preview');

      parsed.orientation = input.detectedOrientation;
      parsed.page_count = input.sourcePageCount ?? null;

      const effectiveOrientation: DocumentOrientation =
        input.detectedOrientation === 'unknown' ? 'portrait' : input.detectedOrientation;

      return {
        structuredHtml: renderEmploymentRecordHtml(parsed, {
          pageCount: input.sourcePageCount,
          orientation: effectiveOrientation,
          forceSignatureOnNewPage: (input.sourcePageCount ?? 1) >= 2,
        }),
        orientationForKit: effectiveOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'corporate_business_record': {
      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          buildCorporateBusinessRecordSystemPrompt(),
          messageContentFor(buildCorporateBusinessRecordUserMessage()),
          10240,
          `${input.logPrefix} [corporate-business-record]`,
        ),
      );

      const parsed = parseStructuredJson<CorporateBusinessRecord>(
        input.documentType,
        rawJson,
      );
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertPayloadLanguageIntegrity(input, parsed, languageIntegrity, 'preview');

      parsed.orientation = input.detectedOrientation;
      parsed.page_count = input.sourcePageCount ?? null;

      const effectiveOrientation: DocumentOrientation =
        input.detectedOrientation === 'unknown' ? 'portrait' : input.detectedOrientation;

      return {
        structuredHtml: renderCorporateBusinessRecordHtml(parsed, {
          pageCount: input.sourcePageCount,
          orientation: effectiveOrientation,
        }),
        orientationForKit: effectiveOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'editorial_news_pages': {
      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          buildSystemPromptWithParityNote(buildEditorialNewsPagesSystemPrompt(), input.documentType),
          messageContentFor(
            buildEditorialNewsPagesUserMessage({
              sourcePageCount: input.sourcePageCount ?? null,
            }),
          ),
          16384,
          `${input.logPrefix} [editorial-news-pages]`,
        ),
      );

      const parsed = parseStructuredJson<unknown>(
        input.documentType,
        rawJson,
      );
      const normalizedPayload = normalizeEditorialNewsPagesPayload(parsed);
      const languageIntegrity = buildEditorialNewsLanguageIntegrity(
        input,
        normalizedPayload,
      );

      console.log(
        `${input.logPrefix} [editorial-news-pages] language integrity diagnostics: ` +
          JSON.stringify({
            orderId: input.orderId ?? null,
            docId: input.documentId ?? null,
            family: 'editorial_news_pages',
            subtype: normalizedPayload.model_key,
            targetLanguage: languageIntegrity.targetLanguage,
            sourceLanguage: languageIntegrity.sourceLanguage,
            translatedPayloadFound: languageIntegrity.translatedPayloadFound ? 'yes' : 'no',
            requiredZones: languageIntegrity.requiredZones,
            translatedZonesFound: languageIntegrity.translatedZonesFound,
            translatedZonesCount: languageIntegrity.translatedZonesCount,
            sourceZonesCount: languageIntegrity.sourceZonesCount,
            missingTranslatedZones: languageIntegrity.missingTranslatedZones,
            sourceLanguageContaminatedZones:
              languageIntegrity.sourceLanguageContaminatedZones,
            sourceContentAttempted: languageIntegrity.sourceContentAttempted ? 'yes' : 'no',
            sourceLanguageMarkers: languageIntegrity.sourceLanguageMarkers,
            mappedGenericZones: languageIntegrity.mappedGenericZones,
            issueType: languageIntegrity.languageIssueType,
            issueIsMissingContent:
              languageIntegrity.languageIssueType ===
                'missing_translated_zones' ||
              languageIntegrity.languageIssueType ===
                'missing_and_source_language_mismatch',
            issueIsLanguageMismatch:
              languageIntegrity.languageIssueType ===
                'source_language_mismatch' ||
              languageIntegrity.languageIssueType ===
                'missing_and_source_language_mismatch',
          }),
      );

      if (languageIntegrity.languageIssueType !== 'none') {
        throw new StructuredRenderingRequiredError(
          input.documentType,
          buildStructuredFailureMessage(
            input.documentType,
            'Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface.',
          ),
        );
      }

      if (
        typeof input.sourcePageCount === 'number' &&
        input.sourcePageCount > 0 &&
        normalizedPayload.PAGES.length !== input.sourcePageCount
      ) {
        throw new StructuredRenderingRequiredError(
          input.documentType,
          buildStructuredFailureMessage(
            input.documentType,
            `Editorial/news page mismatch: source_page_count=${input.sourcePageCount} but structured_pages=${normalizedPayload.PAGES.length}.`,
          ),
        );
      }

      const effectiveOrientation: DocumentOrientation =
        input.detectedOrientation === 'unknown'
          ? inferEditorialNewsOrientation(normalizedPayload)
          : input.detectedOrientation;

      return {
        structuredHtml: renderEditorialNewsPagesHtml(normalizedPayload, {
          pageCount: input.sourcePageCount,
          orientation: effectiveOrientation,
        }),
        orientationForKit: effectiveOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'publication_media_record': {
      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          buildSystemPromptWithParityNote(buildPublicationMediaRecordSystemPrompt(), input.documentType),
          messageContentFor(buildPublicationMediaRecordUserMessage()),
          12288,
          `${input.logPrefix} [publication-media]`,
        ),
      );

      const parsed = parseStructuredJson<PublicationMediaRecord>(
        input.documentType,
        rawJson,
      );
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertPayloadLanguageIntegrity(input, parsed, languageIntegrity, 'preview');

      parsed.orientation = input.detectedOrientation;
      parsed.page_count = input.sourcePageCount ?? null;

      const effectiveOrientation: DocumentOrientation =
        input.detectedOrientation === 'unknown' ? 'portrait' : input.detectedOrientation;

      return {
        structuredHtml: renderPublicationMediaRecordHtml(parsed, {
          pageCount: input.sourcePageCount,
          orientation: effectiveOrientation,
        }),
        orientationForKit: effectiveOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'letters_and_statements': {
      // ── Pre-render diploma guard (label signal) ───────────────────────────
      // A 1-page document whose type label contains diploma/certificate keywords
      // must not be rendered through the letters/statements structured-block layout,
      // which reliably expands it onto a second page.  Re-route immediately.
      if (
        input.sourcePageCount === 1 &&
        hasDiplomaCandidateLabelSignal(input.documentTypeLabel)
      ) {
        console.log(
          `${input.logPrefix} [letters-and-statements] diploma candidate detected from label ` +
          `("${input.documentTypeLabel}") — rerouting to academic_diploma_certificate`,
        );
        return extractAndRenderAsDiploma(
          input, messageContentFor, defaultLanguageIntegrity, 'label_signal',
        );
      }

      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          buildLettersAndStatementsSystemPrompt(),
          messageContentFor(
            buildLettersAndStatementsUserMessage({
              sourcePageCount: input.sourcePageCount ?? null,
            }),
          ),
          16384,
          `${input.logPrefix} [letters-and-statements]`,
        ),
      );

      const parsed = parseStructuredJson<unknown>(
        input.documentType,
        rawJson,
      );
      const normalizedPayload = normalizeLettersAndStatementsPayload(parsed);

      // ── Post-extraction diploma guard (payload signal) ────────────────────
      // If Claude's extraction reveals diploma signals (detected_document_type,
      // suggested_family, or zone text) on a 1-page document, discard the
      // letters payload and re-extract with the diploma renderer instead.
      if (
        input.sourcePageCount === 1 &&
        hasDiplomaCandidatePayloadSignals(normalizedPayload)
      ) {
        console.log(
          `${input.logPrefix} [letters-and-statements] diploma candidate detected from payload ` +
          `(detected_type="${normalizedPayload.PAGES[0]?.PAGE_METADATA.detected_document_type ?? ''}" ` +
          `suggested_family="${normalizedPayload.PAGES[0]?.PAGE_METADATA.suggested_family ?? ''}") ` +
          `— rerouting to academic_diploma_certificate`,
        );
        return extractAndRenderAsDiploma(
          input, messageContentFor, defaultLanguageIntegrity, 'payload_signal',
        );
      }
      const languageIntegrity = buildLettersStatementsLanguageIntegrity(
        input,
        normalizedPayload,
      );

      console.log(
        `${input.logPrefix} [letters-and-statements] language integrity diagnostics: ` +
          JSON.stringify({
            orderId: input.orderId ?? null,
            docId: input.documentId ?? null,
            family: 'letters_and_statements',
            subtype: normalizedPayload.model_key,
            targetLanguage: languageIntegrity.targetLanguage,
            sourceLanguage: languageIntegrity.sourceLanguage,
            translatedPayloadFound: languageIntegrity.translatedPayloadFound ? 'yes' : 'no',
            requiredZones: languageIntegrity.requiredZones,
            translatedZonesFound: languageIntegrity.translatedZonesFound,
            translatedZonesCount: languageIntegrity.translatedZonesCount,
            sourceZonesCount: languageIntegrity.sourceZonesCount,
            missingTranslatedZones: languageIntegrity.missingTranslatedZones,
            sourceLanguageContaminatedZones:
              languageIntegrity.sourceLanguageContaminatedZones,
            sourceContentAttempted: languageIntegrity.sourceContentAttempted ? 'yes' : 'no',
            sourceLanguageMarkers: languageIntegrity.sourceLanguageMarkers,
            mappedGenericZones: languageIntegrity.mappedGenericZones,
            issueType: languageIntegrity.languageIssueType,
            issueIsMissingContent:
              languageIntegrity.languageIssueType ===
                'missing_translated_zones' ||
              languageIntegrity.languageIssueType ===
                'missing_and_source_language_mismatch',
            issueIsLanguageMismatch:
              languageIntegrity.languageIssueType ===
                'source_language_mismatch' ||
              languageIntegrity.languageIssueType ===
                'missing_and_source_language_mismatch',
          }),
      );

      if (languageIntegrity.languageIssueType !== 'none') {
        throw new StructuredRenderingRequiredError(
          input.documentType,
          buildStructuredFailureMessage(
            input.documentType,
            'Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface.',
          ),
        );
      }

      if (
        typeof input.sourcePageCount === 'number' &&
        input.sourcePageCount > 0 &&
        normalizedPayload.PAGES.length !== input.sourcePageCount
      ) {
        throw new StructuredRenderingRequiredError(
          input.documentType,
          buildStructuredFailureMessage(
            input.documentType,
            `Letters/statements page mismatch: source_page_count=${input.sourcePageCount} but structured_pages=${normalizedPayload.PAGES.length}.`,
          ),
        );
      }

      const effectiveOrientation: DocumentOrientation =
        input.detectedOrientation === 'unknown'
          ? inferLettersStatementsOrientation(normalizedPayload)
          : input.detectedOrientation;

      return {
        structuredHtml: renderLettersAndStatementsHtml(normalizedPayload, {
          pageCount: input.sourcePageCount,
          orientation: effectiveOrientation,
        }),
        orientationForKit: effectiveOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'recommendation_letter': {
      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          buildRecommendationLetterSystemPrompt(),
          messageContentFor(buildRecommendationLetterUserMessage()),
          12288,
          `${input.logPrefix} [recommendation-letter]`,
        ),
      );

      const parsed = parseStructuredJson<RecommendationLetter>(
        input.documentType,
        rawJson,
      );
      const languageIntegrity: StructuredRenderLanguageIntegrity = {
        ...defaultLanguageIntegrity,
        translatedPayloadFound: true,
      };
      assertPayloadLanguageIntegrity(input, parsed, languageIntegrity, 'preview');

      parsed.orientation = input.detectedOrientation;
      parsed.page_count = input.sourcePageCount ?? null;

      const effectiveOrientation: DocumentOrientation =
        input.detectedOrientation === 'unknown' ? 'portrait' : input.detectedOrientation;

      return {
        structuredHtml: renderRecommendationLetterHtml(parsed, {
          pageCount: input.sourcePageCount,
          orientation: effectiveOrientation,
        }),
        orientationForKit: effectiveOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'eb1_evidence_photo_sheet': {
      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          buildEb1EvidencePhotoSheetSystemPrompt(),
          messageContentFor(
            buildEb1EvidencePhotoSheetUserMessage({
              sourcePageCount: input.sourcePageCount ?? null,
            }),
          ),
          16384,
          `${input.logPrefix} [eb1-evidence-photo-sheet]`,
        ),
      );

      const parsed = parseStructuredJson<unknown>(
        input.documentType,
        rawJson,
      );
      const normalizedPayload = normalizeEb1EvidencePhotoSheetPayload(parsed);
      const languageIntegrity = buildEb1EvidenceLanguageIntegrity(
        input,
        normalizedPayload,
      );

      console.log(
        `${input.logPrefix} [eb1-evidence-photo-sheet] language integrity diagnostics: ` +
          JSON.stringify({
            orderId: input.orderId ?? null,
            docId: input.documentId ?? null,
            family: 'relationship_evidence',
            subtype: normalizedPayload.model_key,
            targetLanguage: languageIntegrity.targetLanguage,
            sourceLanguage: languageIntegrity.sourceLanguage,
            translatedPayloadFound: languageIntegrity.translatedPayloadFound ? 'yes' : 'no',
            requiredZones: languageIntegrity.requiredZones,
            translatedZonesFound: languageIntegrity.translatedZonesFound,
            translatedZonesCount: languageIntegrity.translatedZonesCount,
            sourceZonesCount: languageIntegrity.sourceZonesCount,
            missingTranslatedZones: languageIntegrity.missingTranslatedZones,
            sourceLanguageContaminatedZones:
              languageIntegrity.sourceLanguageContaminatedZones,
            sourceContentAttempted: languageIntegrity.sourceContentAttempted ? 'yes' : 'no',
            sourceLanguageMarkers: languageIntegrity.sourceLanguageMarkers,
            mappedGenericZones: languageIntegrity.mappedGenericZones,
            issueType: languageIntegrity.languageIssueType,
            issueIsMissingContent:
              languageIntegrity.languageIssueType ===
                'missing_translated_zones' ||
              languageIntegrity.languageIssueType ===
                'missing_and_source_language_mismatch',
            issueIsLanguageMismatch:
              languageIntegrity.languageIssueType ===
                'source_language_mismatch' ||
              languageIntegrity.languageIssueType ===
                'missing_and_source_language_mismatch',
          }),
      );

      if (languageIntegrity.languageIssueType !== 'none') {
        throw new StructuredRenderingRequiredError(
          input.documentType,
          buildStructuredFailureMessage(
            input.documentType,
            'Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface.',
          ),
        );
      }

      if (
        typeof input.sourcePageCount === 'number' &&
        input.sourcePageCount > 0 &&
        normalizedPayload.PAGES.length !== input.sourcePageCount
      ) {
        throw new StructuredRenderingRequiredError(
          input.documentType,
          buildStructuredFailureMessage(
            input.documentType,
            `EB1 evidence page mismatch: source_page_count=${input.sourcePageCount} but structured_pages=${normalizedPayload.PAGES.length}.`,
          ),
        );
      }

      const effectiveOrientation: DocumentOrientation =
        input.detectedOrientation === 'unknown'
          ? inferEb1EvidenceOrientation(normalizedPayload)
          : input.detectedOrientation;

      return {
        structuredHtml: renderEb1EvidencePhotoSheetHtml(normalizedPayload, {
          pageCount: input.sourcePageCount,
          orientation: effectiveOrientation,
        }),
        orientationForKit: effectiveOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    case 'birth_certificate_brazil': {
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
      assertBirthPayloadCompliance(parsed);
      const languageIntegrity = buildBirthLanguageIntegrity(input, parsed);
      console.log(
        `${input.logPrefix} [birth-cert] language integrity diagnostics: ` +
          JSON.stringify({
            orderId: input.orderId ?? null,
            docId: input.documentId ?? null,
            family: 'civil_records',
            subtype: 'birth_certificate_brazil',
            targetLanguage: languageIntegrity.targetLanguage,
            sourceLanguage: languageIntegrity.sourceLanguage,
            requiredZones: languageIntegrity.requiredZones,
            translatedZonesFound: languageIntegrity.translatedZonesFound,
            missingTranslatedZones: languageIntegrity.missingTranslatedZones,
            sourceLanguageContaminatedZones:
              languageIntegrity.sourceLanguageContaminatedZones,
            sourceLanguageMarkers: languageIntegrity.sourceLanguageMarkers,
            mappedGenericZones: languageIntegrity.mappedGenericZones,
            issueType: languageIntegrity.languageIssueType,
            issueIsMissingContent:
              languageIntegrity.languageIssueType ===
                'missing_translated_zones' ||
              languageIntegrity.languageIssueType ===
                'missing_and_source_language_mismatch',
            issueIsLanguageMismatch:
              languageIntegrity.languageIssueType ===
                'source_language_mismatch' ||
              languageIntegrity.languageIssueType ===
                'missing_and_source_language_mismatch',
          }),
      );
      if (languageIntegrity.languageIssueType !== 'none') {
        throw new StructuredRenderingRequiredError(
          input.documentType,
          buildStructuredFailureMessage(
            input.documentType,
            'Structured translated preview blocked: translated zone content missing or source-language content detected in translated client-facing surface.',
          ),
        );
      }

      parsed.orientation = input.detectedOrientation;
      parsed.page_count = input.sourcePageCount ?? null;

      return {
        structuredHtml: renderBirthCertificateHtml(parsed, {
          pageCount: input.sourcePageCount,
          orientation: input.detectedOrientation,
        }),
        orientationForKit: input.detectedOrientation,
        rendererName,
        languageIntegrity,
      };
    }

    default:
      throw new StructuredRenderingRequiredError(
        input.documentType,
        `Family mismatch: structured renderer dispatch has no branch for "${input.documentType}". Client-facing translated output is blocked.`,
      );
  }
}
