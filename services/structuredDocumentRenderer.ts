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
import {
  detectSourceLanguageLeakageFromSegments,
  normalizeLanguageCode,
} from '@/lib/translatedLanguageIntegrity';
import type { DocumentType } from '@/services/documentClassifier';
import {
  detectDocumentFamily,
  getFamilyClientFacingCapabilityMap,
  getDocumentFamilyImplementationMatrixRow,
  getDocumentFamilyForType,
  getFamilyLayoutProfile,
  getFamilyRenderCapabilities,
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
  publication_media_record: 'publicationMediaRecordRenderer',
  recommendation_letter: 'recommendationLetterRenderer',
  employment_record: 'employmentRecordRenderer',
  course_certificate_landscape: 'certificateLandscapeRenderer',
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
  'publication_media_record',
  'recommendation_letter',
  'employment_record',
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
  const normalized = normalizeLanguageCode(input.sourceLanguage);
  if (normalized === 'PT') return 'PT';
  if (normalized === 'ES') return 'ES';
  return (input.sourceLanguage ?? 'unknown').toUpperCase();
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
      assertPayloadLanguageIntegrity(input, parsed, languageIntegrity, 'preview');

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

    case 'publication_media_record': {
      const rawJson = ensureExtractionJson(
        input.documentType,
        await callClaudeForJson(
          input.client,
          buildPublicationMediaRecordSystemPrompt(),
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
