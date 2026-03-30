import {
  getTranslationModeRegistryRecord,
  type TranslationModeRegistryRecord,
} from '@/lib/translationArtifactSource'

export const TRANSLATION_LOCK_TIMEOUT_MS = 5 * 60 * 1000
export const STALE_TRANSLATION_LOCK_ERROR = 'Stale lock released after timeout'

export interface TranslationLockState {
  record: TranslationModeRegistryRecord | null
  translationStartedAt: string | null
  startedAtMs: number | null
  staleDurationMs: number | null
  isStale: boolean
}

function parseStartedAtMs(translationStartedAt: string | null | undefined): number | null {
  if (!translationStartedAt) return null
  const parsed = Date.parse(translationStartedAt)
  return Number.isFinite(parsed) ? parsed : null
}

export function getTranslationLockState(
  metadata: Record<string, unknown>,
  docId: number,
  nowMs: number = Date.now(),
): TranslationLockState {
  const record = getTranslationModeRegistryRecord(metadata, docId)
  const translationStartedAt = record?.translationStartedAt ?? null
  const startedAtMs = parseStartedAtMs(translationStartedAt)
  const staleDurationMs =
    startedAtMs !== null && nowMs >= startedAtMs
      ? nowMs - startedAtMs
      : null

  return {
    record,
    translationStartedAt,
    startedAtMs,
    staleDurationMs,
    isStale:
      staleDurationMs !== null &&
      staleDurationMs > TRANSLATION_LOCK_TIMEOUT_MS,
  }
}
