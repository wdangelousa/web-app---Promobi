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

type JsonObject = Record<string, unknown>;

const REGISTRY_KEY = 'translationArtifactRegistryV1';
const DELIVERY_STATUS_REGISTRY_KEY = 'deliveryDocumentStatusV1';

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
