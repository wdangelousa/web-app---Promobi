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
}

export interface StructuredRenderOutput {
  structuredHtml: string;
  orientationForKit: DocumentOrientation;
  rendererName: string;
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
        };
      }

      const parsedLegacy = parsed as CivilRecordGeneral;

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

      parsed.orientation = input.detectedOrientation;
      parsed.page_count = input.sourcePageCount ?? null;

      return {
        structuredHtml: renderAcademicTranscriptHtml(parsed, {
          pageCount: input.sourcePageCount,
          orientation: input.detectedOrientation,
        }),
        orientationForKit: input.detectedOrientation,
        rendererName,
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

      parsed.orientation = input.detectedOrientation;
      parsed.page_count = input.sourcePageCount ?? null;

      return {
        structuredHtml: renderBirthCertificateHtml(parsed, {
          pageCount: input.sourcePageCount,
          orientation: input.detectedOrientation,
        }),
        orientationForKit: input.detectedOrientation,
        rendererName,
      };
    }

    default:
      throw new StructuredRenderingRequiredError(
        input.documentType,
        `Family mismatch: structured renderer dispatch has no branch for "${input.documentType}". Client-facing translated output is blocked.`,
      );
  }
}
