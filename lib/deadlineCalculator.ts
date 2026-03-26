export type DeadlineStatus = 'overdue' | 'due_today' | 'due_tomorrow' | 'upcoming'

export interface DeadlineSettings {
  deadlineNormal: number
  deadlineUrgent: number
}

export interface DeadlineResult {
  dueDate: Date
  paidAt: Date
  urgency: string
  businessDays: number
}

const DEFAULT_SETTINGS: DeadlineSettings = {
  deadlineNormal: 10,
  deadlineUrgent: 2,
}

function normalizeUrgency(raw: string | null | undefined): string {
  return String(raw || 'standard').trim().toLowerCase()
}

function resolveBusinessDays(
  urgency: string,
  settings: DeadlineSettings,
): number {
  const normalizedUrgency = normalizeUrgency(urgency)

  if (normalizedUrgency === 'flash' || normalizedUrgency === 'rush' || normalizedUrgency === 'rushes') {
    return 1
  }
  if (normalizedUrgency === 'urgent') {
    return Number.isFinite(settings.deadlineUrgent) && settings.deadlineUrgent > 0
      ? Math.floor(settings.deadlineUrgent)
      : DEFAULT_SETTINGS.deadlineUrgent
  }

  return Number.isFinite(settings.deadlineNormal) && settings.deadlineNormal > 0
    ? Math.floor(settings.deadlineNormal)
    : DEFAULT_SETTINGS.deadlineNormal
}

export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate)
  let remaining = Math.max(0, Math.floor(businessDays))

  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day === 0 || day === 6) continue
    remaining -= 1
  }

  return result
}

export function calculateDueDate(
  paidAt: Date,
  urgency: string,
  settings: DeadlineSettings,
): DeadlineResult {
  const safePaidAt = new Date(paidAt)
  const mergedSettings: DeadlineSettings = {
    deadlineNormal: settings?.deadlineNormal ?? DEFAULT_SETTINGS.deadlineNormal,
    deadlineUrgent: settings?.deadlineUrgent ?? DEFAULT_SETTINGS.deadlineUrgent,
  }
  const businessDays = resolveBusinessDays(urgency, mergedSettings)
  const dueDate = addBusinessDays(safePaidAt, businessDays)

  return {
    dueDate,
    paidAt: safePaidAt,
    urgency,
    businessDays,
  }
}

export function getDeadlineLabel(
  urgency: string,
  settings: DeadlineSettings,
): string {
  const mergedSettings: DeadlineSettings = {
    deadlineNormal: settings?.deadlineNormal ?? DEFAULT_SETTINGS.deadlineNormal,
    deadlineUrgent: settings?.deadlineUrgent ?? DEFAULT_SETTINGS.deadlineUrgent,
  }
  const businessDays = resolveBusinessDays(urgency, mergedSettings)
  return `${businessDays} business day${businessDays === 1 ? '' : 's'}`
}

function toDateOnly(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate())
}

export function getDeadlineStatus(
  dueDate: Date,
  now: Date = new Date(),
): DeadlineStatus {
  const due = toDateOnly(dueDate)
  const today = toDateOnly(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (due.getTime() < today.getTime()) return 'overdue'
  if (due.getTime() === today.getTime()) return 'due_today'
  if (due.getTime() === tomorrow.getTime()) return 'due_tomorrow'
  return 'upcoming'
}
