import test from 'node:test'
import assert from 'node:assert/strict'

function normalizeUrgency(raw) {
  return String(raw || 'standard').trim().toLowerCase()
}

function resolveBusinessDays(urgency, settings) {
  const normalizedUrgency = normalizeUrgency(urgency)

  if (normalizedUrgency === 'flash' || normalizedUrgency === 'rush' || normalizedUrgency === 'rushes') {
    return 1
  }
  if (normalizedUrgency === 'urgent') {
    return Number.isFinite(settings.deadlineUrgent) && settings.deadlineUrgent > 0
      ? Math.floor(settings.deadlineUrgent)
      : 2
  }

  return Number.isFinite(settings.deadlineNormal) && settings.deadlineNormal > 0
    ? Math.floor(settings.deadlineNormal)
    : 10
}

function addBusinessDays(startDate, businessDays) {
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

function calculateDueDate(paidAt, urgency, settings) {
  const safePaidAt = new Date(paidAt)
  const businessDays = resolveBusinessDays(urgency, settings)
  const dueDate = addBusinessDays(safePaidAt, businessDays)

  return {
    dueDate,
    paidAt: safePaidAt,
    urgency,
    businessDays,
  }
}

function toDateOnly(input) {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate())
}

function getDeadlineStatus(dueDate, now = new Date()) {
  const due = toDateOnly(dueDate)
  const today = toDateOnly(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (due.getTime() < today.getTime()) return 'overdue'
  if (due.getTime() === today.getTime()) return 'due_today'
  if (due.getTime() === tomorrow.getTime()) return 'due_tomorrow'
  return 'upcoming'
}

function formatUtcDate(value) {
  return value.toISOString().slice(0, 10)
}

const SETTINGS = { deadlineNormal: 10, deadlineUrgent: 2 }

test('calculateDueDate standard -> 10 business days', () => {
  const result = calculateDueDate(new Date('2026-03-02T12:00:00Z'), 'standard', SETTINGS)
  assert.equal(result.businessDays, 10)
  assert.equal(formatUtcDate(result.dueDate), '2026-03-16')
})

test('calculateDueDate urgent -> 2 business days', () => {
  const result = calculateDueDate(new Date('2026-03-02T12:00:00Z'), 'urgent', SETTINGS)
  assert.equal(result.businessDays, 2)
  assert.equal(result.dueDate.toISOString(), '2026-03-04T12:00:00.000Z')
})

test('calculateDueDate flash -> 1 business day', () => {
  const result = calculateDueDate(new Date('2026-03-02T12:00:00Z'), 'flash', SETTINGS)
  assert.equal(result.businessDays, 1)
  assert.equal(result.dueDate.toISOString(), '2026-03-03T12:00:00.000Z')
})

test('sexta -> dueDate pula fim de semana', () => {
  const result = calculateDueDate(new Date('2026-03-06T12:00:00Z'), 'flash', SETTINGS)
  assert.equal(formatUtcDate(result.dueDate), '2026-03-09')
})

test('getDeadlineStatus ontem -> overdue', () => {
  const now = new Date('2026-03-10T15:00:00Z')
  const dueDate = new Date('2026-03-09T08:00:00Z')
  assert.equal(getDeadlineStatus(dueDate, now), 'overdue')
})

test('getDeadlineStatus hoje -> due_today', () => {
  const now = new Date('2026-03-10T15:00:00Z')
  const dueDate = new Date('2026-03-10T08:00:00Z')
  assert.equal(getDeadlineStatus(dueDate, now), 'due_today')
})

test('getDeadlineStatus amanhã -> due_tomorrow', () => {
  const now = new Date('2026-03-10T15:00:00Z')
  const dueDate = new Date('2026-03-11T08:00:00Z')
  assert.equal(getDeadlineStatus(dueDate, now), 'due_tomorrow')
})

test('getDeadlineStatus semana que vem -> upcoming', () => {
  const now = new Date('2026-03-10T15:00:00Z')
  const dueDate = new Date('2026-03-17T08:00:00Z')
  assert.equal(getDeadlineStatus(dueDate, now), 'upcoming')
})
