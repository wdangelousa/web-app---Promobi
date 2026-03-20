export type TranslationArtifactSource =
  | 'external_pdf'
  | 'structured_internal'
  | 'legacy_internal';

export interface TranslationArtifactSelectionInput {
  externalTranslationUrl?: string | null;
  translatedText?: string | null;
  translatedFileUrl?: string | null;
}

export interface TranslationArtifactSelection {
  source: TranslationArtifactSource;
  externalTranslationUrlPresent: boolean;
  selectedArtifactUrl: string | null;
  hasTranslatedText: boolean;
  hasLegacyTranslatedFileUrl: boolean;
  reason:
    | 'external_translation_url_present'
    | 'translated_text_present'
    | 'legacy_translated_file_url_present'
    | 'fallback_structured_internal_default';
}

export interface DeliveryArtifactRegistryRecord {
  source: TranslationArtifactSource;
  selectedArtifactUrl: string | null;
  deliveryPdfUrl: string | null;
  generatedAt: string;
}

export interface DocumentDeliveryStatusRecord {
  deliveryStatus: 'sent';
  sentAt: string;
  sentBy: string | null;
  deliveryPdfUrl: string | null;
}

export type TranslationModeSelected =
  | 'standard'
  | 'faithful_layout'
  | 'external_pdf';

export type TranslationPipelineKey =
  | 'standard_structured'
  | 'anthropic_blueprint'
  | 'external_pdf';

export type TranslationSelectionSource =
  | 'ia_promobi_modal'
  | 'legacy_default';

export interface TranslationModeRegistryRecord {
  translationModeSelected: TranslationModeSelected;
  translationPipeline: TranslationPipelineKey;
  translationSelectionSource: TranslationSelectionSource;
  translationStatus: string;
  translationTriggeredBy: string | null;
  translationStartedAt: string | null;
  translationCompletedAt: string | null;
  translationError: string | null;
  updatedAt: string;
}

export type PageParityMode =
  | 'strict_all_pages'
  | 'content_pages_only'
  | 'first_page_only'
  | 'manual_override';

export type PageParityStatus =
  | 'approved_by_user'
  | 'strict_enforced';

export interface PageParityRegistryRecord {
  mode: PageParityMode;
  sourcePhysicalPageCount: number | null;
  sourceRelevantPageCount: number | null;
  translatedPageCount: number | null;
  status: PageParityStatus;
  justification: string | null;
  approvedByUserId: string | null;
  approvedAt: string;
  sourceArtifactType: string | null;
  sourcePageCountStrategy: string | null;
  translationArtifactSource: TranslationArtifactSource | 'unknown';
}

type JsonObject = Record<string, unknown>;

const REGISTRY_KEY = 'translationArtifactRegistryV1';
const DELIVERY_STATUS_REGISTRY_KEY = 'deliveryDocumentStatusV1';
const PAGE_PARITY_REGISTRY_KEY = 'pageParityRegistryV1';
const TRANSLATION_MODE_REGISTRY_KEY = 'translationModeRegistryV1';

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isPageParityMode(value: string | null): value is PageParityMode {
  return (
    value === 'strict_all_pages' ||
    value === 'content_pages_only' ||
    value === 'first_page_only' ||
    value === 'manual_override'
  );
}

function isPageParityStatus(value: string | null): value is PageParityStatus {
  return value === 'approved_by_user' || value === 'strict_enforced';
}

function normalizeTranslationArtifactSource(
  value: string | null,
): TranslationArtifactSource | 'unknown' {
  if (
    value === 'external_pdf' ||
    value === 'structured_internal' ||
    value === 'legacy_internal'
  ) {
    return value;
  }
  return 'unknown';
}

function isTranslationModeSelected(
  value: string | null,
): value is TranslationModeSelected {
  return (
    value === 'standard' ||
    value === 'faithful_layout' ||
    value === 'external_pdf'
  );
}

function isTranslationPipelineKey(
  value: string | null,
): value is TranslationPipelineKey {
  return (
    value === 'standard_structured' ||
    value === 'anthropic_blueprint' ||
    value === 'external_pdf'
  );
}

function isTranslationSelectionSource(
  value: string | null,
): value is TranslationSelectionSource {
  return value === 'ia_promobi_modal' || value === 'legacy_default';
}

export function resolveTranslationPipelineForMode(
  mode: TranslationModeSelected,
): TranslationPipelineKey {
  if (mode === 'faithful_layout') return 'anthropic_blueprint';
  if (mode === 'external_pdf') return 'external_pdf';
  return 'standard_structured';
}

