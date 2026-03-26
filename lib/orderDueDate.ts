export interface DueDateSettingsLike {
  deadlineNormal?: number | null
  deadlineUrgent?: number | null
}

function normalizePositiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

export function resolveDueDateOffsetDays(
  urgency: string | null | undefined,
  settings?: DueDateSettingsLike | null,
): number {
  const normalDays = normalizePositiveNumber(settings?.deadlineNormal) ?? 10
  const urgentDays = normalizePositiveNumber(settings?.deadlineUrgent) ?? 2

  if (urgency === 'flash') return 1
  if (urgency === 'urgent') return urgentDays
  return normalDays
}

export function calculateOrderDueDate(
  createdAt: Date | string | number | null | undefined,
  urgency: string | null | undefined,
  settings?: DueDateSettingsLike | null,
): Date | null {
  const start = normalizeDate(createdAt)
  if (!start) return null

  const dueDate = new Date(start)
  dueDate.setHours(12, 0, 0, 0)
  dueDate.setDate(dueDate.getDate() + resolveDueDateOffsetDays(urgency, settings))
  return dueDate
}

export function resolveStoredOrCalculatedDueDate(input: {
  dueDate?: Date | string | number | null
  createdAt?: Date | string | number | null
  urgency?: string | null
  settings?: DueDateSettingsLike | null
}): Date | null {
  return (
    normalizeDate(input.dueDate) ??
    calculateOrderDueDate(input.createdAt, input.urgency, input.settings)
  )
}

export function formatDueDateLabel(
  dueDate: Date | string | number | null | undefined,
  locale = 'pt-BR',
): string | null {
  const parsed = normalizeDate(dueDate)
  if (!parsed) return null
  return parsed.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
