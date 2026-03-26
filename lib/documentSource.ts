function normalizeOptionalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export interface DocumentSourceCandidate {
  scopedFileUrl?: string | null
  originalFileUrl?: string | null
}

export function resolveDocumentSourceFileUrl(
  doc: DocumentSourceCandidate | null | undefined,
): string | null {
  const scoped = normalizeOptionalUrl(doc?.scopedFileUrl)
  const original = normalizeOptionalUrl(doc?.originalFileUrl)
  const selected = scoped || original
  if (!selected || selected === 'PENDING_UPLOAD') return null
  return selected
}

export function resolveDocumentSourceKind(
  doc: DocumentSourceCandidate | null | undefined,
): 'scoped' | 'original' | 'missing' {
  if (normalizeOptionalUrl(doc?.scopedFileUrl)) return 'scoped'
  if (normalizeOptionalUrl(doc?.originalFileUrl)) return 'original'
  return 'missing'
}