export function resolveTranslationArtifactSelection(
  input: TranslationArtifactSelectionInput,
): TranslationArtifactSelection {
  const externalTranslationUrl = normalizeOptionalString(input.externalTranslationUrl);
  const translatedText = normalizeOptionalString(input.translatedText);
  const translatedFileUrl = normalizeOptionalString(input.translatedFileUrl);

  if (externalTranslationUrl) {
    return {
      source: 'external_pdf',
      externalTranslationUrlPresent: true,
      selectedArtifactUrl: externalTranslationUrl,
      hasTranslatedText: Boolean(translatedText),
      hasLegacyTranslatedFileUrl: Boolean(translatedFileUrl),
      reason: 'external_translation_url_present',
    };
  }

  if (translatedText) {
    return {
      source: 'structured_internal',
      externalTranslationUrlPresent: false,
      selectedArtifactUrl: null,
      hasTranslatedText: true,
      hasLegacyTranslatedFileUrl: Boolean(translatedFileUrl),
      reason: 'translated_text_present',
    };
  }

  if (translatedFileUrl) {
    return {
      source: 'legacy_internal',
      externalTranslationUrlPresent: false,
      selectedArtifactUrl: translatedFileUrl,
      hasTranslatedText: false,
      hasLegacyTranslatedFileUrl: true,
      reason: 'legacy_translated_file_url_present',
    };
  }

  return {
    source: 'structured_internal',
    externalTranslationUrlPresent: false,
    selectedArtifactUrl: null,
    hasTranslatedText: false,
    hasLegacyTranslatedFileUrl: false,
    reason: 'fallback_structured_internal_default',
  };
}

export function parseOrderMetadata(raw: string | null | undefined): JsonObject {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as JsonObject) : {};
  } catch {
    return {};
  }
}

export function readDeliveryArtifactRegistry(
  metadata: JsonObject,
): Record<string, DeliveryArtifactRegistryRecord> {
  const container = metadata[REGISTRY_KEY];
  if (!container || typeof container !== 'object') return {};

  const out: Record<string, DeliveryArtifactRegistryRecord> = {};
  for (const [docKey, value] of Object.entries(container as JsonObject)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as JsonObject;
    const source = normalizeOptionalString(record.source as string | null | undefined);
    const generatedAt = normalizeOptionalString(record.generatedAt as string | null | undefined);
    if (
      (source === 'external_pdf' ||
        source === 'structured_internal' ||
        source === 'legacy_internal') &&
      generatedAt
    ) {
      out[docKey] = {
        source,
        selectedArtifactUrl: normalizeOptionalString(
          record.selectedArtifactUrl as string | null | undefined,
        ),
        deliveryPdfUrl: normalizeOptionalString(
          record.deliveryPdfUrl as string | null | undefined,
        ),
        generatedAt,
      };
    }
  }
  return out;
}

export function upsertDeliveryArtifactRegistryRecord(
  metadata: JsonObject,
  docId: number,
  record: DeliveryArtifactRegistryRecord,
): JsonObject {
  const nextMetadata: JsonObject = { ...metadata };
  const registry = readDeliveryArtifactRegistry(nextMetadata);
  registry[String(docId)] = record;
  nextMetadata[REGISTRY_KEY] = registry;
  return nextMetadata;
}

export function getDeliveryArtifactRegistryRecord(
  metadata: JsonObject,
  docId: number,
): DeliveryArtifactRegistryRecord | null {
  const registry = readDeliveryArtifactRegistry(metadata);
  return registry[String(docId)] ?? null;
}

export function readDocumentDeliveryStatusRegistry(
  metadata: JsonObject,
): Record<string, DocumentDeliveryStatusRecord> {
  const container = metadata[DELIVERY_STATUS_REGISTRY_KEY];
  if (!container || typeof container !== 'object') return {};

  const out: Record<string, DocumentDeliveryStatusRecord> = {};
  for (const [docKey, value] of Object.entries(container as JsonObject)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as JsonObject;
    const deliveryStatus = normalizeOptionalString(
      record.deliveryStatus as string | null | undefined,
    );
    const sentAt = normalizeOptionalString(record.sentAt as string | null | undefined);
    const sentBy = normalizeOptionalString(record.sentBy as string | null | undefined);

    if (deliveryStatus === 'sent' && sentAt) {
      out[docKey] = {
        deliveryStatus: 'sent',
        sentAt,
        sentBy,
        deliveryPdfUrl: normalizeOptionalString(
          record.deliveryPdfUrl as string | null | undefined,
        ),
      };
    }
  }

  return out;
}

export function upsertDocumentDeliveryStatusRecord(
  metadata: JsonObject,
  docId: number,
  record: DocumentDeliveryStatusRecord,
): JsonObject {
  const nextMetadata: JsonObject = { ...metadata };
  const registry = readDocumentDeliveryStatusRegistry(nextMetadata);
  registry[String(docId)] = record;
  nextMetadata[DELIVERY_STATUS_REGISTRY_KEY] = registry;
  return nextMetadata;
}

export function getDocumentDeliveryStatusRecord(
  metadata: JsonObject,
  docId: number,
): DocumentDeliveryStatusRecord | null {
  const registry = readDocumentDeliveryStatusRegistry(metadata);
  return registry[String(docId)] ?? null;
}

export function readPageParityRegistry(
  metadata: JsonObject,
): Record<string, PageParityRegistryRecord> {
  const container = metadata[PAGE_PARITY_REGISTRY_KEY];
  if (!container || typeof container !== 'object') return {};

  const out: Record<string, PageParityRegistryRecord> = {};
  for (const [docKey, value] of Object.entries(container as JsonObject)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as JsonObject;

    const modeRaw = normalizeOptionalString(record.mode as string | null | undefined);
    const statusRaw = normalizeOptionalString(
      record.status as string | null | undefined,
    );
    const approvedAt = normalizeOptionalString(
      record.approvedAt as string | null | undefined,
    );

    if (!isPageParityMode(modeRaw) || !isPageParityStatus(statusRaw) || !approvedAt) {
      continue;
    }

    out[docKey] = {
      mode: modeRaw,
      sourcePhysicalPageCount: normalizeOptionalNumber(record.sourcePhysicalPageCount),
      sourceRelevantPageCount: normalizeOptionalNumber(record.sourceRelevantPageCount),
      translatedPageCount: normalizeOptionalNumber(record.translatedPageCount),
      status: statusRaw,
      justification: normalizeOptionalString(
        record.justification as string | null | undefined,
      ),
      approvedByUserId: normalizeOptionalString(
        record.approvedByUserId as string | null | undefined,
      ),
      approvedAt,
      sourceArtifactType: normalizeOptionalString(
        record.sourceArtifactType as string | null | undefined,
      ),
      sourcePageCountStrategy: normalizeOptionalString(
        record.sourcePageCountStrategy as string | null | undefined,
      ),
      translationArtifactSource: normalizeTranslationArtifactSource(
        normalizeOptionalString(
          record.translationArtifactSource as string | null | undefined,
        ),
      ),
    };
  }

  return out;
}

export function upsertPageParityRegistryRecord(
  metadata: JsonObject,
  docId: number,
  record: PageParityRegistryRecord,
): JsonObject {
  const nextMetadata: JsonObject = { ...metadata };
  const registry = readPageParityRegistry(nextMetadata);
  registry[String(docId)] = record;
  nextMetadata[PAGE_PARITY_REGISTRY_KEY] = registry;
  return nextMetadata;
}

export function getPageParityRegistryRecord(
  metadata: JsonObject,
  docId: number,
): PageParityRegistryRecord | null {
  const registry = readPageParityRegistry(metadata);
  return registry[String(docId)] ?? null;
}

export function readTranslationModeRegistry(
  metadata: JsonObject,
): Record<string, TranslationModeRegistryRecord> {
  const container = metadata[TRANSLATION_MODE_REGISTRY_KEY];
  if (!container || typeof container !== 'object') return {};

  const out: Record<string, TranslationModeRegistryRecord> = {};
  for (const [docKey, value] of Object.entries(container as JsonObject)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as JsonObject;

    const mode = normalizeOptionalString(
      record.translationModeSelected as string | null | undefined,
    );
    const pipeline = normalizeOptionalString(
      record.translationPipeline as string | null | undefined,
    );
    const source = normalizeOptionalString(
      record.translationSelectionSource as string | null | undefined,
    );
    const status = normalizeOptionalString(
      record.translationStatus as string | null | undefined,
    );
    const updatedAt = normalizeOptionalString(
      record.updatedAt as string | null | undefined,
    );

    if (
      !isTranslationModeSelected(mode) ||
      !isTranslationPipelineKey(pipeline) ||
      !isTranslationSelectionSource(source) ||
      !status ||
      !updatedAt
    ) {
      continue;
    }

    out[docKey] = {
      translationModeSelected: mode,
      translationPipeline: pipeline,
      translationSelectionSource: source,
      translationStatus: status,
      translationTriggeredBy: normalizeOptionalString(
        record.translationTriggeredBy as string | null | undefined,
      ),
      translationStartedAt: normalizeOptionalString(
        record.translationStartedAt as string | null | undefined,
      ),
      translationCompletedAt: normalizeOptionalString(
        record.translationCompletedAt as string | null | undefined,
      ),
      translationError: normalizeOptionalString(
        record.translationError as string | null | undefined,
      ),
      updatedAt,
    };
  }

  return out;
}

export function upsertTranslationModeRegistryRecord(
  metadata: JsonObject,
  docId: number,
  record: TranslationModeRegistryRecord,
): JsonObject {
  const nextMetadata: JsonObject = { ...metadata };
  const registry = readTranslationModeRegistry(nextMetadata);
  registry[String(docId)] = record;
  nextMetadata[TRANSLATION_MODE_REGISTRY_KEY] = registry;
  return nextMetadata;
}

export function getTranslationModeRegistryRecord(
  metadata: JsonObject,
  docId: number,
): TranslationModeRegistryRecord | null {
  const registry = readTranslationModeRegistry(metadata);
  return registry[String(docId)] ?? null;
}
